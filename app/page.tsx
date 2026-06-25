"use client";

import { useCallback, useEffect, useState } from "react";
import { callAgent } from "@/lib/client";
import { isAgentError, type TiersResponse } from "@/lib/types";
import { AssessmentForm } from "@/components/AssessmentForm";
import { ProgressView } from "@/components/ProgressView";
import { ResultsView } from "@/components/ResultsView";
import { useAssessment } from "@/lib/use-assessment";

type TiersState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: TiersResponse };

export default function Home() {
  const [tiersState, setTiersState] = useState<TiersState>({ kind: "loading" });
  const { state, start, reset } = useAssessment();

  const loadTiers = useCallback(async () => {
    setTiersState({ kind: "loading" });
    try {
      const resp = await callAgent<TiersResponse>({ action: "tiers" });
      if (isAgentError(resp)) {
        setTiersState({ kind: "error", message: resp.error });
        return;
      }
      if (!resp.tiers || resp.tiers.length === 0) {
        setTiersState({
          kind: "error",
          message: "The agent returned no SSP tiers.",
        });
        return;
      }
      setTiersState({ kind: "ready", data: resp });
    } catch (e) {
      setTiersState({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load tiers.",
      });
    }
  }, []);

  useEffect(() => {
    void loadTiers();
  }, [loadTiers]);

  const running = state.kind === "running";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          CPF SSP Agent
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Automated IM8 compliance assessment for Singapore Government systems.
          Point it at a repository, pick an SSP tier, and download the gap
          report, remediation plan, and filled SSP.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Results take over the panel when done. */}
        {state.kind === "done" ? (
          <ResultsView result={state.result} onReset={reset} />
        ) : running ? (
          <ProgressView
            stage={state.stage}
            phase={state.phase}
            message={state.message}
            resumed={state.resumed}
          />
        ) : (
          <>
            {state.kind === "error" && (
              <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <span className="font-medium">Assessment failed:</span>{" "}
                {state.message}
              </div>
            )}

            {tiersState.kind === "loading" && (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                Loading SSP tiers…
              </div>
            )}

            {tiersState.kind === "error" && (
              <div className="space-y-3">
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <span className="font-medium">
                    Could not load SSP tiers:
                  </span>{" "}
                  {tiersState.message}
                </div>
                <button
                  onClick={() => void loadTiers()}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Retry
                </button>
              </div>
            )}

            {tiersState.kind === "ready" && (
              <AssessmentForm
                tiers={tiersState.data.tiers}
                defaultTier={tiersState.data.default_tier}
                onSubmit={start}
              />
            )}
          </>
        )}
      </div>

      <footer className="mt-6 text-center text-xs text-slate-400">
        Calls run through this app&apos;s server route — no credentials or PATs
        reach the browser.
      </footer>
    </main>
  );
}
