"use client";

import type { RunStage } from "@/lib/use-assessment";

type Props = {
  stage: RunStage;
  phase?: string;
  message?: string;
  resumed?: boolean;
};

// Ordered phases the agent reports while assessing. Used to render a stepper.
const PHASES: { key: string; label: string }[] = [
  { key: "starting", label: "Starting" },
  { key: "gathering", label: "Gathering evidence" },
  { key: "assessing", label: "Assessing controls" },
  { key: "remediating", label: "Remediation" },
  { key: "filling", label: "Filling SSP" },
  { key: "done", label: "Done" },
];

function stageHeadline(stage: RunStage): string {
  switch (stage) {
    case "cloning":
      return "Cloning repository…";
    case "starting":
      return "Starting assessment…";
    case "assessing":
      return "Running assessment…";
  }
}

export function ProgressView({ stage, phase, message, resumed }: Props) {
  const activeIndex = phase
    ? PHASES.findIndex((p) => p.key === phase)
    : -1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
          aria-hidden
        />
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {stageHeadline(stage)}
          </h2>
          {resumed && (
            <p className="text-xs text-amber-600">
              Resumed an in-flight assessment after a page refresh.
            </p>
          )}
        </div>
      </div>

      {message && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      )}

      {stage === "assessing" && (
        <ol className="space-y-2">
          {PHASES.map((p, i) => {
            const done = activeIndex >= 0 && i < activeIndex;
            const active = i === activeIndex;
            return (
              <li key={p.key} className="flex items-center gap-3 text-sm">
                <span
                  className={[
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done
                      ? "bg-green-100 text-green-700"
                      : active
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-400",
                  ].join(" ")}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={
                    active
                      ? "font-medium text-slate-900"
                      : done
                        ? "text-slate-600"
                        : "text-slate-400"
                  }
                >
                  {p.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-xs text-slate-500">
        This can take several minutes. The work runs on the agent — you can leave
        this tab open; a refresh will resume polling.
      </p>
    </div>
  );
}
