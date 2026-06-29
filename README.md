# cpf-ssp-agent-frontend

A thin Next.js (App Router, TypeScript) web UI over the **cpf-ssp-agent** — an
automated IM8 compliance assessment agent for Singapore Government systems.

Point it at an Azure DevOps repository, pick an SSP tier, and it runs a full
compliance assessment and lets you download the resulting artifacts: a gap
report, a remediation plan, and a filled SSP Excel file.

## How it works

The agent exposes **one** invocation endpoint; every capability is selected by an
`"action"` field in a JSON payload. This app uses exactly four actions:

| Action | Purpose |
| --- | --- |
| `tiers` | Populate the SSP tier dropdown (never hardcoded). |
| `workspace/clone` | Ingest the app/IaC repos → returns a `project_id`. |
| `assess/full/start` | Kick off the long assessment → returns a `job_id` instantly. |
| `job/status` | Poll until `completed`/`failed`; the result carries the artifacts. |

The assessment itself takes **several minutes**, so the flow is **async with
polling** — `assess/full/start` returns immediately and the browser polls
`job/status` every ~4s. No single request is ever held open for the long work, so
the app stays well under a Vercel-style serverless function timeout.

### Flow

1. On load → `tiers` populates the dropdown, pre-selecting `default_tier`.
2. Submit → `workspace/clone` → `assess/full/start` → poll `job/status`.
3. On `completed` → render the summary + a download button per `result.files`
   entry (utf-8 text inline, base64 decoded to bytes).

A fresh **AgentCore session id** (≥33 chars) is generated per assessment and sent
on the start call and every poll for session affinity. The in-flight `job_id` is
persisted to `localStorage`, so a page refresh resumes polling.

## Architecture

- **`app/page.tsx`** — client orchestrator: loads tiers, drives the form, the
  clone→start→poll sequence, and the results view.
- **`lib/use-assessment.ts`** — the async state machine (clone, start, poll,
  resume-on-refresh, cancellation).
- **`app/api/agent/route.ts`** — server route handler. The browser POSTs
  `{ action, ... }` here; it allowlists the four actions and forwards to the
  agent. Server-side because (1) AWS SigV4 needs secret creds, (2) the PAT /
  `AZDO_PAT` must never reach the browser, (3) avoids CORS.
- **`lib/agent.ts`** — the transport adapter, selected by `AGENT_MODE`:
  - **`aws`** — SigV4-signed `InvokeAgentRuntimeCommand`
    (`@aws-sdk/client-bedrock-agentcore`). Reads the streamed response body.
  - **`http`** — POSTs the JSON payload to `AGENT_HTTP_URL` (e.g. local
    `agentcore dev` at `http://localhost:8080/invocations`).
- **`lib/download.ts`** — converts a `result.files` entry into a browser download.

Secrets are server-only (no `NEXT_PUBLIC_*`). The PAT is forwarded to the agent
and never logged, stored, or echoed back.

## Setup

```bash
npm install
cp .env.example .env.local   # then edit
npm run dev                  # http://localhost:3000
```

### Configuration

See [`.env.example`](.env.example). The essentials:

```bash
# Local dev against a plain HTTP agent (default):
AGENT_MODE=http
AGENT_HTTP_URL=http://localhost:8080/invocations

# Deployed AWS AgentCore runtime:
AGENT_MODE=aws
AGENT_RUNTIME_ARN=arn:aws:bedrock-agentcore:ap-southeast-1:<ACCOUNT_ID>:runtime/<name>
AGENT_AWS_REGION=ap-southeast-1
# + AWS credentials via the standard chain (env / SSO / role)
```

Switching transport is **config only** — no code changes.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```
