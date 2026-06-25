import { readFile } from "node:fs/promises";
import path from "node:path";
import { MarkdownView } from "@/components/MarkdownView";

// Dev/test-only preview: renders ./gap-report.md from the project root with the
// exact same markdown styling as the assessment results, so you can iterate on
// the look without rerunning the full assess flow. Visit /preview.
export const dynamic = "force-dynamic";

async function loadGapReport(): Promise<string | null> {
  try {
    const file = path.join(process.cwd(), "gap-report.md");
    return await readFile(file, "utf-8");
  } catch {
    return null;
  }
}

export default async function PreviewPage() {
  const content = await loadGapReport();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Gap report preview
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Rendering <code>gap-report.md</code> from the project root — test view
          only.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {content === null ? (
          <p className="text-sm text-red-600">
            Could not read <code>gap-report.md</code> from the project root. Drop
            the file at the repo root and refresh.
          </p>
        ) : (
          <MarkdownView content={content} />
        )}
      </div>
    </main>
  );
}
