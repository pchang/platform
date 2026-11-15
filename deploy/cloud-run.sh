#!/usr/bin/env bash
# Deploys the platform to Google Cloud Run as a demo deployment (spec/deployment.md).
# Run it with your own Google Cloud credentials (gcloud auth login). It holds no secret: you give them at the prompts,
# and they go to Secret Manager. See deploy/README.md first: it needs an OAuth client from the Google Cloud console.
#
#   PROJECT=my-project REGION=us-central1 ACCESS_EMAILS=you@example.com deploy/cloud-run.sh
set -euo pipefail

: "${PROJECT:?Set PROJECT to your Google Cloud project id}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-lsh-platform}"
ACCESS_EMAILS="${ACCESS_EMAILS:-}"
ACCESS_DOMAINS="${ACCESS_DOMAINS:-}"
if [[ -z "$ACCESS_EMAILS" && -z "$ACCESS_DOMAINS" ]]; then
  echo "Set ACCESS_EMAILS or ACCESS_DOMAINS: who may sign in." >&2
  exit 1
fi

gcloud config set project "$PROJECT" >/dev/null
echo "Enabling Cloud Run, Cloud Build, Artifact Registry and Secret Manager..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

# A secret, created once; asked for only when it does not exist yet. Values never touch the command line or a file.
secret() {
  local name="$1" prompt="$2" generate="${3:-}"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    echo "Secret $name exists; keeping it."
    return
  fi
  if [[ -n "$generate" ]]; then
    head -c 48 /dev/urandom | base64 | tr -d '\n' | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
  else
    read -rsp "$prompt: " value && echo
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
  fi
}
secret lsh-anthropic-api-key "Claude API key (console.anthropic.com)"
secret lsh-oidc-client-secret "OAuth client secret (Google Cloud console, Credentials)"
secret lsh-session-secret "" generate
read -rp "OAuth client id (ends in .apps.googleusercontent.com): " CLIENT_ID

# The service runs as the project's default compute account; it may read these three secrets and nothing else.
RUNTIME="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for name in lsh-anthropic-api-key lsh-oidc-client-secret lsh-session-secret; do
  gcloud secrets add-iam-policy-binding "$name" --member "serviceAccount:$RUNTIME" --role roles/secretmanager.secretAccessor >/dev/null
done

# The service's address is known only after the first deploy; deploy, then set it and redeploy the settings.
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"

echo "Building and deploying $SERVICE..."
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --max-instances 1 \
  --min-instances 0 \
  --memory 1Gi \
  --set-secrets "LSH_ANTHROPIC_API_KEY=lsh-anthropic-api-key:latest,LSH_OIDC_CLIENT_SECRET=lsh-oidc-client-secret:latest,LSH_SESSION_SECRET=lsh-session-secret:latest" \
  --set-env-vars "^@^LSH_OIDC_CLIENT_ID=${CLIENT_ID}@LSH_ACCESS_EMAILS=${ACCESS_EMAILS}@LSH_ACCESS_DOMAINS=${ACCESS_DOMAINS}@LSH_DEMO_PERSONAS=1@LSH_PUBLIC_URL=${URL:-https://pending.invalid}"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars "LSH_PUBLIC_URL=${URL}" >/dev/null
echo
echo "Deployed: $URL"
echo "Add this to the OAuth client's Authorized redirect URIs, if it is not there yet: ${URL}/auth/callback"
