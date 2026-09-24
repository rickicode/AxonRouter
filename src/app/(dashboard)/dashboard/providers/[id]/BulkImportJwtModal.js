"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";
import { translate } from "@/i18n/runtime";

const PLACEHOLDER = `ricki@mail.com|eyJhbGciOiJIUzUxMiIs...
apikey-abc123xyz
eyJhbGciOiJIUzUxMiIs...`;

/**
 * Bulk-import tokens (one per line) as API-key connections. Each line may be:
 * name/email|token → custom connection name
 * bare token → named DD-MM-YYYY-N
 * JWT expiry decodes from the exp claim; plain API keys have no expiry.
 * Duplicates already stored on this provider are skipped.
 */
export default function BulkImportJwtModal({ providerId, isOpen, onClose, onSuccess }) {
 const [tokenText, setTokenText] = useState("");
 const [submitting, setSubmitting] = useState(false);
 const [parseError, setParseError] = useState("");
 const [result, setResult] = useState(null);

 const handleClose = () => {
 if (submitting) return;
 setTokenText("");
 setParseError("");
 setResult(null);
 onClose();
 };

 const handleSubmit = async () => {
 setParseError("");
 setResult(null);
 const trimmed = tokenText.trim();
 if (!trimmed) return;

 setSubmitting(true);
 try {
 const res = await fetch(`/api/oauth/${providerId}/bulk-jwt`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ text: trimmed }),
 });
 const data = await res.json();
 if (!res.ok) {
 setParseError(data?.error || `Request failed: ${res.status}`);
 return;
 }
 setResult(data);
 if (data.success > 0 && typeof onSuccess === "function") {
 onSuccess();
 }
 } catch (err) {
 setParseError(err.message || translate("Request failed"));
 } finally {
 setSubmitting(false);
 }
 };

 const failedItems = result?.results?.filter((r) => !r.ok) || [];
 const skipped = result?.skipped || 0;

 return (
 <Modal isOpen={isOpen} title={translate("Bulk Add JWT Tokens")} onClose={handleClose}>
 <div className="flex flex-col gap-3">
 <p className="text-xs text-text-muted">
 {translate(
 "Paste one token per line: name/email|token for a custom name, or a bare token (JWT or API key) named DD-MM-YYYY-N. Duplicates are skipped."
 )}
 </p>

 <textarea
 className="w-full rounded-sm border border-border bg-surface p-3 text-xs font-mono resize-y min-h-[240px] focus:outline-none"
 placeholder={PLACEHOLDER}
 value={tokenText}
 onChange={(e) => setTokenText(e.target.value)}
 disabled={submitting}
 spellCheck={false}
 />

 {parseError && (
 <p className="text-xs text-danger break-words">{parseError}</p>
 )}

 {result && (
 <div className="flex flex-col gap-2">
 <div
 className={`text-sm font-medium ${
 result.failed > 0 ? "text-warning" : "text-success"
 }`}
 >
 ✓ {result.success} {translate("added")}
 {skipped > 0 ? `, ⊘ ${skipped} ${translate("skipped (duplicate)")}` : ""}
 {result.failed > 0 ? `, ✗ ${result.failed} ${translate("failed")}` : ""}
 </div>
 {failedItems.length > 0 && (
 <ul className="rounded-sm border border-primary/30 bg-sidebar/50 p-3 text-xs font-mono max-h-40 overflow-y-auto">
 {failedItems.map((item) => (
 <li key={item.index} className="text-danger">
 [{item.index}] {item.error}
 </li>
 ))}
 </ul>
 )}
 </div>
 )}

 <div className="flex gap-2">
 <Button
 onClick={handleSubmit}
 fullWidth
 disabled={submitting || !tokenText.trim()}
 >
 {submitting ? translate("Importing...") : translate("Import All")}
 </Button>
 <Button onClick={handleClose} variant="ghost" fullWidth disabled={submitting}>
 {translate("Close")}
 </Button>
 </div>
 </div>
 </Modal>
 );
}

BulkImportJwtModal.propTypes = {
 providerId: PropTypes.string.isRequired,
 isOpen: PropTypes.bool.isRequired,
 onClose: PropTypes.func.isRequired,
 onSuccess: PropTypes.func,
};
