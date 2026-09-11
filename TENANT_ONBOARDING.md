# Tenant Onboarding System

This SvelteKit application includes a complete multi-tenant onboarding system that automates the setup of new tenants with their own domain, email service, and GitHub repository.

## Architecture

```
Tenant Request
    ↓
Onboarding API (/api/tenant/onboard)
    ↓
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│   GitHub     │   AWS SES    │  Cloudflare  │   Stalwart   │ Kubernetes   │
│   (Repo)     │  (Email)     │    (DNS)     │   (Mail)     │  (Ingress)   │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
    ↓
Tenant Ready with:
- GitHub repository with website template
- Domain verified for email sending
- DNS records (mail.domain.com, DKIM, etc.)
- Stalwart mail user account
- Kubernetes ingress with SSL
- SMTP credentials for Gmail Send As
```

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in all required values:

```bash
# Admin authentication
ADMIN_PASSWORD=your-secure-admin-password

# Server configuration
SERVER_IP=135.181.95.61

# Cloudflare (DNS management)
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ZONE_ID=your-cloudflare-zone-id

# GitHub (Repository creation)
GITHUB_TOKEN=your-github-personal-access-token
GITHUB_ORG=ether-paris

# AWS SES (Email service)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1

# Stalwart Mail Server
STALWART_API_URL=https://mail.ether.paris/api
STALWART_ADMIN_USER=admin
STALWART_ADMIN_PASSWORD=your-stalwart-admin-password
```

### 2. Required Permissions

#### Cloudflare API Token

- Zone:Read, Zone:Edit
- DNS:Read, DNS:Edit

#### GitHub Personal Access Token

- repo (full control of private repositories)
- workflow (update GitHub Action workflow files)

#### AWS IAM User

- ses:CreateEmailIdentity
- ses:GetEmailIdentity
- ses:VerifyDomainDkim

#### Kubernetes

The app must run inside the Kubernetes cluster with kubectl access to create ingress resources.

## Usage

### Web Interface

1. Navigate to `/admin/tenant-onboarding`
2. Enter:
   - **Admin Password**: Your ADMIN_PASSWORD from .env
   - **Brand Name**: The tenant's business name
   - **Domain**: Their domain (e.g., mybusiness.com)
   - **Admin Email**: Their admin email address
3. Click "Start Onboarding"
4. The process runs asynchronously and sets up everything automatically

### API Usage

```bash
curl -X POST https://ether.paris/api/tenant/onboard \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_PASSWORD" \
  -d '{
    "domain": "mybusiness.com",
    "email": "admin@mybusiness.com",
    "brandName": "My Business"
  }'
```

### Check Tenant Status

```bash
curl https://ether.paris/api/tenant/onboard?domain=mybusiness.com \
  -H "Authorization: Bearer YOUR_ADMIN_PASSWORD"
```

## What Gets Created

### 1. GitHub Repository

- Location: `https://github.com/ether-paris/{domain-name}`
- Private repository
- Contains:
  - README.md with brand name and setup instructions
  - index.html with basic website template
  - k8s/deployment.yaml for Kubernetes deployment
  - .github/workflows/deploy.yaml for CI/CD

### 2. AWS SES

- Domain identity created and pending verification
- DKIM signing enabled
- Domain verification token for DNS

### 3. Cloudflare DNS Records

- `mail.{domain}` → A record to your server IP
- `_amazonses.{domain}` → TXT record for SES verification
- 3 CNAME records for DKIM signing

### 4. Stalwart Mail Server

- Domain added to Stalwart
- User account created: `{email-username}@{domain}`
- Secure password generated
- User has email-send and email-receive roles

### 5. Kubernetes Ingress

- Ingress created in `mail-server` namespace
- Host: `mail.{domain}`
- SSL certificate auto-provisioned by cert-manager
- Routes to Stalwart mail server

## Tenant Access After Onboarding

Once onboarding is complete, the tenant can:

1. **Access Mail Server**: https://mail.{domain}
   - Username: Full email address (e.g., admin@mybusiness.com)
   - Password: Generated during onboarding (check tenant record in database)

2. **Configure Gmail Send As**:
   - Go to Gmail Settings → Accounts and Import → Send mail as
   - Add another email address
   - SMTP Server: `mail.{domain}:587`
   - Username: Full email address
   - Password: (from onboarding)
   - Enable TLS

3. **Access GitHub Repo**:
   - Repository: `https://github.com/ether-paris/{domain-name}`
   - Contains website template and deployment configs
   - Push to main branch to deploy automatically

## Database Schema

Tenants are stored in the SQLite database with the following fields:

```sql
CREATE TABLE tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  brand_name TEXT,
  github_repo TEXT,
  aws_ses_verified BOOLEAN DEFAULT FALSE,
  aws_ses_token TEXT,
  stalwart_user_created BOOLEAN DEFAULT FALSE,
  stalwart_username TEXT,
  stalwart_password TEXT,
  k8s_ingress_created BOOLEAN DEFAULT FALSE,
  cloudflare_dns_records TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Troubleshooting

### Domain not verified in SES

- Check that DNS TXT record was created in Cloudflare
- Wait up to 72 hours for DNS propagation
- Check AWS SES console for verification status

### Ingress not working

- Ensure cert-manager is running in the cluster
- Check that external-dns is updating Cloudflare
- Verify nginx-ingress controller is running

### Stalwart user can't login

- Check that the domain was added to Stalwart
- Verify the user was created with correct credentials
- Check Stalwart logs for authentication errors

### GitHub repository not created

- Verify GITHUB_TOKEN has repo permissions
- Check that GITHUB_ORG exists and token has access
- Ensure repo name doesn't conflict with existing repos

## Security Considerations

1. **Admin Password**: Use a strong, unique password for ADMIN_PASSWORD
2. **API Tokens**: Store all API tokens securely in environment variables
3. **Tenant Isolation**: Each tenant gets their own user account in Stalwart
4. **Repository Access**: Repositories are private by default
5. **Rate Limiting**: Consider adding rate limiting to the onboarding API

## Future Enhancements

- [ ] Domain purchase via Cloudflare Registrar
- [ ] Self-service onboarding without admin approval
- [ ] Tenant SDK for programmatic access
- [ ] Billing integration for paid tiers
- [ ] Custom website templates
- [ ] Multi-region support
- [ ] Automated testing of each onboarding step
