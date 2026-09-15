import { env } from "$env/dynamic/private";

export interface TenantK8sConfig {
  slug: string;
  subdomain: string;
  brandName?: string | null;
  customDomain?: string | null;
  namespace: string;
}

export function generateTenantManifests(config: TenantK8sConfig): string {
  const hosts = [config.subdomain];
  if (config.customDomain) {
    const cleanCustom = config.customDomain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    if (cleanCustom) {
      hosts.push(cleanCustom);
      if (!cleanCustom.startsWith("www.")) {
        hosts.push(`www.${cleanCustom}`);
      }
    }
  }

  const tlsHosts = hosts.map((h) => `        - ${h}`).join("\n");
  const brandName = (config.brandName || config.slug).replace(/"/g, '\\"');
  const ingressRules = hosts
    .map(
      (h) => `  - host: ${h}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-prod
            port:
              number: 3000`,
    )
    .join("\n");

  return `apiVersion: v1
kind: Namespace
metadata:
  name: ${config.namespace}
  labels:
    role: tenant
    slug: ${config.slug}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: tenant-storage
  namespace: ${config.namespace}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: tenant-security-egress
  namespace: ${config.namespace}
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ether
      ports:
        - protocol: TCP
          port: 3000
        - protocol: TCP
          port: 5173
  egress:
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ether
          podSelector:
            matchLabels:
              app: agent-runner
      ports:
        - protocol: TCP
          port: 8080
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
              - 169.254.169.254/32
              - 127.0.0.0/8
      ports:
        - protocol: TCP
          port: 443
        - protocol: TCP
          port: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-prod
  namespace: ${config.namespace}
  labels:
    app: web-prod
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: web-prod
  template:
    metadata:
      labels:
        app: web-prod
    spec:
      imagePullSecrets:
        - name: ghcr-secret
      containers:
        - name: website
          image: ghcr.io/bassemsab/ether-website:latest
          imagePullPolicy: Always
          env:
            - name: PORT
              value: "3000"
            - name: NODE_ENV
              value: "production"
            - name: DB_PATH
              value: "/data/app.db"
            - name: TENANT_SLUG
              value: "${config.slug}"
            - name: TENANT_DOMAIN
              value: "${config.subdomain}"
            - name: TENANT_BRAND_NAME
              value: "${brandName}"
            - name: RUNNER_API_URL
              value: "http://agent-runner.ether.svc.cluster.local:8080"
          ports:
            - containerPort: 3000
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 250m
              memory: 256Mi
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: tenant-storage
---
apiVersion: v1
kind: Service
metadata:
  name: web-prod
  namespace: ${config.namespace}
spec:
  selector:
    app: web-prod
  ports:
    - port: 3000
      targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  namespace: ${config.namespace}
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/limit-rps: "25"
    nginx.ingress.kubernetes.io/limit-connections: "20"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
${tlsHosts}
      secretName: ${config.slug}-tls
  rules:
${ingressRules}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-dev
  namespace: ${config.namespace}
  labels:
    app: web-dev
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-dev
  template:
    metadata:
      labels:
        app: web-dev
    spec:
      imagePullSecrets:
        - name: ghcr-secret
      containers:
        - name: dev-server
          image: oven/bun:1.2-alpine
          command: ["sh", "-c", "sleep 3600"]
          ports:
            - containerPort: 5173
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: tenant-storage
---
apiVersion: v1
kind: Service
metadata:
  name: web-dev
  namespace: ${config.namespace}
spec:
  selector:
    app: web-dev
  ports:
    - port: 5173
      targetPort: 5173
`;
}

/**
 * Applies tenant manifests to Kubernetes cluster using kubectl.
 */
export async function applyTenantK8s(
  config: TenantK8sConfig,
): Promise<boolean> {
  // 1. Ensure namespace exists
  try {
    const nsProc = Bun.spawn({
      cmd: [
        "kubectl",
        "create",
        "namespace",
        config.namespace,
        "--dry-run=client",
        "-o",
        "yaml",
      ],
      stdout: "pipe",
    });
    const nsYaml = await new Response(nsProc.stdout).text();
    const nsApply = Bun.spawn({
      cmd: ["kubectl", "apply", "-f", "-"],
      stdin: new Response(nsYaml),
      stdout: "pipe",
      stderr: "pipe",
    });
    await nsApply.exited;
  } catch {}

  // 2. Ensure ghcr-secret is copied into the namespace for pulling images
  try {
    const secProc = Bun.spawn({
      cmd: [
        "kubectl",
        "get",
        "secret",
        "ghcr-secret",
        "-n",
        "ether",
        "-o",
        "json",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });
    const secJsonStr = await new Response(secProc.stdout).text();
    if (secJsonStr && secJsonStr.includes('"kind": "Secret"')) {
      const secObj = JSON.parse(secJsonStr);
      delete secObj.metadata.resourceVersion;
      delete secObj.metadata.uid;
      delete secObj.metadata.creationTimestamp;
      secObj.metadata.namespace = config.namespace;
      const secApply = Bun.spawn({
        cmd: ["kubectl", "apply", "-f", "-"],
        stdin: new Response(JSON.stringify(secObj)),
        stdout: "pipe",
        stderr: "pipe",
      });
      await secApply.exited;
    }
  } catch {}

  // 3. Apply manifests
  const manifests = generateTenantManifests(config);
  const tempPath = `/tmp/k8s-tenant-${config.slug}.yaml`;

  try {
    await Bun.write(tempPath, manifests);

    const proc = Bun.spawn({
      cmd: ["kubectl", "apply", "-f", tempPath],
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    try {
      await Bun.file(tempPath).delete();
    } catch {}

    if (exitCode !== 0) {
      console.warn(
        `[applyTenantK8s] kubectl note for ${config.slug}: ${stderr}`,
      );
      return false;
    }

    return true;
  } catch (err: any) {
    console.warn(
      `[applyTenantK8s] Could not invoke kubectl (running locally?): ${err.message}`,
    );
    return false;
  }
}

/**
 * Updates an existing tenant Ingress to include a newly purchased custom domain.
 */
export async function updateTenantCustomDomainIngress(
  slug: string,
  namespace: string,
  subdomain: string,
  customDomain: string,
): Promise<boolean> {
  return applyTenantK8s({
    slug,
    namespace,
    subdomain,
    customDomain,
  });
}

/**
 * Deletes tenant Kubernetes resources (Namespace and all resources within it).
 */
export async function deleteTenantK8s(namespace: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["kubectl", "delete", "namespace", namespace, "--ignore-not-found=true"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch (err: any) {
    console.warn(`[deleteTenantK8s] Could not invoke kubectl: ${err.message}`);
    return false;
  }
}
