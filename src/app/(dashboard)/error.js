"use client";

import { useEffect } from "react";
import Link from "@/lib/ui/link.jsx";
import { Card, Button } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function DashboardError({ error, reset }) {
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  const errorDetails = `${error?.name || "Error"}: ${error?.message || "An unexpected error occurred."}${
    error?.digest ? `\nDigest: ${error.digest}` : ""
  }${error?.stack ? `\n\nStack:\n${error.stack}` : ""}`;

  return (
    <div className="flex w-full flex-col gap-4 py-6 max-w-3xl mx-auto">
      <Card
        title="Page Loading Error"
        subtitle="An unexpected error occurred while rendering this section."
        icon="error"
        className="border-danger/30"
      >
        <div className="flex flex-col gap-4">
          {/* Error Message Box */}
          <div className="rounded-md border border-danger/20 bg-danger/5 p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-danger font-semibold text-xs">
              <Icon name="warning" size={18} />
              <span>{error?.name || "Error"}</span>
              {error?.digest && (
                <span className="font-mono text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
                  Digest: {error.digest}
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-text-main break-words whitespace-pre-wrap select-all">
              {error?.message || "An unexpected runtime error occurred on this page."}
            </p>
          </div>

          {/* Stack trace detail — always rendered when a stack exists */}
          {error?.stack ? (
            <details open className="text-xs text-text-muted">
              <summary className="cursor-pointer font-medium hover:text-text-main transition-colors select-none py-1 flex items-center gap-1">
                <Icon name="terminal" size={18} />
                <span>Error Stack Trace</span>
              </summary>
              <pre className="mt-2 max-h-96 overflow-y-auto custom-scrollbar rounded-sm border border-border bg-bg p-3 font-mono text-[11px] text-danger whitespace-pre-wrap break-all select-all">
                {error.stack}
              </pre>
              <p className="mt-1.5 text-[11px] text-text-muted">
                Server-side stack (if the error happened during SSR) is also captured in{" "}
                <Link href="/dashboard/console-log" className="text-primary hover:underline">
                  Console Log
                </Link>{" "}
                under the same timestamp.
              </p>
            </details>
          ) : (
            <p className="text-[11px] text-text-muted">
              No client stack available (production bundle is minified). Check the{" "}
              <Link href="/dashboard/console-log" className="text-primary hover:underline">
                Console Log
              </Link>{" "}
              for the server-side stack trace matching digest{" "}
              <code className="font-mono bg-surface px-1 rounded">{error?.digest || "n/a"}</code>.
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon="refresh"
                onClick={() => reset()}
                aria-label="Try loading the page again"
              >
                Try Again
              </Button>
              <Link href="/dashboard">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="arrow_back"
                  aria-label="Return to Dashboard Overview"
                >
                  Dashboard
                </Button>
              </Link>
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={copied === "error" ? "check" : "content_copy"}
              onClick={() => copy(errorDetails, "error")}
              aria-label="Copy error details to clipboard"
            >
              {copied === "error" ? "Copied Error!" : "Copy Error Info"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
