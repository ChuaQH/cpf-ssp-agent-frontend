"use client";

import { useCallback, useEffect, useState } from "react";
import { callAgent } from "@/lib/client";
import { isAgentError, type ListProjectsResponse } from "@/lib/types";

type Props = {
  /** Open a project by id (parent fetches assess/result and shows it). */
  onOpen: (project: string) => void;
  /** Id currently being opened, so its row can show a spinner / disable the list. */
  openingProject?: string | null;
};

type ListState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ListProjectsResponse };

/** Best-effort relative time ("3h ago"), falling back to a locale date. Runs only
 *  in the browser (after the list fetch), so there's no SSR hydration mismatch. */
function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toLocaleDateString();
}

export function ProjectsList({ onOpen, openingProject }: Props) {
  const [state, setState] = useState<ListState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const resp = await callAgent<ListProjectsResponse>({
        action: "list-projects",
      });
      if (isAgentError(resp)) {
        setState({ kind: "error", message: resp.error });
        return;
      }
      setState({ kind: "ready", data: resp });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load projects.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = openingProject != null;

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Recent assessments
        </h2>
        {state.kind === "ready" && (
          <button
            onClick={() => void load()}
            disabled={busy}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
          >
            Refresh
          </button>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          Loading past assessments…
        </div>
      )}

      {state.kind === "error" && (
        <div className="space-y-3">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span className="font-medium">Could not load assessments:</span>{" "}
            {state.message}
          </div>
          <button
            onClick={() => void load()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      )}

      {state.kind === "ready" &&
        (state.data.projects.length === 0 ? (
          <p className="text-sm text-slate-500">
            No past assessments yet. Run one above and it will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {state.data.projects.map((p) => {
              const opening = openingProject === p.project;
              return (
                <li key={p.project}>
                  <button
                    onClick={() => onOpen(p.project)}
                    disabled={busy}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="truncate font-mono text-sm text-slate-800">
                      {p.project}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                      {opening ? (
                        <>
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                          Opening…
                        </>
                      ) : (
                        formatWhen(p.updated_at)
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
