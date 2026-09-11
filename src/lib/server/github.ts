import { env } from "$env/dynamic/private";

const BASE_URL = "https://api.github.com";

export async function createRepositoryInUserAccount(
  accessToken: string,
  repoName: string,
  description: string,
) {
  const response = await fetch(`${BASE_URL}/user/repos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({
      name: repoName,
      description: description,
      private: true,
      auto_init: false,
      gitignore_template: "Node",
      license_template: "mit",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `GitHub API error: ${error.message || response.statusText}`,
    );
  }

  return response.json();
}

export async function createFileInUserRepo(
  accessToken: string,
  owner: string,
  repoName: string,
  path: string,
  content: string,
  message: string,
) {
  const encodedContent = Buffer.from(content).toString("base64");

  const response = await fetch(
    `${BASE_URL}/repos/${owner}/${repoName}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: message,
        content: encodedContent,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `GitHub API error: ${error.message || response.statusText}`,
    );
  }

  return response.json();
}

export async function initializeTenantRepo(
  accessToken: string,
  domain: string,
  brandName: string,
  githubUsername: string,
) {
  const repoName = domain.replace(/\./g, "-"); // Convert mybusiness.com to mybusiness-com

  // Create repository in user's account
  const repo = await createRepositoryInUserAccount(
    accessToken,
    repoName,
    `${brandName} - Website repository for ${domain}`,
  );

  // Create README
  await createFileInUserRepo(
    accessToken,
    githubUsername,
    repoName,
    "README.md",
    generateReadme(brandName, domain),
    "Initial commit: Add README",
  );

  // Create basic website template
  await createFileInUserRepo(
    accessToken,
    githubUsername,
    repoName,
    "index.html",
    generateHtmlTemplate(brandName, domain),
    "Add initial website template",
  );

  // Create Dockerfile
  await createFileInUserRepo(
    accessToken,
    githubUsername,
    repoName,
    "Dockerfile",
    generateDockerfile(),
    "Add Dockerfile for containerization",
  );

  // Create k8s deployment manifest
  await createFileInUserRepo(
    accessToken,
    githubUsername,
    repoName,
    "k8s/deployment.yaml",
    generateK8sManifest(domain),
    "Add Kubernetes deployment configuration",
  );

  // Create .github/workflows/deploy.yaml
  await createFileInUserRepo(
    accessToken,
    githubUsername,
    repoName,
    ".github/workflows/deploy.yaml",
    generateGitHubWorkflow(),
    "Add GitHub Actions deployment workflow",
  );

  return repo;
}

function generateDockerfile(): string {
  return `# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all files
COPY . .

# Production stage
FROM nginx:alpine

# Copy website files to nginx
COPY --from=builder /app /usr/share/nginx/html

# Custom nginx config for SPA
RUN echo 'server { \\
    listen 80; \\
    server_name localhost; \\
    root /usr/share/nginx/html; \\
    index index.html; \\
    location / { \\
        try_files $uri $uri/ /index.html; \\
    } \\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
}

function generateReadme(brandName: string, domain: string): string {
  return `# ${brandName}

Welcome to your ${brandName} website repository!

## Domain
${domain}

## Mail Server
- SMTP Server: mail.${domain}:587
- Web Admin: https://mail.${domain}

## Deployment
This repository uses a **container-based deployment** workflow:

1. Push changes to this repository
2. GitHub Actions automatically builds a Docker image
3. Image is pushed to GitHub Container Registry (GHCR)
4. Kubernetes automatically pulls and deploys the new image

### How to Deploy
1. Edit your website files (\`index.html\`, add images, etc.)
2. Commit and push to the \`main\` branch
3. GitHub Actions will build and push the container image
4. Kubernetes will automatically update within seconds (imagePullPolicy: Always)

## Structure
- \`index.html\` - Main website file
- \`Dockerfile\` - Container build instructions
- \`k8s/\` - Kubernetes manifests (managed by Ether)
- \`.github/workflows/\` - CI/CD configuration
`;
}

function generateHtmlTemplate(brandName: string, domain: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${brandName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            max-width: 600px;
            width: 90%;
        }
        h1 {
            font-size: 3rem;
            margin-bottom: 1rem;
            color: #667eea;
        }
        p {
            font-size: 1.2rem;
            margin-bottom: 2rem;
            color: #666;
        }
        .domain {
            font-family: 'Courier New', monospace;
            background: #f0f0f0;
            padding: 0.5rem 1rem;
            border-radius: 5px;
            font-size: 0.9rem;
        }
        .footer {
            margin-top: 2rem;
            font-size: 0.9rem;
            color: #999;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${brandName}</h1>
        <p>Welcome to your new website!</p>
        <div class="domain">${domain}</div>
        <div class="footer">
            <p>Powered by <a href="https://ether.paris" target="_blank">Ether</a></p>
        </div>
    </div>
</body>
</html>`;
}

export function generateK8sManifest(domain: string): string {
  const namespace = domain.replace(/\./g, "-");
  const imageName = `ghcr.io/ether-paris/${namespace}:latest`;

  return `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: website
  template:
    metadata:
      labels:
        app: website
    spec:
      containers:
      - name: website
        image: ${imageName}
        imagePullPolicy: Always
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: website
  namespace: ${namespace}
spec:
  selector:
    app: website
  ports:
  - port: 80
    targetPort: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: website
  namespace: ${namespace}
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    external-dns.alpha.kubernetes.io/hostname: ${domain}
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - ${domain}
    secretName: ${namespace}-tls
  rules:
  - host: ${domain}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: website
            port:
              number: 80
`;
}

function generateGitHubWorkflow(): string {
  return `name: Build and Deploy

on:
  push:
    branches: [ main ]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: \${{ env.REGISTRY }}
        username: \${{ github.actor }}
        password: \${{ secrets.GITHUB_TOKEN }}

    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
        tags: |
          type=sha,prefix=,suffix=,format=short
          type=raw,value=latest

    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: \${{ steps.meta.outputs.tags }}
        labels: \${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
`;
}
