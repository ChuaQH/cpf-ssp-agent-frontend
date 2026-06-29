"use client";

import { useEffect, useRef, useState } from "react";
import { callAgent, newSessionId } from "@/lib/client";
import { isAgentError, type ChatTurn, type RefineResponse } from "@/lib/types";
import { MarkdownView } from "@/components/MarkdownView";

type Props = {
  /** Project id of the completed assessment to refine (from result.project). */
  project: string;
  /** Called after a turn that changed verdicts or remediation, so the parent can
   *  merge the regenerated artifacts back into the displayed result. */
  onRefined: (resp: RefineResponse) => void;
};

type LastUpdate = { controlIds: string[]; remediation: boolean };

const EXAMPLES = [
  'Mark AS-3 compliant — MFA is enforced via Azure AD.',
  'The AS-5 gap is just a config flag: low effort, quick win.',
];

export function RefinePanel({ project, onRefined }: Props) {
  // One session id per refine conversation, generated once and reused for every
  // turn (distinct from the assessment's session) — the one-session-per-
  // conversation rule keeps all turns on the same warm agent instance.
  const [sessionId] = useState(() => newSessionId());

  // Confirmed transcript echoed by the agent. Starts empty; after each successful
  // turn we replace it wholesale with resp.history (which already includes the
  // just-sent user message and the assistant reply — so we never also append).
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  // The in-flight message, shown optimistically and kept visible on error so it
  // can be retried without retyping.
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<LastUpdate | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pendingUser, busy, error]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setPendingUser(trimmed);
    setInput("");
    setError(null);
    setLastUpdate(null);
    setBusy(true);
    try {
      // history = prior confirmed turns only; the new text goes in `message`.
      const resp = await callAgent<RefineResponse>(
        { action: "refine", project, message: trimmed, history: messages },
        sessionId,
      );
      if (isAgentError(resp)) {
        // Keep pendingUser visible (do NOT append an assistant turn) so the user
        // can read what they sent and retry.
        setError(resp.error);
        return;
      }
      setMessages(resp.history);
      setPendingUser(null);
      if (resp.changed_control_ids.length || resp.remediation_updated) {
        setLastUpdate({
          controlIds: resp.changed_control_ids,
          remediation: resp.remediation_updated,
        });
        onRefined(resp);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refine request failed.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  // Optimistic view: confirmed transcript + the in-flight user message (if any).
  const view: ChatTurn[] = pendingUser
    ? [...messages, { role: "user", content: pendingUser }]
    : messages;

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Refine this assessment
        </h3>
        <p className="text-sm text-slate-500">
          Chat with the agent to correct a control verdict or adjust a
          remediation. Edits regenerate the artifacts and update the results
          above in place.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="mb-4 max-h-[26rem] space-y-4 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-4"
      >
        {view.length === 0 && !busy && (
          <div className="py-6 text-center text-sm text-slate-400">
            <p>Ask the agent to adjust the assessment. For example:</p>
            <ul className="mt-3 space-y-1">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    onClick={() => setInput(ex)}
                    className="text-blue-600 hover:underline"
                  >
                    “{ex}”
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.map((turn, i) => (
          <div
            key={i}
            className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            {turn.role === "user" ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
                {turn.content}
              </div>
            ) : (
              <div className="max-w-[90%] rounded-lg border border-slate-200 bg-white px-3 py-2">
                <MarkdownView content={turn.content} />
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            Agent is working…
          </div>
        )}

        {lastUpdate && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            Updated{" "}
            {lastUpdate.controlIds.length > 0 && (
              <>
                {lastUpdate.controlIds.length} control
                {lastUpdate.controlIds.length === 1 ? "" : "s"} (
                {lastUpdate.controlIds.join(", ")})
                {lastUpdate.remediation ? " and the " : ""}
              </>
            )}
            {lastUpdate.remediation && "remediation plan"}. The results and
            downloads above now reflect this change.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span className="font-medium">Refine failed:</span> {error}
            {pendingUser && (
              <button
                type="button"
                onClick={() => void send(pendingUser)}
                className="ml-2 font-medium underline hover:no-underline"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          className="min-h-[2.5rem] flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
          rows={2}
          placeholder="e.g. Mark AS-3 compliant — MFA is via Azure AD"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={busy || input.trim().length === 0}
          className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Send
        </button>
      </div>
    </section>
  );
}
