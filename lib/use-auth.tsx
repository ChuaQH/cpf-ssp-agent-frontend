"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "./types";

// Client session state, sourced once from GET /api/auth/me and shared via context
// so the gate and the user badge don't each fetch. A non-2xx (e.g. 401 with no
// gateway identity) resolves to `user: null` — no redirect, no toast, because
// there is no in-app login page to send the user to.

type AuthState = {
  user: AuthUser | null;
  isAdmin: boolean;
  isLoading: boolean;
};

const AuthContext = createContext<AuthState>({
  user: null,
  isAdmin: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAdmin: false,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) throw new Error(`auth/me ${res.status}`);
        const user = (await res.json()) as AuthUser;
        if (!cancelled) {
          setState({ user, isAdmin: user.role === "admin", isLoading: false });
        }
      } catch {
        if (!cancelled) {
          setState({ user: null, isAdmin: false, isLoading: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
