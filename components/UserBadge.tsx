"use client";

/* eslint-disable @next/next/no-img-element */
import { useAuth } from "@/lib/use-auth";

// Small identity chip for the header: avatar (or initials), name, and role.
// No logout button — signing out is a gateway concern, not this app's.
export function UserBadge() {
  const { user } = useAuth();
  if (!user) return null;

  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-2.5">
      {user.image ? (
        <img
          src={user.image}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
          {initials}
        </span>
      )}
      <div className="leading-tight">
        <div className="text-sm font-medium text-slate-800">
          {user.name || user.email || "User"}
        </div>
        {user.role === "admin" && (
          <div className="text-xs font-medium text-blue-600">Admin</div>
        )}
      </div>
    </div>
  );
}
