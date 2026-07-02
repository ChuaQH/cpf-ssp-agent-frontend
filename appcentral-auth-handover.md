# Handover: appcentral Gateway Authentication Flow

**Purpose:** This document is an implementation-ready specification of the "login" flow used by the openMIC application. It is written so that another agent can reimplement the same flow in a different application. It describes both the **exact reference implementation** (Next.js 16 App Router + Mongoose/MongoDB) and the **stack-agnostic contract** so it can be ported to any backend.

> **TL;DR — there is no login screen.** Authentication is fully delegated to an upstream gateway ("appcentral") fronted by Traefik. The gateway authenticates the user (Microsoft / better-auth), then injects trusted `X-Auth-User-*` HTTP headers into every request forwarded to your app. Your app never sees credentials or tokens — only a pre-verified user profile. Your only jobs are: (1) read the headers, (2) find-or-create a local user record, (3) gate routes on the presence of a header identity, and (4) render a "return to portal" message when the identity is absent.

---

## 1. The trust model (read this first)

This is the **trusted reverse-proxy header** authentication pattern. The security properties come entirely from the gateway, not from your app:

1. **Headers are pre-sanitized.** Traefik strips any client-sent `X-Auth-User-*` headers *before* the gateway's auth check, so a client cannot spoof them. If the header is present when the request reaches your app, it was set by the gateway.
2. **Reaching your app == already authenticated & authorized.** A missing `X-Auth-User-Id` means the gateway blocked the request (401/403) upstream. You will typically only see a missing header if the gateway is misconfigured or if you are running outside the gateway (e.g. local dev).
3. **No tokens or credentials ever reach your app.** You receive only public profile info: id, email, name, avatar URL.
4. **The session cookie (`auth_gateway.session_token`) is domain-scoped to `.appcentral.com` and httpOnly.** Subdomains do not read, validate, or manage it. You do not touch cookies at all.

### ⚠️ The single hard requirement / footgun

Because your app trusts the headers **blindly and performs zero verification**, it is only safe when it is *always* behind the sanitizing gateway. If the app is ever reachable directly (bypassing Traefik), anyone can send `X-Auth-User-Id: <anything>` and impersonate any user — including forging an admin by setting `X-Auth-User-Email` to an admin-listed address. **Deployment must guarantee the app is only reachable through the gateway.** Do not add a public ingress that skips Traefik.

---

## 2. The header contract (authoritative)

These are the headers the gateway injects. This is the source of truth for the profile shape.

| Header | Example | Notes |
|---|---|---|
| `X-Auth-User-Id` | `"abc123"` | **better-auth internal user ID.** An opaque string — do **not** assume it is a database ObjectId or numeric. This is the stable primary identifier for the user. |
| `X-Auth-User-Email` | `"alice@example.com"` | From the Microsoft profile. |
| `X-Auth-User-Name` | `"Alice Tan"` | From the Microsoft profile. |
| `X-Auth-User-Image` | `"https://graph.microsoft.com/..."` | Avatar URL. **May be empty.** |

Header names are case-insensitive; read them lowercase (`x-auth-user-id`, etc.).

### Canonical session type & parser (copy verbatim)

```ts
export type Session = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

// The exact pattern appcentral uses. Presence of the id header is the trust signal.
function sessionFromHeaders(headers: Headers): Session | null {
  const id = headers.get('x-auth-user-id');
  if (!id) return null;
  return {
    id,
    email: headers.get('x-auth-user-email') ?? '',
    name:  headers.get('x-auth-user-name') ?? '',
    image: headers.get('x-auth-user-image') || null, // '' → null
  };
}

// In a route handler:
const session = sessionFromHeaders(request.headers);
if (!session) return new Response('Unauthorized', { status: 401 });
```

> **IMPORTANT DIVERGENCE FROM THE REFERENCE CODE.** The existing openMIC implementation (see §4) contains *legacy* logic that treats `X-Auth-User-Id` as a possible MongoDB ObjectId and falls back to `findById`. That was a one-time migration accommodation specific to openMIC's pre-existing user records. **Per the authoritative header contract above, `X-Auth-User-Id` is an opaque better-auth string (`"abc123"`) and must not be interpreted as an ObjectId.** For a fresh implementation, do NOT port the ObjectId/`findById` fallback — key users solely on the gateway id. This is called out again in §4.3 and §6.

---

## 3. End-to-end flow (what happens on a request)

