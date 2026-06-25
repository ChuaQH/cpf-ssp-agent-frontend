"use client";

import { useState } from "react";
import type { AssessmentResult } from "@/lib/types";
import { downloadFile, fileLabel } from "@/lib/download";
import { MarkdownView } from "@/components/MarkdownView";

type Props = {
  result: AssessmentResult;
  onReset: () => void;
};

const STATUS_STYLES: Record<string, string> = {
  Yes: "bg-green-100 text-green-800 border-green-200",
  Partial: "bg-amber-100 text-amber-800 border-amber-200",
  No: "bg-red-100 text-red-800 border-red-200",
  "N/A": "bg-slate-100 text-slate-600 border-slate-200",
  Unknown: "bg-slate-100 text-slate-500 border-slate-200",
};

function SummaryCards({ summary }: { summary: Record<string, number> }) {
  const entries = Object.entries(summary);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {entries.map(([status, count]) => (
        <div
          key={status}
          className={`rounded-lg border px-3 py-3 text-center ${
            STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          <div className="text-2xl font-bold">{count}</div>
          <div className="text-xs font-medium">{status}</div>
        </div>
      ))}
    </div>
  );
}

export function ResultsView({ result, onReset }: Props) {
  const fileEntries = Object.entries(result.files ?? {});
  const gap = result.files?.["gap_report_md"];
  const [showGap, setShowGap] = useState(true);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Assessment complete
          </h2>
          <p className="text-sm text-slate-500">
            Project <code className="text-slate-700">{result.project}</code> ·
            tier <code className="text-slate-700">{result.tier}</code>
          </p>
        </div>
        <button
          onClick={onReset}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          New assessment
        </button>
      </div>

      {/* Blocking findings + hosting */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          className={`rounded-lg border p-4 ${
            result.blocking_findings > 0
              ? "border-red-200 bg-red-50"
              : "border-green-200 bg-green-50"
          }`}
        >
          <div className="text-sm font-medium text-slate-600">
            Blocking findings
          </div>
          <div
            className={`mt-1 text-3xl font-bold ${
              result.blocking_findings > 0 ? "text-red-700" : "text-green-700"
            }`}
          >
            {result.blocking_findings}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            L0 No/Partial controls — must-fix before lodgement.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-600">Hosting used</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {result.hosting_used?.label ?? "—"}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {result.hosting_used?.source ?? "unknown source"}
            {result.hosting_used?.detected_clouds?.length
              ? ` · ${result.hosting_used.detected_clouds.join(", ")}`
              : ""}
          </p>
        </div>
      </div>

      {/* Summary */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Compliance summary
        </h3>
        <SummaryCards summary={result.summary ?? {}} />
      </section>

      {/* Per-group status */}
      {result.groups?.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Domain groups
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 font-medium">Controls</th>
                  <th className="px-3 py-2 font-medium">Remediation</th>
                  <th className="px-3 py-2 font-medium">Steps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.groups.map((g, i) => (
                  <tr key={`${g.label}-${i}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {g.label}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{g.controls}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {g.remediation_status}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {g.steps_produced ?? 0}
                      {g.quick_wins_produced
                        ? ` (${g.quick_wins_produced} quick win${
                            g.quick_wins_produced === 1 ? "" : "s"
                          })`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Remediation summary (render counts as-is) */}
      {result.remediation_summary &&
        Object.keys(result.remediation_summary).length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Remediation summary
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Object.entries(result.remediation_summary).map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="text-xs font-medium text-slate-500">
                    {k.replace(/_/g, " ")}
                  </div>
                  <div className="text-lg font-semibold text-slate-800">
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      {/* Downloads */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Artifacts
        </h3>
        {fileEntries.length === 0 ? (
          <p className="text-sm text-slate-500">
            No downloadable artifacts were returned.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {fileEntries.map(([key, f]) => (
              <button
                key={key}
                onClick={() => downloadFile(f)}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
              >
                <span aria-hidden>↓</span>
                {fileLabel(key, f)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Inline gap report preview */}
      {gap && gap.encoding === "utf-8" && (
        <section>
          <button
            onClick={() => setShowGap((v) => !v)}
            className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"
          >
            <span>{showGap ? "▼" : "▶"}</span>
            Gap report preview
          </button>
          {showGap && (
            <MarkdownView
              content={gap.content}
              className="max-h-[28rem] overflow-y-auto rounded-lg border border-slate-200 bg-white p-5"
            />
          )}
        </section>
      )}
    </div>
  );
}
