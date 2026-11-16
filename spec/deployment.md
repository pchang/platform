# Deployment

Version 0.1. November 15, 2026. Applies to: Ontology-Driven AI Platform Prompt Specification v0.30, sections 3.4 and 7.

How the platform runs for people to use: one service, with the gateway and the page it serves, a connected Claude model, and sign-in. It is domain-free: a domain brings its ontology and seed graph, not its own deployment.

---

## 1. Shape

- **One container.** It runs the gateway, which serves the HTTP and Model Context Protocol transports (platform spec 3.4) and the built page from the same origin. Its cookies are first-party, and the page needs no settings to find the gateway.
- **The page** is built to call the gateway over HTTP. The in-page preview (platform spec 3.4, Previews) is a separate build and is never deployed this way.
- **Health.** `GET /healthz` answers when the gateway has loaded the ontology and the journal.
- **Headers.** Every response forbids framing by other sites, sends no referrer to other origins, and turns off content-type sniffing. Pages are never cached; the built page's hashed assets are cached for a year.

## 2. Hosting: Google Cloud Run

The first hosting target is Google Cloud Run, in a project the organization owns.

- **One instance at most,** because the journal has one writer. Scales to zero when idle.
- **HTTPS** from Cloud Run's own address, or a mapped domain. The gateway trusts Cloud Run's forwarded protocol only to build its own sign-in redirect address, which is configured, not guessed.
- **Public ingress, private data.** Cloud Run lets the requests in, and the gateway authenticates every one (platform spec 3.4, Identity).
- **The repository** holds the container definition and a deployment script. The person deploying runs it with their own Google Cloud credentials. Nothing in the repository holds a secret.

## 3. Configuration

| Setting | What it is | Where it lives |
|---|---|---|
| `LSH_ANTHROPIC_API_KEY` | The deployment's Claude API key, for asking, search and drafting | Secret Manager |
| `LSH_OIDC_CLIENT_SECRET` | The sign-in client's secret | Secret Manager |
| `LSH_SESSION_SECRET` | The key that signs session cookies, at least 32 random bytes | Secret Manager |
| `LSH_OIDC_CLIENT_ID` | The sign-in client's id, from Google Cloud's OAuth client | Environment variable |
| `LSH_PUBLIC_URL` | The service's own address, such as `https://lsh-platform-….run.app`, for the sign-in redirect | Environment variable |
| `LSH_ACCESS_EMAILS`, `LSH_ACCESS_DOMAINS` | Who may sign in, comma-separated; at least one must be set | Environment variable |
| `LSH_DEMO_PERSONAS` | `1` for a demo deployment with synthetic data: accounts act as any person, and development signatures are taken | Environment variable |
| `LSH_ASK_MODEL`, `LSH_SEARCH_MODEL` | The Claude models to use, if not the default | Environment variable |
| `LSH_GATEWAY_JOURNAL` | Where the journal is written | Environment variable |

Without `LSH_OIDC_CLIENT_ID`, the gateway refuses to start outside development mode, so a deployment never runs without sign-in.

## 4. The journal

The journal is the record of every commit and audited read (platform spec 3.4, Persistence). Cloud Run's disk is not kept: a new instance starts from the seed graph and an empty journal. Until the journal has durable storage, a Cloud Run deployment is a demo deployment with synthetic data only, and the page says nothing it does is kept beyond the instance. Durable storage for the journal is an open question (platform spec 9).

## 5. Version Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-15 | First version: one container serving the gateway and the page, on Google Cloud Run at one instance, with Google sign-in, secrets in Secret Manager, health and headers, and the journal's limits there. |
