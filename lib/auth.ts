import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

// =============================================================================
// Gateway-header authentication (server-only).
//
// Auth is fully delegated to the upstream appcentral/Traefik gateway, which
// authenticates the user and injects trusted `X-Auth-User-*` headers on every
// request it forwards. This app performs ZERO verification — the security model
// is that the app is only ever reachable through the sanitizing gateway (which
// strips any client-sent X-Auth-User-* headers first). See appcentral-auth-
// handover.md §1. There is no login/logout, no cookie, no token here.
// =============================================================================

export type Session = {
  id: string; // gateway id — opaque better-auth string, NOT a DB id
  email: string;
  name: string;
  image: string | null;
};

// Presence of `x-auth-user-id` is the trust signal. Header names are
// case-insensitive; Headers.get lowercases for us. Empty image → null.
export function sessionFromHeaders(h: Headers): Session | null {
  const id = h.get("x-auth-user-id");
  if (!id) return null;
  return {
    id,
    email: h.get("x-auth-user-email") ?? "",
    name: h.get("x-auth-user-name") ?? "",
    image: h.get("x-auth-user-image") || null, // "" → null
  };
}

// Read the current request's session from the incoming headers (route handlers
// and server components). Returns null when the identity header is absent — i.e.
// the request did not come through the authenticating gateway.
export async function getSession(): Promise<Session | null> {
  return sessionFromHeaders(await headers());
}

/**
 * Gate a route on having a gateway identity. Stateless: it checks header
 * presence only and never calls the agent, so it's cheap enough to run on every
 * /api/agent request (including the ~4s job/status polls). Authenticate-only —
 * any signed-in gateway user passes; role is not enforced here.
 */
export async function requireAuth(): Promise<
  { session: Session; error?: never } | { session?: never; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      ),
    };
  }
  return { session };
}

// Admin allowlist, used ONLY by the /api/auth/me degraded-fallback path (when the
// agent user store is unreachable). The authoritative role is computed and
// persisted by the agent on user/upsert; this mirrors its allowlist so a
// degraded session still reflects admin status. ADMIN_EMAILS is server-only.
export function roleFromEmail(email: string | null | undefined): "user" | "admin" {
  if (!email) return "user";
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase()) ? "admin" : "user";
}
