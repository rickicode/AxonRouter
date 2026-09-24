"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function GlobalError({ error, reset }) {
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  const errorDetails = `${error?.name || "Error"}: ${error?.message || "An unexpected error occurred."}${
    error?.digest ? `\nDigest: ${error.digest}` : ""
  }${error?.stack ? `\n\nStack:\n${error.stack}` : ""}`;

  return (
    <div className="min-h-screen bg-bg text-text-main flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-danger/10 text-danger border border-danger/20">
            <Icon name="error" size={18} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-main">Application Error</h1>
            <p className="text-xs text-text-muted">A runtime exception occurred while rendering this page.</p>
          </div>
        </div>

        <div className="rounded-md border border-danger/20 bg-danger/5 p-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-danger font-semibold text-xs">
            <Icon name="warning" size={18} />
            <span>{error?.name || "Runtime Exception"}</span>
            {error?.digest && (
              <span className="font-mono text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
                Digest: {error.digest}
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-text-main break-words whitespace-pre-wrap select-all">
            {error?.message || "An unexpected error occurred."}
          </p>
        </div>

        {error?.stack ? (
          <details open className="text-xs text-text-muted">
            <summary className="cursor-pointer font-medium hover:text-text-main transition-colors select-none py-1 flex items-center gap-1">
              <Icon name="terminal" size={18} />
              <span>Error Stack Trace</span>
            </summary>
            <pre className="mt-2 max-h-96 overflow-y-auto custom-scrollbar rounded-sm border border-border bg-bg p-3 font-mono text-[11px] text-danger whitespace-pre-wrap break-all select-all">
              {error.stack}
            </pre>
          </details>
        ) : (
          <p className="text-xs text-text-muted">
            No client stack available (production bundle is minified). Digest{" "}
            <code className="font-mono bg-surface px-1 rounded">{error?.digest || "n/a"}</code> — server-side
            stack is captured in the server console log.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon="refresh"
              onClick={() => reset()}
            >
              Try Again
            </Button>
            <Link href="/dashboard">
              <Button
                variant="secondary"
                size="sm"
                icon="home"
              >
                Go to Dashboard
              </Button>
            </Link>
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={copied === "global_error" ? "check" : "content_copy"}
            onClick={() => copy(errorDetails, "global_error")}
          >
            {copied === "global_error" ? "Copied Error!" : "Copy Error Info"}
          </Button>
        </div>
      </div>
    </div>
  );
}