```
┌──────────────┐   1. user logs in (Microsoft SSO via better-auth)
│  appcentral  │◄─────────────────────────────────────────────────┐
│   portal     │                                                   │
└──────┬───────┘   sets httpOnly cookie auth_gateway.session_token │
       │            (scoped to .appcentral.com)                    │
       ▼                                                           │
┌──────────────┐   2. request to your-app.appcentral.com          │
│   Traefik    │   - strips any client X-Auth-User-* headers       │
│  + gateway   │   - verifies session cookie                       │
│              │   - if invalid → 401/403 (never reaches you) ─────┘
└──────┬───────┘   - if valid → injects X-Auth-User-* headers
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  YOUR APP                                                      │
│  3. read X-Auth-User-* headers → Session | null               │
│  4. find-or-create local user record keyed by the gateway id  │
│  5. assign role (admin allowlist / existing-admin / dev)       │
│  6. route guards: no session → 401 (API) or portal msg (page) │
└──────────────────────────────────────────────────────────────┘
```

There is **no** `/login`, `/logout`, `/signin`, OAuth callback, password form, token exchange, or app-owned session/cookie anywhere in your app. "Logging out" is a gateway concern; your app has no logout.

---

## 4. Reference implementation (Next.js 16 App Router + Mongoose)

This is exactly how openMIC implements it today. File paths are relative to `src/`. Reuse or adapt per your stack.

### 4.0 File map

| File | Role |
|---|---|
| `proxy.ts` | Next.js middleware. **Dev-only shim** that fabricates headers when no gateway is in front. Pass-through in production. |
| `lib/auth/session.ts` | Reads headers → find-or-create user → returns `SessionUser` (incl. role). The core. |
| `lib/api/auth-guard.ts` | `requireAuth()` / `requireAdmin()` helpers for API routes. |
| `app/api/auth/me/route.ts` | `GET /api/auth/me` — returns the current user record or 401. |
| `app/(protected)/layout.tsx` | Client layout that renders spinner / "return to portal" / the app. |
| `features/auth/hooks/use-auth.ts` | React Query hook wrapping `/api/auth/me`. |
| `lib/db/models/user.ts` | Mongoose user schema. |
| `integrations/clients/api-client.ts` | `apiRequest()` — throws `APIError` on non-2xx (drives the 401 path). |

### 4.1 Middleware / dev shim — `proxy.ts`

In production this is a pass-through. In development it injects fake headers so the app is usable locally with no gateway. **This is the only header-injecting code in the app** — in production the *gateway* is the injector.

```ts
import { NextRequest, NextResponse } from 'next/server';

const HEADER_USER_ID = 'x-auth-user-id';
const HEADER_USER_EMAIL = 'x-auth-user-email';
const HEADER_USER_NAME = 'x-auth-user-name';
const HEADER_USER_IMAGE = 'x-auth-user-image';

const DEV_USER_ID = process.env.DEV_USER_ID ?? '000000000000000000000001';
const DEV_USER_EMAIL = process.env.DEV_USER_EMAIL ?? 'admin@local';
const DEV_USER_NAME = process.env.DEV_USER_NAME ?? 'Admin User';
const DEV_USER_IMAGE = process.env.DEV_USER_IMAGE ?? '';

export default function middleware(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.next();               // prod: gateway supplies headers
  }
  if (req.headers.get(HEADER_USER_ID)) {
    return NextResponse.next();               // real headers present, don't override
  }
  const headers = new Headers(req.headers);
  headers.set(HEADER_USER_ID, DEV_USER_ID);
  headers.set(HEADER_USER_EMAIL, DEV_USER_EMAIL);
  headers.set(HEADER_USER_NAME, DEV_USER_NAME);
  headers.set(HEADER_USER_IMAGE, DEV_USER_IMAGE);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp)$).*)'],
};
```

Dev env vars (`.env.example`): `DEV_USER_ID`, `DEV_USER_EMAIL`, `DEV_USER_NAME`, `DEV_USER_IMAGE`. Override to test as different users locally.

### 4.2 Session resolution — `lib/auth/session.ts`

Returns the enriched `SessionUser` (profile + role) and performs find-or-create + role assignment.

