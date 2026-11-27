# Northbridge's query agent

An example of an outside organization bringing its own agent to the platform (platform spec 3.4, Outside agents; domain spec section 10, the External agent journey).

Northbridge CRO runs data management for the sponsor's Phase II study at two of its three sites. This is Northbridge's program, not the platform's. It uses only public packages and the gateway's published interface, as any outside party's agent would.

## What it does

1. It gets an access token from the sponsor's identity provider (OAuth client credentials). It proves who it is with a private key that only Northbridge holds. The sponsor has only the matching public key.
2. It connects to the gateway's MCP endpoint and declares its name and version. The gateway records both with everything the agent does.
3. It finds the open data queries it can see. Queries at the third site, which Northbridge isn't assigned to, don't exist for it.
4. For each query, it looks up Northbridge's own site record and answers from it, giving a reason every time. An answer can be challenged with Re-query, so the agent may answer on its own.
5. It closes the queries it answered. Closing is final, so the gateway turns each close into a proposal for Mira Castellanos, the person at Northbridge who answers for the agent. She confirms or rejects each proposal on the platform.

## Two ways to run

- **With Claude** (`NB_ANTHROPIC_API_KEY` set to Northbridge's own key). Claude follows Northbridge's procedure in `work.ts` and decides each case. Claude sees only the gateway tools this work needs, plus a lookup of Northbridge's site records.
- **Scripted fallback**, when no key is set. This is a fixed procedure with no judgment, and it says so in its report.

## Running it

Against a gateway in development mode on your own machine:

```bash
npm run gateway
```

```bash
NB_DEVELOPMENT=1 npx tsx examples/northbridge-agent/main.ts
```

Against a deployment, use Northbridge's registration with the sponsor:

```bash
NB_GATEWAY_URL=https://lsh.example.com NB_TOKEN_ENDPOINT=https://idp.example.com/token NB_CLIENT_ID=northbridge-query-agent NB_PRIVATE_KEY_FILE=northbridge.pem npx tsx examples/northbridge-agent/main.ts
```

## What the sponsor controls

The agent can do only what the sponsor's trust model allows:

- **Scope.** It acts only at the sites assigned to Northbridge.
- **Reads.** It reads only queries, records, visits, patients by study code, sites and studies, and every read is logged.
- **Approval and suspension.** It can't act until the Clinical Operations Lead approves it, and stops at its next request once suspended.
- **Ceilings.** Crossing its hourly limit on commits or reads pauses it until a person resumes it.
- **Untrusted text.** Text it writes is marked for the platform's own AI as coming from an outside agent.

`src/gateway/exampleAgent.test.ts` runs it end to end over HTTP, with a small identity provider made for the test.
