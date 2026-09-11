import { env } from "$env/dynamic/private";

export interface TenantK8sConfig {
  slug: string;
  subdomain: string;
  customDomain?: string | null;
  namespace: string;
}

export function generateTenantManifests(config: TenantK8sConfig): string {
  const hosts = [config.subdomain];
  if (config.customDomain) {
    hosts.push(config.customDomain);
  }

  const tlsHosts = hosts.map((h) => `    - ${h}`).join("\n");
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
              number: 3000`
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
  selector:
    matchLabels:
      app: web-prod
  template:
    metadata:
      labels:
        app: web-prod
    spec:
      containers:
        - name: website
          image: ghcr.io/bassemsab/ether-website:latest
          imagePullPolicy: IfNotPresent
          env:
            - name: PORT
              value: "3000"
            - name: NODE_ENV
              value: "production"
            - name: DB_PATH
              value: "/data/app.db"
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
export async function applyTenantK8s(config: TenantK8sConfig): Promise<boolean> {
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
      console.warn(`[applyTenantK8s] kubectl note for ${config.slug}: ${stderr}`);
      // In local dev without kubectl cluster connection, don't crash
      return false;
    }

    return true;
  } catch (err: any) {
    console.warn(`[applyTenantK8s] Could not invoke kubectl (running locally?): ${err.message}`);
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
  customDomain: string
): Promise<boolean> {
  return applyTenantK8s({
    slug,
    namespace,
    subdomain,
    customDomain,
  });
}