```ts
export interface SessionUser {
  id: string;          // local DB _id as string
  email: string;
  name: string;
  image: string | null;
  role: 'user' | 'admin';
}

const GATEWAY_PROVIDER = 'appcentral';

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}
function isAdminEmail(email?: string | null) {
  return !!email && getAdminEmails().includes(email.toLowerCase());
}
// Any dev session is treated as admin so local workflows work out of the box.
function isDevSession() { return process.env.NODE_ENV === 'development'; }

interface HeaderProfile { gatewayId: string; email: string; name: string; image: string | null; }

function readHeaderProfile(h: Headers): HeaderProfile | null {
  const gatewayId = h.get('x-auth-user-id');
  if (!gatewayId) return null;
  const image = h.get('x-auth-user-image');
  return {
    gatewayId,
    email: h.get('x-auth-user-email') ?? '',
    name: h.get('x-auth-user-name') ?? '',
    image: image && image.length > 0 ? image : null,
  };
}

async function resolveSessionUser(profile: HeaderProfile) {
  await connectDB();

  // Primary lookup: by gateway id (steady state).
  let user = await User.findOne({ authGatewayId: profile.gatewayId });

  // ⚠️ LEGACY openMIC-ONLY backfill — DO NOT PORT to a new app (see §2/§6).
  // if (!user && looksLikeObjectId(profile.gatewayId)) {
  //   const legacy = await User.findById(profile.gatewayId);
  //   if (legacy) { legacy.authGatewayId = profile.gatewayId; user = legacy; }
  // }

  // Role: never downgrade an existing admin; promote allowlisted emails; dev = admin.
  const role =
    user?.role === 'admin' || isAdminEmail(profile.email) || isDevSession()
      ? 'admin' : 'user';

  if (user) {                                   // update-on-every-login
    if (profile.email) user.email = profile.email;
    if (profile.name) user.displayName = profile.name;
    if (profile.image !== null) user.avatarUrl = profile.image;
    user.role = role;
    user.lastLogin = new Date();
    await user.save();
    return user;
  }

  return User.create({                          // first sighting → create
    provider: GATEWAY_PROVIDER,
    providerId: profile.gatewayId,
    authGatewayId: profile.gatewayId,
    email: profile.email,
    displayName: profile.name || profile.email || 'User',
    avatarUrl: profile.image ?? undefined,
    role,
    lastLogin: new Date(),
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const profile = readHeaderProfile(await headers()); // next/headers
  if (!profile) return null;
  try {
    const user = await resolveSessionUser(profile);
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.displayName,
      image: user.avatarUrl ?? null,
      role: user.role,
    };
  } catch (error) {
    console.error('Failed to resolve session user from headers:', error);
    return null;
  }
}
```

**Behavioral notes to preserve:**
- **Presence of `x-auth-user-id` is the only gate.** No id → `null` → unauthenticated.
- **Just-in-time provisioning.** There is no separate signup; the first authenticated request creates the local user row.
- **Profile is refreshed on every request** from the headers (email/name/avatar), so the local record stays in sync with the Microsoft profile.
- **Role precedence:** existing admin (never demote) → `ADMIN_EMAILS` allowlist → dev-session auto-admin → else `user`.

### 4.3 User schema — `lib/db/models/user.ts`

```ts
export interface IUser extends Document {
  provider: string;        // 'appcentral' for gateway-created users
  providerId: string;      // the gateway id (better-auth id)
  authGatewayId?: string;  // the gateway id; unique+sparse index — primary lookup key
  email: string;           // indexed
  displayName: string;
  avatarUrl?: string;
  role: 'user' | 'admin';  // default 'user'
  lastLogin: Date;
  createdAt: Date; updatedAt: Date;
}
// indexes:
userSchema.index({ provider: 1, providerId: 1 }, { unique: true });
userSchema.index({ authGatewayId: 1 }, { unique: true, sparse: true });
```

For a fresh app, `authGatewayId` (= `X-Auth-User-Id`) is your natural primary key. `provider`/`providerId` are bookkeeping; you may collapse them if you don't need multi-provider history.

### 4.4 API guards — `lib/api/auth-guard.ts`

```ts
export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  return { user };
}
export async function requireAdmin() {
  const result = await requireAuth();
  if (result.error) return result;
  if (result.user.role !== 'admin')
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  return result;
}
```

Usage in a route: `const { user, error } = await requireAdmin(); if (error) return error;`

### 4.5 The one auth endpoint — `app/api/auth/me/route.ts`

The **only** auth-related HTTP endpoint. It's a status/read endpoint, not a login endpoint.

```ts
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await connectDB();
  const user = await User.findById(session.id).lean();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  return NextResponse.json(user);
}
```

### 4.6 Frontend — `features/auth/hooks/use-auth.ts` + `(protected)/layout.tsx`

`apiRequest` (`integrations/clients/api-client.ts`) throws `APIError` on any non-2xx. `useAuth` swallows that into `null`:

```ts
export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      try { return await apiRequest<MeResponse>(API_ROUTES.AUTH_ME); }
      catch { return null; }          // 401 → null, no redirect, no toast
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const user = data ? { id: data._id, email: data.email, /* ...*/ role: data.role } : null;
  const isAdmin = user?.role === 'admin';
  return { user, isAdmin, isLoading, /* ... */ };
}
```

Protected layout — spinner while loading, dead-end message when unauthenticated (**no redirect**, because there is no in-app login page to redirect to):

```tsx
'use client';
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!user) return (
    <div className="... text-center ...">
      <p>Could not load your session. Please return to the appcentral portal and try again.</p>
    </div>
  );
  return <MainLayout>{children}</MainLayout>;
}
```

---

