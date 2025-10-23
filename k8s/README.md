# Deployment Guide

## 1. Build & push container image

```bash
# Set registry namespace
export REGISTRY=ghcr.io/YOUR_ORG

# Login if needed
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_USER --password-stdin

# Build multi-stage image
docker build -t $REGISTRY/ether-website:$(git rev-parse --short HEAD) .

# Push
docker push $REGISTRY/ether-website:$(git rev-parse --short HEAD)

# Optionally tag latest
docker tag $REGISTRY/ether-website:$(git rev-parse --short HEAD) $REGISTRY/ether-website:latest
docker push $REGISTRY/ether-website:latest
```

Update `k8s/deployment.yaml` with the image tag you pushed.

## 2. Apply manifests

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
# Optional if using ingress
kubectl apply -f k8s/ingress.yaml
```

## 3. Verify rollout

```bash
kubectl rollout status deployment/ether-website
kubectl get svc ether-website
kubectl logs -f deployment/ether-website
```

## 4. Configure DNS (if using ingress)

Point the host defined in `ingress.yaml` to your ingress controller's external IP.
