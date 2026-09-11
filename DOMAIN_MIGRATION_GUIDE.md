# OVH to Cloudflare Domain Migration & Email Routing Guide

This guide describes how to automatically delegate a domain registered on OVH to Cloudflare, configure web server DNS records, and enable free email forwarding (e.g. `contact@domain.com` ➔ `user@gmail.com`).

---

## 1. Prerequisites & Credentials

Ensure the following credentials exist in your `~/.secrets.zsh` and `~/.ovh.conf`:

### Cloudflare API Token
Needs custom permissions on your Cloudflare account:
- **Zone** > **Zone** > **Edit**
- **Zone** > **DNS** > **Edit**
- **Account** > **Email Routing Addresses** > **Edit**
- **Zone** > **Email Routing Rules** > **Edit**

Stored in `~/.secrets.zsh`:
```bash
export CLOUDFLARE_API_TOKEN="your_cloudflare_api_token"
```

### OVH API Keys
Generate API keys from the [OVH API Token Generator](https://www.ovh.com/auth/api/createToken?GET=/domain/*&POST=/domain/*&PUT=/domain/*&DELETE=/domain/*).

Stored in `~/.secrets.zsh`:
```bash
export OVH_APPLICATION_KEY="your_application_key"
export OVH_APPLICATION_SECRET="your_application_secret"
export OVH_CONSUMER_KEY="your_consumer_key"
```
And in `~/.ovh.conf`:
```ini
[default]
endpoint=ovh-eu
application_key=your_application_key
application_secret=your_application_secret
consumer_key=your_consumer_key
```

---

## 2. Using the Automated Script

The CLI script is located in `scripts/ovh_to_cloudflare.py`.

### Full Migration & Email Setup
```bash
python3 scripts/ovh_to_cloudflare.py \
  --domain mydomain.fr \
  --forward-to myemail@gmail.com \
  --forward-from contact \
  --ip 135.181.95.61
```

### What It Does Automatically:
1. **Cloudflare Zone**: Checks or creates the zone on Cloudflare and fetches assigned nameservers (e.g., `autumn.ns.cloudflare.com`, `matteo.ns.cloudflare.com`).
2. **Registry NS Validation**: Verifies that Cloudflare nameservers are actively answering NS queries for the domain (required by AFNIC `.fr` registry rules).
3. **OVH Nameserver Update**: Calls the OVH API `POST /domain/{domain}/nameServers/update` to delegate the domain to Cloudflare.
4. **DNS Records**: Provisions:
   - `A` `mydomain.fr` ➔ `135.181.95.61` (Proxied)
   - `CNAME` `www.mydomain.fr` ➔ `mydomain.fr` (Proxied)
   - `MX` `route1.mx.cloudflare.net` (48), `route2.mx.cloudflare.net` (74), `route3.mx.cloudflare.net` (89)
   - `TXT` SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`
   - `TXT` DMARC `v=DMARC1; p=none;`
5. **Email Routing**:
   - Adds destination address `myemail@gmail.com` (triggers Cloudflare verification email).
   - Once verified, creates the rule `contact@mydomain.fr` ➔ `myemail@gmail.com`.

### Check Status
```bash
python3 scripts/ovh_to_cloudflare.py --domain mydomain.fr --forward-to myemail@gmail.com --status-only
```

---

## 3. Important Registry & Verification Notes

- **AFNIC (`.fr` domains)**: AFNIC rejects nameserver changes if the target nameservers do not yet have an active zone file answering queries. The script automatically handles this check.
- **Gmail Destination Verification**: Cloudflare requires a one-time verification click for new destination Gmail addresses. Once verified, rerun the script to activate the routing rule.
