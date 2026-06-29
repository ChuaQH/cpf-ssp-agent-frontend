// Shared types for the agent API contract. These mirror the cpf-ssp-agent
// responses described in the product spec. Every agent response may instead be
// an error envelope, so consumers must check for `error` first.

export type AgentError = { error: string };

export function isAgentError(v: unknown): v is AgentError {
  return (
    typeof v === "object" &&
    v !== null &&
    "error" in v &&
    typeof (v as { error: unknown }).error === "string"
  );
}

// --- tiers --------------------------------------------------------------------

export type Tier = {
  tier: string;
  template?: string;
};

export type TiersResponse = {
  default_tier: string;
  count: number;
  tiers: Tier[];
};

// --- workspace/clone ----------------------------------------------------------

export type CloneResponse = {
  project_id: string;
  root?: string;
  iac_present?: boolean;
};

// --- assess/full/start --------------------------------------------------------

export type AssessStartResponse = {
  job_id: string;
  status: JobStatus;
  poll?: { action: "job/status"; job_id: string };
};

// --- job/status ---------------------------------------------------------------

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type JobPhase =
  | "starting"
  | "gathering"
  | "assessing"
  | "remediating"
  | "filling"
  | "done";

export type JobProgress = {
  phase: JobPhase | string;
  message: string;
};

export type AgentFile = {
  filename: string;
  encoding: "utf-8" | "base64";
  content: string;
};

export type HostingUsed = {
  label: string;
  source: string;
  detected_clouds?: string[];
  signals?: Record<string, unknown>;
};

export type AssessmentGroup = {
  label: string;
  controls: number;
  remediation_status: string;
  steps_produced?: number;
  quick_wins_produced?: number;
};

export type AssessmentResult = {
  project: string;
  tier: string;
  summary: Record<string, number>;
  blocking_findings: number;
  // null when reopened via assess/result with no detected hosting
  hosting_used: HostingUsed | null;
  // optional: assess/result (reopening a stored assessment) does NOT return the
  // per-group table — it isn't persisted — so ResultsView must tolerate absence.
  groups?: AssessmentGroup[];
  remediation_summary?: Record<string, unknown> | null;
  // server-side paths — informational only, never used for downloads
  artifacts?: Record<string, unknown>;
  files: Record<string, AgentFile>;
};

export type JobStatusResponse = {
  job_id: string;
  action?: string;
  status: JobStatus;
  progress?: JobProgress;
  created_at?: string;
  updated_at?: string;
  // present when status === "completed"
  result?: AssessmentResult;
  // present when status === "failed"
  error?: string;
};

// --- project history (list-projects / assess/result) -------------------------

export type ProjectSummary = {
  project: string;
  updated_at: string; // ISO8601
};

export type ListProjectsResponse = {
  count: number;
  projects: ProjectSummary[]; // newest first
};

// assess/result returns an AssessmentResult (with groups absent — see that type).

// --- refine -------------------------------------------------------------------

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type RefineResponse = {
  project: string;
  // assistant's plain-text summary of what changed (markdown)
  reply: string;
  // control verdicts changed this turn
  changed_control_ids: string[];
  // remediation steps changed this turn
  changed_remediation_ids: string[];
  remediation_updated: boolean;
  // FULL transcript: the history we sent + this turn's user + assistant messages
  history: ChatTurn[];
  // present only when verdicts changed
  summary?: Record<string, number>;
  blocking_findings?: number;
  // present only when artifacts were regenerated — a PARTIAL map of just the
  // changed files (same entry shape as AssessmentResult.files):
  //   verdict change     → gap_report_md, filled_ssp, assessment_results_json
  //   remediation change → remediation_plan_md, remediation_plan_json
  files?: Record<string, AgentFile>;
};

// --- request payloads ---------------------------------------------------------

export type AgentAction =
  | "tiers"
  | "workspace/clone"
  | "assess/full/start"
  | "job/status"
  | "refine";

export type AgentPayload = { action: AgentAction; [key: string]: unknown };
