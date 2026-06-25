"use client";

import type { AgentFile } from "./types";

// Convert a `result.files` entry into a browser download. The agent sends each
// artifact self-describing: utf-8 text inline, or base64 to decode to bytes.

const MIME: Record<string, string> = {
  ".md": "text/markdown",
  ".json": "application/json",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
};

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function fileToBlob(f: AgentFile): Blob {
  const type = MIME[extOf(f.filename)] ?? "application/octet-stream";
  if (f.encoding === "base64") {
    const bin = atob(f.content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }
  return new Blob([f.content], { type });
}

export function downloadFile(f: AgentFile): void {
  const url = URL.createObjectURL(fileToBlob(f));
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Friendly labels for the known artifact keys; falls back to a derived label.
const KEY_LABELS: Record<string, string> = {
  gap_report_md: "Gap report",
  remediation_plan_md: "Remediation plan",
  filled_ssp: "Filled SSP",
  assessment_results_json: "Assessment results",
  remediation_plan_json: "Remediation plan (data)",
};

export function fileLabel(key: string, f: AgentFile): string {
  const base = KEY_LABELS[key] ?? key.replace(/_/g, " ");
  const ext = extOf(f.filename).replace(".", "");
  return ext ? `${base} (.${ext})` : base;
}
