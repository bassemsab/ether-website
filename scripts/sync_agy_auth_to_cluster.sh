#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Sync Local agy CLI Authentication Profiles to Kubernetes Cluster
# ==============================================================================
# This script bundles the local ~/.gemini authentication tokens and credentials
# into a secure Kubernetes Secret in the "ether" namespace.
# The agent-runner pod mounts this secret at /root/.gemini to run agy CLI
# fully authenticated without requiring interactive browser logins on the cluster.
# ==============================================================================

NAMESPACE="ether"
SECRET_NAME="agy-auth-profiles"

echo "🔍 Locating local agy CLI authentication tokens..."

GEMINI_DIR="${HOME}/.gemini"
if [ ! -d "${GEMINI_DIR}" ]; then
  echo "❌ Error: Directory ${GEMINI_DIR} does not exist."
  exit 1
fi

TOKEN_FILE="${GEMINI_DIR}/jetski-standalone-oauth-token"
ACCOUNTS_FILE="${GEMINI_DIR}/google_accounts.json"
SETTINGS_FILE="${GEMINI_DIR}/settings.json"

# Build kubectl secret command arguments
ARGS=()
if [ -f "${TOKEN_FILE}" ]; then
  ARGS+=(--from-file="jetski-standalone-oauth-token=${TOKEN_FILE}")
  echo "  ✓ Found OAuth token: ${TOKEN_FILE}"
fi

if [ -f "${ACCOUNTS_FILE}" ]; then
  ARGS+=(--from-file="google_accounts.json=${ACCOUNTS_FILE}")
  echo "  ✓ Found accounts file: ${ACCOUNTS_FILE}"
fi

if [ -f "${SETTINGS_FILE}" ]; then
  ARGS+=(--from-file="settings.json=${SETTINGS_FILE}")
  echo "  ✓ Found settings: ${SETTINGS_FILE}"
fi

if [ ${#ARGS[@]} -eq 0 ]; then
  echo "⚠️ No authentication files found in ${GEMINI_DIR}."
  exit 1
fi

echo "📦 Creating/Updating Kubernetes Secret '${SECRET_NAME}' in namespace '${NAMESPACE}'..."

kubectl create secret generic "${SECRET_NAME}" \
  -n "${NAMESPACE}" \
  "${ARGS[@]}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Success! agy authentication profiles synced to Kubernetes secret '${SECRET_NAME}'."
echo "   The agent-runner pod can now mount /root/.gemini directly."
