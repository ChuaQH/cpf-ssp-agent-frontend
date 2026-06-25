import "server-only";

// =============================================================================
// Server-side agent adapter.
//
// Exposes a single `invokeAgent(payload, sessionId?)` used by the API route for
// every action. The transport is selected from env (`AGENT_MODE`):
//   - "http": POST the JSON payload to AGENT_HTTP_URL (e.g. local agentcore dev)
//   - "aws":  SigV4-signed Bedrock AgentCore InvokeAgentRuntime
//
// This file is server-only: it touches AWS credentials and forwards user PATs,
// neither of which may ever reach the browser. The `server-only` import makes a
// build fail loudly if this module is ever pulled into a client bundle.
// =============================================================================

type AgentMode = "http" | "aws";

function getMode(): AgentMode {
  const raw = (process.env.AGENT_MODE ?? "http").trim().toLowerCase();
  if (raw === "aws" || raw === "http") return raw;
  throw new Error(`Invalid AGENT_MODE="${raw}" (expected "http" or "aws")`);
}

// AgentCore requires a runtimeSessionId of at least 33 characters. Generate a
// long random one when the caller does not supply (or supplies a too-short) id.
const MIN_SESSION_LEN = 33;

function normalizeSessionId(sessionId?: string): string {
  let id = (sessionId ?? "").trim();
  while (id.length < MIN_SESSION_LEN) {
    id += crypto.randomUUID().replace(/-/g, "");
  }
  return id;
}

export function newSessionId(): string {
  return normalizeSessionId();
}

// --- Mode B: plain HTTP -------------------------------------------------------

async function invokeHttp(
  payload: object,
  sessionId: string,
): Promise<unknown> {
  const url = process.env.AGENT_HTTP_URL;
  if (!url) {
    throw new Error("AGENT_HTTP_URL is not set (required when AGENT_MODE=http)");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Forward session affinity for gateways that honour it. Harmless for a
    // single-instance local dev runtime that ignores it.
    "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
  };

  // The local `agentcore dev` server gates /invocations behind this header to
  // mark the request as a local invocation. On by default for http mode; set
  // AGENT_HTTP_LOCAL_HEADER=false when fronting the runtime with an API
  // Gateway/ALB that doesn't expect it.
  if ((process.env.AGENT_HTTP_LOCAL_HEADER ?? "true").toLowerCase() !== "false") {
    headers["X-Agentcore-Local"] = "true";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    // No long-held requests: each action returns quickly. We still bound it so a
    // hung endpoint can't pin our serverless function open.
    signal: AbortSignal.timeout(25_000),
  });

  const text = await res.text();
  if (!res.ok) {
    // Surface the body when present; otherwise a generic status error.
    const detail = text?.trim();
    throw new Error(
      detail
        ? `Agent HTTP ${res.status}: ${detail}`
        : `Agent HTTP ${res.status} ${res.statusText}`,
    );
  }
  return parseJson(text);
}

// --- Mode A: AWS SigV4 InvokeAgentRuntime ------------------------------------
//
// Lazily import the SDK so Mode B deployments don't need the dependency loaded
// at module init (and so a missing optional dep can't break http-only setups).

async function invokeAws(
  payload: object,
  sessionId: string,
): Promise<unknown> {
  const arn = process.env.AGENT_RUNTIME_ARN;
  if (!arn) {
    throw new Error(
      "AGENT_RUNTIME_ARN is not set (required when AGENT_MODE=aws)",
    );
  }
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error("AWS_REGION is not set (required when AGENT_MODE=aws)");
  }

  const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = await import(
    "@aws-sdk/client-bedrock-agentcore"
  );

  const client = new BedrockAgentCoreClient({ region });
  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: arn,
    runtimeSessionId: sessionId,
    contentType: "application/json",
    accept: "application/json",
    payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  const response = await client.send(command);

  // The response body is a streaming blob; read it fully to a string.
  const body = response.response;
  let text: string;
  if (!body) {
    text = "";
  } else if (typeof (body as { transformToString?: unknown }).transformToString === "function") {
    text = await (body as { transformToString: () => Promise<string> }).transformToString();
  } else {
    // Fallback for a raw byte array.
    text = new TextDecoder().decode(body as unknown as Uint8Array);
  }

  return parseJson(text);
}

// --- shared -------------------------------------------------------------------

function parseJson(text: string): unknown {
  if (!text || !text.trim()) {
    throw new Error("Agent returned an empty response");
  }
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 300 ? `${text.slice(0, 300)}…` : text;
    throw new Error(`Agent returned non-JSON response: ${preview}`);
  }
}

/**
 * Invoke the agent with a `{ action, ... }` payload and return the parsed JSON
 * object. The same `sessionId` should be reused across an assessment's
 * `assess/full/start` and every `job/status` poll for session affinity.
 */
export async function invokeAgent(
  payload: object,
  sessionId?: string,
): Promise<unknown> {
  const id = normalizeSessionId(sessionId);
  const mode = getMode();
  return mode === "aws" ? invokeAws(payload, id) : invokeHttp(payload, id);
}
