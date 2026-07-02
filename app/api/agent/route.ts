import { NextResponse } from "next/server";
import { invokeAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";

// This route must run on the Node.js runtime (AWS SDK + crypto), never edge.
export const runtime = "nodejs";
// Each call is short, but never cache agent responses.
export const dynamic = "force-dynamic";
// Most actions return in well under a second (clone, start, each poll). The
// exception is "refine": one synchronous LLM turn that can take up to ~a minute.
// Give the route a generous budget so a refine turn isn't cut off. (The long
// assess/full work still runs async on the agent via assess/full/start + polling,
// so this ceiling only ever bounds a single refine turn.)
export const maxDuration = 120;

// Only these actions are reachable through this app. Anything else is rejected
// before it touches the agent — keeps the synchronous assess/full and the
// classify endpoints firmly out of scope.
const ALLOWED_ACTIONS = new Set([
  "tiers",
  "workspace/clone",
  "assess/full/start",
  "job/status",
  "refine",
  // read-only project history: list past assessments and reopen one by id
  "list-projects",
  "assess/result",
]);

// Project-scoped actions the agent owns per-user: each stores/reads artifacts
// under <owner>/<project>/… and REQUIRES the authenticated owner id (gateway_id).
// We inject it from the session server-side (below), so it can't be forged by the
// browser. Superset of what this app currently calls (assess/gather, remediate,
// etc. aren't in ALLOWED_ACTIONS today) — kept complete so identity is injected
// correctly if any are ever allowlisted. `tiers`/`chat`/`classify`/
// `domain-grouping` are NOT here — they have no owner dimension.
const PROJECT_ACTIONS = new Set([
  "workspace/clone",
  "assess/gather",
  "assess/evaluate",
  "assess/full",
  "assess/full/start",
  "assess/result",
  "list-projects",
  "job/status",
  "refine",
  "remediate",
  "fill-ssp",
]);

type RequestBody = {
  action?: unknown;
  // session id for AgentCore affinity; forwarded, not part of the agent payload
  sessionId?: unknown;
  [key: string]: unknown;
};

export async function POST(req: Request) {
  // Gate on a gateway identity before touching the agent (and the secrets behind
  // it). Stateless header-presence check — authenticate-only, no role gating.
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  const action = body?.action;
  if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `Unsupported or missing action: ${String(action)}` },
      { status: 400 },
    );
  }

  // Strip our transport-only field; everything else is the agent payload.
  const { sessionId, ...payload } = body;
  const sid = typeof sessionId === "string" ? sessionId : undefined;

  // Identity is server-authoritative: never trust a client-supplied gateway_id.
  // Drop any the browser sent, then inject the authenticated owner id for
  // project-scoped actions. This is what enforces per-user ownership across the
  // whole flow (clone → assess → poll → result → refine → list) — the same id
  // that feeds user/upsert. Independent of `sessionId` (runtime affinity), which
  // was already stripped above.
  delete payload.gateway_id;
  if (PROJECT_ACTIONS.has(action)) {
    payload.gateway_id = auth.session.id;
  }

  try {
    const result = await invokeAgent(payload, sid);
    // Pass the agent's JSON straight through. If the agent itself returned an
    // { error } envelope, the client checks for that; we keep HTTP 200 so the
    // client can read the message uniformly.
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent request failed";
    // Do not log request bodies here — they may carry a user PAT.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
