"use client";

import type { AgentError } from "./types";

// Browser-side helper: every agent call goes through this app's own /api/agent
// route. The browser never talks to AWS or the agent directly.

const MIN_SESSION_LEN = 33;

/**
 * Generate a fresh AgentCore session id (>= 33 chars, required by AgentCore).
 * Use one id per assessment and pass it to assess/full/start and every poll.
 */
export function newSessionId(): string {
  let id = "";
  while (id.length < MIN_SESSION_LEN) {
    id += crypto.randomUUID().replace(/-/g, "");
  }
  return id;
}

/**
 * POST a `{ action, ... }` payload to /api/agent and return the parsed JSON.
 * The returned value may be an `{ error }` envelope — callers should check with
 * `isAgentError`. Network/transport failures are thrown.
 */
export async function callAgent<T>(
  payload: Record<string, unknown>,
  sessionId?: string,
): Promise<T | AgentError> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sessionId ? { ...payload, sessionId } : payload),
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Request failed (${res.status} ${res.statusText})`);
  }

  // Our route returns { error } with a non-200 status on transport failure, and
  // also passes through agent-level { error } envelopes with 200. Either way the
  // body is the source of truth, so just hand it back.
  return json as T | AgentError;
}