## 5. Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `ADMIN_EMAILS` | prod + dev | Comma-separated emails auto-promoted to admin on login/creation. Existing admins are never demoted by its absence. |
| `DEV_USER_ID` | dev only | Fake gateway id injected by `proxy.ts` when no gateway is present. |
| `DEV_USER_EMAIL` | dev only | Fake email (default `admin@local`). |
| `DEV_USER_NAME` | dev only | Fake display name. |
| `DEV_USER_IMAGE` | dev only | Fake avatar URL. |

Note: in dev, **every** session is auto-admin (§4.2 `isDevSession()`), independent of `ADMIN_EMAILS`.

---

## 6. Implementation checklist for the target app

Port these in order. Items marked ⚠️ are decisions, not copy-paste.

1. **[Gateway/infra] Guarantee the app is only reachable via Traefik/appcentral.** No direct public ingress. This is the entire security model (§1).
2. **Header parser.** Implement `sessionFromHeaders(headers) → Session | null` exactly as in §2. Presence of `x-auth-user-id` is the gate; empty image → `null`.
3. **User store.** Create a `users` table/collection keyed on the gateway id (`authGatewayId` / `X-Auth-User-Id`), with `email`, `displayName`, `avatarUrl`, `role`, `lastLogin`, timestamps. Unique index on the gateway id.
   - ⚠️ **Do NOT port openMIC's ObjectId `findById` fallback.** The gateway id is an opaque better-auth string, not a DB id (§2).
4. **Find-or-create + profile refresh.** On each authenticated request: look up by gateway id; if found, refresh email/name/avatar + `lastLogin`; if not, create. (§4.2)
5. **Role logic.** existing-admin → never demote; email in `ADMIN_EMAILS` → admin; dev session → admin; else user. (§4.2)
   - ⚠️ Decide whether "dev session = admin" applies to your environment model; keep it dev-only.
6. **Route guards.** `requireAuth()` → 401 when no session; `requireAdmin()` → 403 when not admin. Apply to every protected API route. (§4.4)
7. **`GET /api/auth/me`** (or your framework's equivalent) returning the current user or 401. (§4.5)
8. **Frontend session hook** that calls `/api/auth/me`, treats non-2xx as "no user," does **not** redirect. (§4.6)
9. **Protected UI boundary:** loading spinner → "return to the portal" message when unauthenticated → app. **No login page, no logout button.** (§4.6)
10. **Dev shim** for local runs without the gateway (inject fake headers when `x-auth-user-id` is absent and env is development). (§4.1)
11. **Env vars:** `ADMIN_EMAILS` (prod), `DEV_USER_*` (dev). (§5)

### Things NOT to build (explicitly out of scope)
- ❌ Login / sign-in page or form
- ❌ Logout / sign-out (gateway concern)
- ❌ OAuth callbacks, token exchange, password handling
- ❌ App-owned session cookies or JWTs — you read headers per request, statelessly
- ❌ Refresh-token logic
- ❌ Any validation/verification of the headers (the gateway is the trust anchor)

---

## 7. Stack-agnostic contract (if the target app is not Next.js/Mongo)

The whole flow reduces to a per-request middleware plus a user upsert:

```
on each request:
  session = sessionFromHeaders(request.headers)   # {id,email,name,image} | null
  if session is null:
      if API route  -> 401 Unauthorized
      if page route -> render "return to portal" (do NOT redirect to a login page)
      stop.
  user = upsertUser(
      key            = session.id,                 # gateway id, opaque string
      email          = session.email,
      displayName    = session.name,
      avatarUrl      = session.image,
      lastLogin      = now,
      role           = existingUser.role == 'admin' ? 'admin'
                       : session.email in ADMIN_EMAILS ? 'admin'
                       : devMode ? 'admin'
                       : 'user'
  )
  attach user to request context
```

Any framework (Express/Fastify/Nest/Django/Rails/Go/etc.) can implement this as one middleware. The database can be anything; the only requirement is a unique key on the gateway id.

---

## 8. Source-of-truth references (openMIC)

- `src/proxy.ts` — dev header shim / prod pass-through
- `src/lib/auth/session.ts` — header parse + find-or-create + role
- `src/lib/api/auth-guard.ts` — `requireAuth` / `requireAdmin`
- `src/app/api/auth/me/route.ts` — the only auth endpoint
- `src/app/(protected)/layout.tsx` — unauthenticated UI boundary
- `src/features/auth/hooks/use-auth.ts` — frontend session hook
- `src/lib/db/models/user.ts` — user schema/indexes
- `src/integrations/clients/api-client.ts` — `apiRequest` throw-on-non-2xx
- appcentral header contract (authoritative): `appcentral/src/lib/session.ts` (`Session` type + `sessionFromHeaders`)
