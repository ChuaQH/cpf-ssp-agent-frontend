import { NextResponse } from "next/server";
import { invokeAgent, newSessionId } from "@/lib/agent";
import { getSession, roleFromEmail } from "@/lib/auth";
import { isAgentError, type AuthUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The single auth-related endpoint. It is a status/read endpoint, not a login
// endpoint — there is no login here. It (1) reads the gateway identity from the
// request headers and (2) materializes the persisted user record via the agent's
// user/upsert action (find-or-create + profile refresh + role). Returns only the
// public profile. See appcentral-auth-handover.md §4.5.

// Shape of the agent's user/upsert record (the seam contract).
type AgentUserRecord = {
  gateway_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: "user" | "admin";
  provider: string;
  created_at: string;
  last_login: string;
  updated_at: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // user/upsert is invoked server-side only (never via the browser-facing
    // /api/agent allowlist). The user store is instance-independent, so a fresh
    // session id is fine.
    const resp = await invokeAgent(
      {
        action: "user/upsert",
        gateway_id: session.id,
        email: session.email,
        name: session.name,
        image: session.image ?? "",
      },
      newSessionId(),
    );

    if (isAgentError(resp)) {
      throw new Error(resp.error);
    }

    const rec = resp as AgentUserRecord;
    const user: AuthUser = {
      id: rec.gateway_id,
      email: rec.email,
      name: rec.display_name,
      image: rec.avatar_url ?? null,
      role: rec.role === "admin" ? "admin" : "user",
    };
    return NextResponse.json(user);
  } catch (err) {
    // Graceful degrade: if the user store is unreachable, still authenticate the
    // request from the trusted header profile so the app stays usable. Role falls
    // back to the local ADMIN_EMAILS allowlist. Do not log the profile as an
    // error payload; log only the cause.
    console.error(
      "auth/me: user/upsert failed, serving header profile:",
      err instanceof Error ? err.message : err,
    );
    const user: AuthUser = {
      id: session.id,
      email: session.email,
      name: session.name,
      image: session.image,
      role: roleFromEmail(session.email),
    };
    return NextResponse.json(user);
  }
}
