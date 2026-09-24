"use client";

import Modal from "@/shared/components/Modal";
import Badge from "@/shared/components/Badge";
import Button from "@/shared/components/Button";
import Icon from "@/shared/components/Icon";

export default function RequestErrorModal({ selectedError, fetchedError, loading, onClose }) {
 return (
 <Modal
 isOpen={Boolean(selectedError)}
 onClose={onClose}
 title="Request Error Details"
 size="lg"
 >
 {selectedError && (
 <div className="space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-surface-2/60 border border-border rounded-sm p-3">
 <div>
 <span className="text-text-muted">Status:</span>{" "}
 <span className="font-mono font-medium text-danger">
 {selectedError.status || "error"}
 </span>
 </div>
 <div>
 <span className="text-text-muted">Timestamp:</span>{" "}
 <span className="text-text-main">
 {selectedError.timestamp ? new Date(selectedError.timestamp).toLocaleString("en-US") : "Unknown"}
 </span>
 </div>
 <div>
 <span className="text-text-muted">Model:</span>{" "}
 <span className="font-mono font-medium text-text-main truncate block" title={selectedError.model}>
 {selectedError.model}
 </span>
 </div>
 <div>
 <span className="text-text-muted">Provider:</span>{" "}
 <Badge variant="neutral" size="sm">
 {selectedError.provider || "unknown"}
 </Badge>
 </div>
 <div>
 <span className="text-text-muted">Account:</span>{" "}
 <span className="font-mono text-text-main truncate block font-medium" title={selectedError.account || selectedError.connectionId || "Direct"}>
 {selectedError.account || selectedError.connectionId || "Direct"}
 </span>
 </div>
 <div>
 <span className="text-text-muted">Format:</span>{" "}
 <span className="font-medium text-text-main">
 {selectedError.isStream ? "STREAM (SSE)" : "JSON"}
 </span>
 </div>
 <div>
 <span className="text-text-muted">API Key:</span>{" "}
 <span className="font-mono text-text-main truncate block" title={selectedError.rawApiKey || selectedError.apiKey}>
 {selectedError.apiKey || "Default Key"}
 </span>
 </div>
 </div>

 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-medium text-danger flex items-center gap-1.5">
 <Icon name="error" size={18} />
 Error Response Payload
 </span>
 {(selectedError.error || fetchedError) && (
 <button
 type="button"
 onClick={() => {
 const err = selectedError.error || fetchedError;
 const text = typeof err === "object"
 ? JSON.stringify(err, null, 2)
 : String(err);
 navigator.clipboard?.writeText(text);
 }}
 className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-main cursor-pointer"
 >
 <Icon name="content_copy" size={18} />
 Copy
 </button>
 )}
 </div>

 {loading ? (
 <div className="flex items-center justify-center p-3 border border-border rounded-sm bg-surface-2/40 text-text-muted text-xs gap-2 h-8">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 Loading error trace...
 </div>
 ) : (
 <pre className="max-h-[300px] overflow-auto rounded-sm border border-danger/30 bg-danger/10 p-3 font-mono text-xs text-danger whitespace-pre-wrap break-words">
 {(selectedError.error || fetchedError)
 ? (typeof (selectedError.error || fetchedError) === "object"
 ? JSON.stringify(selectedError.error || fetchedError, null, 2)
 : (selectedError.error || fetchedError))
    : `[${selectedError.status || "FAILED"}]: Request failed with HTTP status ${selectedError.status}. Check Request Details for archived traces.`}
 </pre>
 )}
 </div>

 <div className="flex items-center justify-between pt-2 border-t border-border h-8">
 <a
          href="/dashboard/usage?tab=logs&details=1"
 className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
 >
 <Icon name="open_in_new" size={18} />
          Open Request Details
 </a>
 <Button
 variant="ghost"
 size="sm"
 onClick={onClose}
 >
 Close
 </Button>
 </div>
 </div>
 )}
 </Modal>
 );
}
