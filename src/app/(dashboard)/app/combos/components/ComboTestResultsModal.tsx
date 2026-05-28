import AppIcon from "@/shared/components/AppIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function ComboTestResultsView({ results }) {
  if (results?.error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500">
        <AppIcon name="error" size={18} />
        <span>{typeof results.error === "string" ? results.error : JSON.stringify(results.error)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {results?.resolvedBy ? (
        <div className="flex items-center gap-2 text-sm">
          <AppIcon name="check_circle" size={18} className="text-emerald-500" />
          <div className="min-w-0">
            <div>
              Resolved by{" "}
              <code className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">{results.resolvedBy}</code>
            </div>
            {results?.resolvedByTarget?.connectionId || results?.resolvedByTarget?.stepId ? (
              <div className="mt-1 text-xs text-text-muted">
                {results?.resolvedByTarget?.connectionId ? `account ${String(results.resolvedByTarget.connectionId).slice(0, 8)}` : "dynamic account"}
                {results?.resolvedByTarget?.stepId ? ` · step ${results.resolvedByTarget.stepId}` : ""}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {(results?.results || []).map((entry, index) => (
        <div key={`${entry.executionKey || entry.modelStr || index}-${index}`} className="flex items-center gap-2 rounded bg-black/[0.02] px-2 py-1.5 text-xs dark:bg-white/[0.02]">
          <AppIcon
            name={entry.status === "ok" ? "check_circle" : entry.status === "skipped" ? "skip_next" : "error"}
            size={14}
            className={entry.status === "ok" ? "text-emerald-500" : entry.status === "skipped" ? "text-text-muted" : "text-red-500"}
          />
          <div className="min-w-0 flex-1">
            <code className="block truncate font-mono">{entry.label || entry.modelStr || entry.model || "Unknown target"}</code>
            {entry.connectionId || entry.stepId ? (
              <div className="mt-0.5 text-[10px] text-text-muted">
                {entry.connectionId ? `acct ${String(entry.connectionId).slice(0, 8)}` : "dynamic account"}
                {entry.stepId ? ` · ${entry.stepId}` : ""}
              </div>
            ) : null}
          </div>
          {entry.latencyMs !== undefined ? <span className="text-text-muted">{entry.latencyMs}ms</span> : null}
          <span className={`text-[10px] font-medium uppercase ${entry.status === "ok" ? "text-emerald-500" : entry.status === "skipped" ? "text-text-muted" : "text-red-500"}`}>
            {entry.status}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ComboTestResultsModal({ testResults, testingCombo, setTestResults, setTestingCombo }) {
  if (!testResults) return null;

  return (
    <Dialog open={!!testResults} onOpenChange={(open) => { if (!open) { setTestResults(null); setTestingCombo(""); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Test Results{testingCombo ? ` · ${testingCombo}` : ""}</DialogTitle>
          <p className="text-xs text-muted-foreground">Quick combo execution check across resolved targets.</p>
        </DialogHeader>
        <ComboTestResultsView results={testResults} />
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => { setTestResults(null); setTestingCombo(""); }}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
