# Deploying to Google Cloud Run

How to run the platform for real: the gateway with Claude, Google sign-in, and the page, in one Cloud Run service. What the deployment is and why is in [`spec/deployment.md`](../spec/deployment.md). This is a **demo deployment**: synthetic data only, and nothing is kept when the instance restarts.

## What you need

- A Google Cloud project with billing, and the `gcloud` CLI signed in (`gcloud auth login`).
- A Claude API key from the Anthropic Console.
- An **OAuth client** for sign-in, made once in the Google Cloud console:
  1. **APIs & Services → OAuth consent screen.** Set it up as *External* (or *Internal* for a Google Workspace organization). Add your own address as a test user while the app is in testing.
  2. **APIs & Services → Credentials → Create credentials → OAuth client ID.** Choose *Web application*. Leave the redirect URIs empty for now.
  3. Keep the client ID and the client secret for the script.

## Deploy

From the repository's root:

```bash
PROJECT=your-project-id REGION=us-central1 ACCESS_EMAILS=you@example.com deploy/cloud-run.sh
```

The script:
- enables the services it needs;
- stores the Claude key, the OAuth client secret and a generated session key in Secret Manager, asking for each only once;
- lets the service read those three secrets;
- builds the container with Cloud Build and deploys it at one instance;
- prints the service's address.

`ACCESS_DOMAINS=example.com` allows a whole email domain instead of, or as well as, single addresses.

Then go back to the OAuth client in the console and add the printed redirect URI, `https://…run.app/auth/callback`, under **Authorized redirect URIs**. Open the address, sign in with Google, and choose a person to act as from Profile.

## Updating

Run the script again: it keeps the existing secrets and deploys the current code. To change a secret, add a new version in Secret Manager (`gcloud secrets versions add lsh-anthropic-api-key --data-file=-`) and redeploy.

## Running it on your own machine

Development mode needs no sign-in and must never face the internet:

```bash
LSH_ANTHROPIC_API_KEY=… npm run gateway
```

```bash
VITE_GATEWAY=http npm run dev
```

To try the deployment's container locally with sign-in, add `http://localhost:8080/auth/callback` to the OAuth client and run the image with the same variables the script sets, with `LSH_PUBLIC_URL=http://localhost:8080`.
