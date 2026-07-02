import { NextResponse, type NextRequest } from "next/server";

// =============================================================================
// Next.js 16 request proxy (formerly "middleware"). Runs on the Node runtime.
//
// PRODUCTION: pass-through. The appcentral/Traefik gateway is the sole injector
// of X-Auth-User-* headers; this file must never fabricate identity in prod.
//
// DEVELOPMENT: there is no gateway in front, so when no `x-auth-user-id` is
// present we inject fake DEV_USER_* headers so the app is usable locally. This
// is the ONLY header-injecting code in the app. Override the DEV_USER_* env vars
// to test as different users. See appcentral-auth-handover.md §4.1.
// =============================================================================

const HEADER_USER_ID = "x-auth-user-id";
const HEADER_USER_EMAIL = "x-auth-user-email";
const HEADER_USER_NAME = "x-auth-user-name";
const HEADER_USER_IMAGE = "x-auth-user-image";

export function proxy(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.next(); // prod: the gateway supplies the headers
  }
  if (req.headers.get(HEADER_USER_ID)) {
    return NextResponse.next(); // real headers already present — don't override
  }

  const headers = new Headers(req.headers);
  headers.set(HEADER_USER_ID, process.env.DEV_USER_ID ?? "dev-user-1");
  headers.set(HEADER_USER_EMAIL, process.env.DEV_USER_EMAIL ?? "admin@local");
  headers.set(HEADER_USER_NAME, process.env.DEV_USER_NAME ?? "Dev Admin");
  headers.set(HEADER_USER_IMAGE, process.env.DEV_USER_IMAGE ?? "");
  // request.headers → visible upstream to route handlers / server components.
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Run on app + API routes; skip static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp)$).*)",
  ],
};
