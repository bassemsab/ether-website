#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Google Profile Authenticator for Ether Agent Runner (Kubernetes)
# ==============================================================================
# Usage:
#   ./scripts/auth_cluster_profile.sh [profile_name]
#   ./scripts/auth_cluster_profile.sh primary --import-local
#   ./scripts/auth_cluster_profile.sh secondary
# ==============================================================================

NAMESPACE="ether"
PROFILE="${1:-primary}"
MODE="${2:-oauth}"

echo "========================================================"
echo "🔐 Google Account Authenticator · Profile: [${PROFILE}]"
echo "========================================================"

# 1. Check kubectl access and find runner pod
echo "🔍 Finding agent-runner pod in namespace '${NAMESPACE}'..."
POD_NAME=$(kubectl get pods -n "${NAMESPACE}" -l app=agent-runner -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}' 2>/dev/null || true)

if [ -z "${POD_NAME}" ]; then
  # Fallback to any agent-runner pod
  POD_NAME=$(kubectl get pods -n "${NAMESPACE}" -l app=agent-runner -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
fi

if [ -z "${POD_NAME}" ]; then
  echo "❌ Error: No running 'agent-runner' pod found in namespace '${NAMESPACE}'."
  echo "   Make sure the deployment is applied: kubectl apply -f k8s/studio/agent-runner.yaml"
  exit 1
fi

echo "✓ Connected to runner pod: ${POD_NAME}"

# 2. If --import-local is requested, copy local ~/.gemini directly
if [ "${MODE}" == "--import-local" ] || [ "${MODE}" == "--sync-local" ]; then
  echo ""
  echo "📦 Importing local ~/.gemini tokens to cluster profile '${PROFILE}'..."
  GEMINI_DIR="${HOME}/.gemini"
  TOKEN_FILE="${GEMINI_DIR}/jetski-standalone-oauth-token"
  ACCOUNTS_FILE="${GEMINI_DIR}/google_accounts.json"
  SETTINGS_FILE="${GEMINI_DIR}/settings.json"

  if [ ! -f "${TOKEN_FILE}" ]; then
    echo "❌ Error: Local token file ${TOKEN_FILE} not found."
    exit 1
  fi

  # Create remote profile directory
  kubectl exec -n "${NAMESPACE}" "${POD_NAME}" -- mkdir -p "/data/profiles/${PROFILE}"

  # Copy files
  kubectl cp "${TOKEN_FILE}" "${NAMESPACE}/${POD_NAME}:/data/profiles/${PROFILE}/jetski-standalone-oauth-token"
  if [ -f "${ACCOUNTS_FILE}" ]; then
    kubectl cp "${ACCOUNTS_FILE}" "${NAMESPACE}/${POD_NAME}:/data/profiles/${PROFILE}/google_accounts.json"
  fi
  if [ -f "${SETTINGS_FILE}" ]; then
    kubectl cp "${SETTINGS_FILE}" "${NAMESPACE}/${POD_NAME}:/data/profiles/${PROFILE}/settings.json"
  fi

  echo "✅ Success! Local credentials imported into cluster profile '${PROFILE}'."
  exit 0
fi

# 3. Headless OAuth Device Flow
echo ""
echo "🌐 Requesting Google OAuth authorization URL from runner daemon..."

START_RES=$(kubectl exec -n "${NAMESPACE}" "${POD_NAME}" -- curl -s -X POST http://localhost:8080/auth/start \
  -H "Content-Type: application/json" \
  -d "{\"profile\": \"${PROFILE}\"}")

AUTH_URL=$(echo "${START_RES}" | grep -o '"authUrl":"[^"]*' | cut -d'"' -f4 || true)

if [ -z "${AUTH_URL}" ]; then
  echo "❌ Error: Failed to generate authorization URL from runner daemon."
  echo "Response: ${START_RES}"
  exit 1
fi

echo ""
echo "👉 Step 1: Open this URL in your web browser:"
echo ""
echo "   ${AUTH_URL}"
echo ""
echo "👉 Step 2: Sign in with the Google Account you wish to use for profile [${PROFILE}]."
echo "👉 Step 3: Copy the authorization code provided by Google and paste it below."
echo ""
read -r -p "Enter Authorization Code: " AUTH_CODE

if [ -z "${AUTH_CODE}" ]; then
  echo "❌ Error: No authorization code entered."
  exit 1
fi

echo ""
echo "⏳ Submitting code to runner pod and finalizing tokens..."

FINISH_RES=$(kubectl exec -n "${NAMESPACE}" "${POD_NAME}" -- curl -s -X POST http://localhost:8080/auth/finish \
  -H "Content-Type: application/json" \
  -d "{\"profile\": \"${PROFILE}\", \"code\": \"${AUTH_CODE}\"}")

SUCCESS=$(echo "${FINISH_RES}" | grep -o '"success":true' || true)

if [ -n "${SUCCESS}" ]; then
  EMAIL=$(echo "${FINISH_RES}" | grep -o '"email":"[^"]*' | cut -d'"' -f4 || echo "Connected")
  echo ""
  echo "========================================================"
  echo "✅ Profile [${PROFILE}] successfully authenticated!"
  echo "   Account: ${EMAIL}"
  echo "   Tokens saved to: /data/profiles/${PROFILE} on cluster"
  echo "========================================================"
else
  echo "❌ Error finalizing authorization:"
  echo "${FINISH_RES}"
  exit 1
fi
