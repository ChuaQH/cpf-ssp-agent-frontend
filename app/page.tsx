"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { callAgent } from "@/lib/client";
import {
  isAgentError,
  type AssessmentResult,
  type TiersResponse,
} from "@/lib/types";
import { AssessmentForm } from "@/components/AssessmentForm";
import { ProgressView } from "@/components/ProgressView";
import { ResultsView } from "@/components/ResultsView";
import { RefinePanel } from "@/components/RefinePanel";
import { ProjectsList } from "@/components/ProjectsList";
import { UserBadge } from "@/components/UserBadge";
import { useAssessment } from "@/lib/use-assessment";

type TiersState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: TiersResponse };

const CARD = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";

export default function Home() {
  const [tiersState, setTiersState] = useState<TiersState>({ kind: "loading" });
  const { state, result, start, reset, applyRefine, showResult } =
    useAssessment();
  const router = useRouter();

  // openProject: id currently being fetched (drives the list's row spinner) and
  // any error from the fetch.
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

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

  // Reopen a stored assessment by id (pure read; no re-assessment). On success
  // the result is shown via the hook, so ResultsView + RefinePanel render for it
  // exactly as for a freshly-run assessment.
  const openProject = useCallback(
    async (project: string) => {
      setOpenError(null);
      setOpening(project);
      try {
        const resp = await callAgent<AssessmentResult>({
          action: "assess/result",
          project,
        });
        if (isAgentError(resp)) {
          setOpenError(resp.error);
          return;
        }
        showResult(resp);
      } catch (e) {
        setOpenError(
          e instanceof Error ? e.message : `Could not open ${project}.`,
        );
      } finally {
        setOpening(null);
      }
    },
    [showResult],
  );

  // Reload-resume: on first mount, if the URL carries ?project=<id>, rehydrate it
  // via assess/result. Read straight from window.location (not useSearchParams) so
  // the page needs no Suspense boundary; the URL + assess/result are the source of
  // truth, so no large result is persisted to localStorage. Run once.
  const rehydrated = useRef(false);
  useEffect(() => {
    if (rehydrated.current) return;
    rehydrated.current = true;
    const pid = new URLSearchParams(window.location.search).get("project");
    if (pid) void openProject(pid);
  }, [openProject]);

  // Keep the URL in sync with the displayed project so a completed/reopened
  // assessment survives reload and is shareable. Guarded against redundant
  // navigations (and so rehydration doesn't loop).
  useEffect(() => {
    const current = new URLSearchParams(window.location.search).get("project");
    const want = result?.project ?? null;
    if (want === current) return;
    router.replace(want ? `/?project=${encodeURIComponent(want)}` : "/", {
      scroll: false,
    });
  }, [result, router]);

  const running = state.kind === "running";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            CPF SSP Agent
          </h1>
          <UserBadge />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Automated IM8 compliance assessment for Singapore Government systems.
          Point it at a repository, pick an SSP tier, and download the gap
          report, remediation plan, and filled SSP.
        </p>
      </header>

      {result ? (
        // A result is shown (from a completed run or a reopened project),
        // regardless of run state.
        <>
          <div className={CARD}>
            <ResultsView result={result} onReset={reset} />
          </div>
          <RefinePanel project={result.project} onRefined={applyRefine} />
        </>
      ) : running ? (
        <div className={CARD}>
          <ProgressView
            stage={state.stage}
            phase={state.phase}
            message={state.message}
            resumed={state.resumed}
          />
        </div>
      ) : (
        <>
          <div className={CARD}>
            {state.kind === "error" && (
              <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <span className="font-medium">Assessment failed:</span>{" "}
                {state.message}
              </div>
            )}

            {openError && (
              <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <span className="font-medium">Could not open project:</span>{" "}
                {openError}
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
                  <span className="font-medium">Could not load SSP tiers:</span>{" "}
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
          </div>

          {/* Past assessments — reopen any to view/refine without re-running. */}
          <ProjectsList onOpen={openProject} openingProject={opening} />
        </>
      )}

      <footer className="mt-6 text-center text-xs text-slate-400">
        Calls run through this app&apos;s server route — no credentials or PATs
        reach the browser.
      </footer>
    </main>
  );
}
