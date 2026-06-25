"use client";

import { useState } from "react";
import type { Tier } from "@/lib/types";
import type { AssessmentInput } from "@/lib/use-assessment";

type Props = {
  tiers: Tier[];
  defaultTier: string;
  disabled?: boolean;
  onSubmit: (input: AssessmentInput) => void;
};

const labelCls = "block text-sm font-medium text-slate-700 mb-1";
const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500";

export function AssessmentForm({
  tiers,
  defaultTier,
  disabled,
  onSubmit,
}: Props) {
  const [appRepoUrl, setAppRepoUrl] = useState("");
  const [iacRepoUrl, setIacRepoUrl] = useState("");
  const [appBranch, setAppBranch] = useState("");
  const [iacBranch, setIacBranch] = useState("");
  const [pat, setPat] = useState("");
  const [tier, setTier] = useState(defaultTier);
  const [hosting, setHosting] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const formValid = appRepoUrl.trim().length > 0 && pat.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid || disabled) return;
    onSubmit({
      app_repo_url: appRepoUrl.trim(),
      iac_repo_url: iacRepoUrl.trim() || undefined,
      app_branch: appBranch.trim() || undefined,
      iac_branch: iacBranch.trim() || undefined,
      pat: pat,
      tier,
      hosting: hosting.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelCls} htmlFor="app_repo_url">
          App repo URL <span className="text-red-500">*</span>
        </label>
        <input
          id="app_repo_url"
          className={inputCls}
          type="url"
          required
          disabled={disabled}
          placeholder="https://dev.azure.com/myorg/AppCentral/_git/appcentral"
          value={appRepoUrl}
          onChange={(e) => setAppRepoUrl(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          Azure DevOps HTTPS git URL (only <code>dev.azure.com</code> hosts are
          accepted).
        </p>
      </div>

      <div>
        <label className={labelCls} htmlFor="iac_repo_url">
          IaC repo URL{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="iac_repo_url"
          className={inputCls}
          type="url"
          disabled={disabled}
          placeholder="https://dev.azure.com/myorg/AppCentral/_git/appcentral-iac"
          value={iacRepoUrl}
          onChange={(e) => setIacRepoUrl(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          Improves hosting detection. Leave blank to skip.
        </p>
      </div>

      <div>
        <label className={labelCls} htmlFor="tier">
          SSP tier <span className="text-red-500">*</span>
        </label>
        <select
          id="tier"
          className={inputCls}
          disabled={disabled}
          value={tier}
          onChange={(e) => setTier(e.target.value)}
        >
          {tiers.map((t) => (
            <option key={t.tier} value={t.tier}>
              {t.tier}
              {t.template ? ` — ${t.template}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor="pat">
          Azure DevOps PAT <span className="text-red-500">*</span>
        </label>
        <input
          id="pat"
          className={inputCls}
          type="password"
          autoComplete="off"
          required
          disabled={disabled}
          placeholder="Personal Access Token with repo read access"
          value={pat}
          onChange={(e) => setPat(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          Required. Sent only to the server and forwarded to the agent — never
          stored or logged.
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50/60">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <span>Advanced options</span>
          <span className="text-slate-400">{showAdvanced ? "−" : "+"}</span>
        </button>
        {showAdvanced && (
          <div className="space-y-4 border-t border-slate-200 px-3 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="app_branch">
                  App branch
                </label>
                <input
                  id="app_branch"
                  className={inputCls}
                  type="text"
                  disabled={disabled}
                  placeholder="main"
                  value={appBranch}
                  onChange={(e) => setAppBranch(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="iac_branch">
                  IaC branch
                </label>
                <input
                  id="iac_branch"
                  className={inputCls}
                  type="text"
                  disabled={disabled}
                  placeholder="main"
                  value={iacBranch}
                  onChange={(e) => setIacBranch(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="hosting">
                Hosting override
              </label>
              <input
                id="hosting"
                className={inputCls}
                type="text"
                disabled={disabled}
                placeholder='e.g. "AWS GCC" / "Azure GCC+" — blank to auto-detect'
                value={hosting}
                onChange={(e) => setHosting(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave blank to let the agent auto-detect from the IaC repo.
              </p>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={disabled || !formValid}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Run compliance assessment
      </button>
    </form>
  );
}
