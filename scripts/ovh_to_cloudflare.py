#!/usr/bin/env python3
"""
OVH to Cloudflare Domain Migration & Email Forwarding Tool
==========================================================
Automates:
1. Adding domain to Cloudflare (Zone creation)
2. Updating Nameservers at OVH via OVH API
3. Creating DNS A & CNAME records (pointing to server IP)
4. Configuring Cloudflare Email Routing (MX, SPF, DMARC)
5. Adding destination email forwarding rules
"""

import argparse
import os
import sys
import time
import subprocess
import requests

def load_secrets():
    secrets_file = os.path.expanduser("~/.secrets.zsh")
    if os.path.exists(secrets_file):
        with open(secrets_file, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("export ") and "=" in line:
                    key_val = line.replace("export ", "", 1)
                    key, val = key_val.split("=", 1)
                    val = val.strip("'\"")
                    os.environ[key] = val

def get_ovh_client(ak=None, as_=None, ck=None, endpoint="ovh-eu"):
    try:
        import ovh
    except ImportError:
        print("Installing 'ovh' Python package...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "ovh"])
        import ovh

    ak = ak or os.environ.get("OVH_APPLICATION_KEY")
    as_ = as_ or os.environ.get("OVH_APPLICATION_SECRET")
    ck = ck or os.environ.get("OVH_CONSUMER_KEY")

    if ak and as_ and ck:
        return ovh.Client(
            endpoint=endpoint,
            application_key=ak,
            application_secret=as_,
            consumer_key=ck
        )
    return ovh.Client()

def get_or_create_cf_zone(domain, cf_token, account_id=None):
    headers = {
        "Authorization": f"Bearer {cf_token}",
        "Content-Type": "application/json"
    }
    # Check if zone exists
    r = requests.get(f"https://api.cloudflare.com/client/v4/zones?name={domain}", headers=headers)
    data = r.json()
    if data.get("success") and data.get("result"):
        zone = data["result"][0]
        return zone["id"], zone.get("name_servers", []), zone.get("account", {}).get("id")

    # If account_id not provided, try to find one
    if not account_id:
        r = requests.get("https://api.cloudflare.com/client/v4/zones", headers=headers)
        zdata = r.json()
        if zdata.get("result"):
            account_id = zdata["result"][0].get("account", {}).get("id")

    if not account_id:
        raise ValueError("Could not determine Cloudflare account ID. Please pass --account-id")

    # Create zone
    print(f"Creating zone {domain} on Cloudflare...")
    payload = {"name": domain, "type": "full", "account": {"id": account_id}}
    r = requests.post("https://api.cloudflare.com/client/v4/zones", headers=headers, json=payload)
    res = r.json()
    if not res.get("success"):
        raise RuntimeError(f"Failed to create zone on Cloudflare: {res.get('errors')}")
    zone = res["result"]
    return zone["id"], zone.get("name_servers", []), account_id

def wait_for_cloudflare_ns_ready(domain, nameservers, timeout=60):
    print(f"Verifying Cloudflare nameservers ({nameservers}) respond to DNS queries for {domain}...")
    start = time.time()
    for ns in nameservers:
        while time.time() - start < timeout:
            try:
                res = subprocess.run(["dig", f"@{ns}", domain, "NS", "+short"], capture_output=True, text=True)
                if ns in res.stdout:
                    print(f"  ✓ {ns} is responding for {domain}")
                    break
            except Exception:
                pass
            time.sleep(2)

def update_ovh_nameservers(ovh_client, domain, nameservers):
    print(f"Updating OVH nameservers for {domain} to: {nameservers}...")
    payload = {"nameServers": [{"host": ns} for ns in nameservers]}
    try:
        res = ovh_client.post(f"/domain/{domain}/nameServers/update", **payload)
        print(f"  ✓ OVH task created: ID {res.get('id')} ({res.get('status')})")
        return res
    except Exception as e:
        print(f"  ✗ OVH update error: {e}")
        raise

def add_dns_records(zone_id, cf_token, domain, server_ip=None):
    headers = {
        "Authorization": f"Bearer {cf_token}",
        "Content-Type": "application/json"
    }

    records = [
        {"type": "MX", "name": domain, "content": "route1.mx.cloudflare.net", "priority": 48, "proxied": False, "ttl": 1},
        {"type": "MX", "name": domain, "content": "route2.mx.cloudflare.net", "priority": 74, "proxied": False, "ttl": 1},
        {"type": "MX", "name": domain, "content": "route3.mx.cloudflare.net", "priority": 89, "proxied": False, "ttl": 1},
        {"type": "TXT", "name": domain, "content": "v=spf1 include:_spf.mx.cloudflare.net ~all", "proxied": False, "ttl": 1},
        {"type": "TXT", "name": f"_dmarc.{domain}", "content": "v=DMARC1; p=none;", "proxied": False, "ttl": 1}
    ]

    if server_ip:
        records.insert(0, {"type": "A", "name": domain, "content": server_ip, "proxied": True, "ttl": 1})
        records.insert(1, {"type": "CNAME", "name": f"www.{domain}", "content": domain, "proxied": True, "ttl": 1})

    print(f"Configuring DNS records on Cloudflare zone {zone_id}...")
    for rec in records:
        r = requests.post(f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records", headers=headers, json=rec)
        res = r.json()
        if res.get("success"):
            print(f"  ✓ Created {rec['type']} {rec['name']} -> {rec['content']}")
        else:
            errors = res.get("errors", [])
            msg = errors[0].get("message") if errors else "exists"
            print(f"  ℹ {rec['type']} {rec['name']}: {msg}")

def setup_email_forwarding(account_id, zone_id, cf_token, domain, forward_to, forward_from="contact"):
    headers = {
        "Authorization": f"Bearer {cf_token}",
        "Content-Type": "application/json"
    }
    custom_email = f"{forward_from}@{domain}"

    # 1. Add destination email
    r = requests.post(f"https://api.cloudflare.com/client/v4/accounts/{account_id}/email/routing/addresses", headers=headers, json={"email": forward_to})
    res = r.json()
    if res.get("success"):
        print(f"  ✓ Destination address {forward_to} added (verification email sent).")
    else:
        print(f"  ℹ Destination address status: {res.get('errors')}")

    # 2. Check verification status
    r = requests.get(f"https://api.cloudflare.com/client/v4/accounts/{account_id}/email/routing/addresses", headers=headers)
    addrs = r.json().get("result") or []
    verified = False
    for a in addrs:
        if a.get("email") == forward_to and a.get("status") == "verified":
            verified = True
            break

    if not verified:
        print(f"\n⚠️  Action required: Please open the verification email in {forward_to} and click 'Verify email address'.")
        print(f"   Then rerun this script to activate the routing rule: {custom_email} -> {forward_to}")
        return False

    # 3. Create routing rule
    rule_payload = {
        "matchers": [{"type": "literal", "field": "to", "value": custom_email}],
        "actions": [{"type": "forward", "value": [forward_to]}],
        "name": f"Forward {custom_email} to {forward_to}",
        "enabled": True,
        "priority": 0
    }
    r = requests.post(f"https://api.cloudflare.com/client/v4/zones/{zone_id}/email/routing/rules", headers=headers, json=rule_payload)
    r_data = r.json()
    if r_data.get("success"):
        print(f"  ✓ Activated email routing rule: {custom_email} -> {forward_to}")
        return True
    else:
        print(f"  ℹ Routing rule status: {r_data.get('errors')}")
        return False

def print_status(domain, cf_token, ovh_client):
    headers = {"Authorization": f"Bearer {cf_token}"}
    r = requests.get(f"https://api.cloudflare.com/client/v4/zones?name={domain}", headers=headers)
    data = r.json()
    print(f"\n=== Status Report for {domain} ===")
    if data.get("result"):
        zone = data["result"][0]
        print(f"Cloudflare Zone: {zone['id']} (Status: {zone['status']})")
        print(f"Assigned NS: {zone.get('name_servers')}")
    else:
        print("Cloudflare Zone: Not found")

    try:
        ovh_info = ovh_client.get(f"/domain/{domain}")
        print(f"OVH State: {ovh_info.get('state')}")
        ns_list = ovh_client.get(f"/domain/{domain}/nameServer")
        print(f"OVH NameServers configured: {ns_list}")
    except Exception as e:
        print(f"OVH Query: {e}")

def main():
    load_secrets()
    parser = argparse.ArgumentParser(description="Migrate domain from OVH to Cloudflare and setup Email Forwarding")
    parser.add_argument("--domain", "-d", required=True, help="Domain name (e.g. rosee-minerale.fr)")
    parser.add_argument("--forward-to", "-t", required=True, help="Destination email to forward to (e.g. user@gmail.com)")
    parser.add_argument("--forward-from", "-f", default="contact", help="Alias username (default: contact)")
    parser.add_argument("--ip", default="135.181.95.61", help="Web server IP address for A record (default: 135.181.95.61)")
    parser.add_argument("--status-only", action="store_true", help="Only check status")
    args = parser.parse_args()

    cf_token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not cf_token:
        print("Error: CLOUDFLARE_API_TOKEN not found in environment or ~/.secrets.zsh")
        sys.exit(1)

    ovh_client = get_ovh_client()

    if args.status_only:
        print_status(args.domain, cf_token, ovh_client)
        sys.exit(0)

    print(f"Starting migration for {args.domain}...")
    zone_id, nameservers, account_id = get_or_create_cf_zone(args.domain, cf_token)
    print(f"Cloudflare Zone ID: {zone_id}")
    print(f"Cloudflare Nameservers: {nameservers}")

    wait_for_cloudflare_ns_ready(args.domain, nameservers)
    update_ovh_nameservers(ovh_client, args.domain, nameservers)
    add_dns_records(zone_id, cf_token, args.domain, args.ip)
    setup_email_forwarding(account_id, zone_id, cf_token, args.domain, args.forward_to, args.forward_from)

    print("\n✅ Migration process completed successfully!")

if __name__ == "__main__":
    main()
