"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAgent, newSessionId } from "./client";
import {
  isAgentError,
  type AssessmentResult,
  type AssessStartResponse,
  type CloneResponse,
  type JobStatusResponse,
} from "./types";

export type AssessmentInput = {
  app_repo_url: string;
  iac_repo_url?: string;
  app_branch?: string;
  iac_branch?: string;
  pat?: string;
  tier: string;
  hosting?: string;
};

export type RunStage = "cloning" | "starting" | "assessing";

export type RunState =
  | { kind: "idle" }
  | {
      kind: "running";
      stage: RunStage;
      phase?: string;
      message?: string;
      resumed?: boolean;
    }
  | { kind: "done"; result: AssessmentResult }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 4000;
const OVERALL_CAP_MS = 20 * 60 * 1000; // 20 minutes
const MAX_TRANSIENT_FAILURES = 6;
const STORAGE_KEY = "cpf-ssp-inflight-job";

type InFlight = {
  jobId: string;
  sessionId: string;
  tier: string;
  startedAt: number;
};

function loadInFlight(): InFlight | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as InFlight;
    if (v && typeof v.jobId === "string" && typeof v.sessionId === "string") {
      return v;
    }
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

function saveInFlight(v: InFlight): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* storage may be unavailable; polling still works in-memory */
  }
}

function clearInFlight(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useAssessment() {
  const [state, setState] = useState<RunState>({ kind: "idle" });
  // Generation counter: bumped to cancel any in-flight polling loop (e.g. on a
  // new run or reset). Each loop captures its generation and stops if superseded.
  const genRef = useRef(0);
  const resumeAttempted = useRef(false);

  const pollUntilDone = useCallback(
    async (
      jobId: string,
      sessionId: string,
      startedAt: number,
      gen: number,
      resumed: boolean,
    ) => {
      let transient = 0;
      while (genRef.current === gen) {
        let resp: JobStatusResponse | { error: string };
        try {
          resp = await callAgent<JobStatusResponse>(
            { action: "job/status", job_id: jobId },
            sessionId,
          );
        } catch (e) {
          // Network blip — retry a few times before giving up.
          transient += 1;
          if (transient > MAX_TRANSIENT_FAILURES) {
            clearInFlight();
            setState({
              kind: "error",
              message:
                e instanceof Error
                  ? `Lost contact with the agent while polling: ${e.message}`
                  : "Lost contact with the agent while polling.",
            });
            return;
          }
          await sleep(POLL_INTERVAL_MS);
          continue;
        }
        transient = 0;
        if (genRef.current !== gen) return; // superseded

        if (isAgentError(resp)) {
          clearInFlight();
          setState({ kind: "error", message: resp.error });
          return;
        }

        if (resp.status === "completed") {
          clearInFlight();
          if (resp.result) {
            setState({ kind: "done", result: resp.result });
          } else {
            setState({
              kind: "error",
              message: "Assessment completed but returned no result payload.",
            });
          }
          return;
        }

        if (resp.status === "failed") {
          clearInFlight();
          setState({
            kind: "error",
            message: resp.error ?? "The assessment failed.",
          });
          return;
        }

        // pending / running — update progress and keep polling.
        setState({
          kind: "running",
          stage: "assessing",
          phase: resp.progress?.phase,
          message: resp.progress?.message,
          resumed,
        });

        if (Date.now() - startedAt > OVERALL_CAP_MS) {
          // Don't clear storage — the job may still finish on the agent; a later
          // refresh can resume polling it.
          setState({
            kind: "error",
            message:
              "Timed out waiting for the assessment (over 20 minutes). The job may still be running on the agent — refresh to resume polling.",
          });
          return;
        }

        await sleep(POLL_INTERVAL_MS);
      }
    },
    [],
  );

  const start = useCallback(
    async (input: AssessmentInput) => {
      const gen = ++genRef.current;
      const sessionId = newSessionId();

      setState({ kind: "running", stage: "cloning" });

      // 1) workspace/clone — ingest the repo.
      let clone: CloneResponse | { error: string };
      try {
        clone = await callAgent<CloneResponse>(
          {
            action: "workspace/clone",
            app_repo_url: input.app_repo_url,
            ...(input.iac_repo_url ? { iac_repo_url: input.iac_repo_url } : {}),
            ...(input.app_branch ? { app_branch: input.app_branch } : {}),
            ...(input.iac_branch ? { iac_branch: input.iac_branch } : {}),
            ...(input.pat ? { pat: input.pat } : {}),
          },
          sessionId,
        );
      } catch (e) {
        if (genRef.current !== gen) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Cloning failed.",
        });
        return;
      }
      if (genRef.current !== gen) return;
      if (isAgentError(clone)) {
        setState({ kind: "error", message: clone.error });
        return;
      }
      if (!clone.project_id) {
        setState({
          kind: "error",
          message: "Clone succeeded but returned no project_id.",
        });
        return;
      }

      // 2) assess/full/start — kick off the background assessment.
      setState({ kind: "running", stage: "starting" });
      let started: AssessStartResponse | { error: string };
      try {
        started = await callAgent<AssessStartResponse>(
          {
            action: "assess/full/start",
            project: clone.project_id,
            tier: input.tier,
            include_files: true,
            ...(input.hosting ? { hosting: input.hosting } : {}),
          },
          sessionId,
        );
      } catch (e) {
        if (genRef.current !== gen) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Failed to start assessment.",
        });
        return;
      }
      if (genRef.current !== gen) return;
      if (isAgentError(started)) {
        setState({ kind: "error", message: started.error });
        return;
      }
      if (!started.job_id) {
        setState({
          kind: "error",
          message: "Start succeeded but returned no job_id.",
        });
        return;
      }

      // 3) Persist + poll.
      const startedAt = Date.now();
      saveInFlight({
        jobId: started.job_id,
        sessionId,
        tier: input.tier,
        startedAt,
      });
      setState({
        kind: "running",
        stage: "assessing",
        phase: "starting",
        message: "Assessment queued…",
      });
      void pollUntilDone(started.job_id, sessionId, startedAt, gen, false);
    },
    [pollUntilDone],
  );

  const reset = useCallback(() => {
    genRef.current += 1; // cancel any running poll
    clearInFlight();
    setState({ kind: "idle" });
  }, []);

  // On mount, resume an in-flight job if one is persisted (page refresh).
  useEffect(() => {
    if (resumeAttempted.current) return;
    resumeAttempted.current = true;
    const inflight = loadInFlight();
    if (!inflight) return;
    const gen = ++genRef.current;
    setState({
      kind: "running",
      stage: "assessing",
      message: "Resuming in-flight assessment…",
      resumed: true,
    });
    void pollUntilDone(
      inflight.jobId,
      inflight.sessionId,
      inflight.startedAt,
      gen,
      true,
    );
  }, [pollUntilDone]);

  return { state, start, reset };
}
