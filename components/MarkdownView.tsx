"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Shared markdown renderer used by both the assessment results' gap-report
// preview and the /preview test page, so they look identical. The
// `.markdown-body` styles (in globals.css) size and wrap everything to fit the
// container width with no horizontal scroll.
export function MarkdownView({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
