"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/use-auth";

// The protected UI boundary. Spinner while resolving the session; a dead-end
// "return to portal" message when there is no identity (NO redirect — auth is
// owned by the gateway and there is no in-app login page); otherwise the app.
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span
          className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
          aria-label="Loading session"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">
            Session not found
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Could not load your session. Please return to the appcentral portal
            and sign in, then try again.
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
