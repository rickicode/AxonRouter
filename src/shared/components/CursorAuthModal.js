"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Modal, Button, Input } from "@/shared/components";
import Icon from "@/shared/components/Icon";

/**
 * Cursor Auth Modal
 * Auto-detect and import token from Cursor IDE's local SQLite database
 */
export default function CursorAuthModal({ isOpen, onSuccess, onClose }) {
 const [accessToken, setAccessToken] = useState("");
 const [machineId, setMachineId] = useState("");
 const [error, setError] = useState(null);
 const [importing, setImporting] = useState(false);
 const [autoDetecting, setAutoDetecting] = useState(false);
 const [autoDetected, setAutoDetected] = useState(false);
 const [windowsManual, setWindowsManual] = useState(false);

 const runAutoDetect = async () => {
 setAutoDetecting(true);
 setError(null);
 setAutoDetected(false);
 setWindowsManual(false);

 try {
 const res = await fetch("/api/oauth/cursor/auto-import");
 const data = await res.json();

 if (data.found) {
 setAccessToken(data.accessToken);
 setMachineId(data.machineId);
 setAutoDetected(true);
 } else if (data.windowsManual) {
 setWindowsManual(true);
 } else {
 setError(data.error || "Could not auto-detect tokens");
 }
 } catch (err) {
 setError("Failed to auto-detect tokens");
 } finally {
 setAutoDetecting(false);
 }
 };

 // Auto-detect tokens when modal opens
 useEffect(() => {
 if (!isOpen) return;
 let cancelled = false;
 queueMicrotask(() => {
 if (!cancelled) runAutoDetect();
 });
 return () => { cancelled = true; };
 }, [isOpen]);

 const handleImportToken = async () => {
 if (!accessToken.trim()) {
 setError("Please enter an access token");
 return;
 }

 if (!machineId.trim()) {
 setError("Please enter a machine ID");
 return;
 }

 setImporting(true);
 setError(null);

 try {
 const res = await fetch("/api/oauth/cursor/import", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 accessToken: accessToken.trim(),
 machineId: machineId.trim(),
 }),
 });

 const data = await res.json();

 if (!res.ok) {
 throw new Error(data.error || "Import failed");
 }

 onSuccess?.();
 onClose();
 } catch (err) {
 setError(err.message);
 } finally {
 setImporting(false);
 }
 };

 return (
 <Modal isOpen={isOpen} title="Connect Cursor IDE" onClose={onClose}>
 <div className="flex flex-col gap-3">
 {/* Auto-detecting state */}
 {autoDetecting && (
 <div className="text-center py-3">
 <div className="flex items-center gap-2 text-primary">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 </div>
 <h3 className="text-sm font-semibold mb-2">Auto-detecting tokens...</h3>
 <p className="text-sm text-text-muted">
 Reading from Cursor IDE database
 </p>
 </div>
 )}

 {/* Form (shown after auto-detect completes) */}
 {!autoDetecting && (
 <>
 {/* Success message if auto-detected */}
 {autoDetected && (
 <div className="bg-success/10 p-3 rounded-sm border border-success/30">
 <div className="flex gap-2">
 <Icon className="text-success" name="check_circle" size={18} />
 <p className="text-sm text-success">
 Tokens auto-detected from Cursor IDE successfully!
 </p>
 </div>
 </div>
 )}

 {/* Windows manual instructions */}
 {windowsManual && (
 <div className="bg-warning/10 p-3 rounded-sm border border-warning/30 flex flex-col gap-2">
 <div className="flex gap-2 items-center">
 <Icon className="text-warning" name="info" size={18} />
 <p className="text-sm font-medium text-warning">
 Could not read Cursor database automatically.
 </p>
 </div>
 <p className="text-xs text-warning">
 Make sure Cursor IDE has been opened at least once, then click <strong>Retry</strong>. If the problem persists, paste your tokens manually below.
 </p>
 <Button onClick={runAutoDetect} variant="outline" fullWidth>
 Retry
 </Button>
 </div>
 )}

 {/* Info message if not auto-detected */}
 {!autoDetected && !windowsManual && !error && (
 <div className="bg-primary/10 p-3 rounded-sm border border-primary/30">
 <div className="flex gap-2">
 <Icon className="text-primary" name="info" size={18} />
 <p className="text-sm text-primary">
 Cursor IDE not detected. Please paste your tokens manually.
 </p>
 </div>
 </div>
 )}

 {/* Access Token Input */}
 <div>
 <label className="block font-medium mb-2 text-xs text-text-muted">
 Access Token <span className="text-danger">*</span>
 </label>
 <textarea
 value={accessToken}
 onChange={(e) => setAccessToken(e.target.value)}
 placeholder="Access token will be auto-filled..."
 rows={3}
 className="w-full px-3 h-8 text-sm font-mono border border-border rounded-sm bg-surface focus:outline-none focus:border-primary resize-none"
 />
 </div>

 {/* Machine ID Input */}
 <div>
 <label className="block font-medium mb-2 text-xs text-text-muted">
 Machine ID <span className="text-danger">*</span>
 </label>
 <Input
 value={machineId}
 onChange={(e) => setMachineId(e.target.value)}
 placeholder="Machine ID will be auto-filled..."
 className="font-mono text-sm"
 />
 </div>

 {/* Error Display */}
 {error && (
 <div className="bg-danger/10 p-3 rounded-sm border border-danger/30">
 <p className="text-sm text-danger">{error}</p>
 </div>
 )}

 {/* Action Buttons */}
 <div className="flex gap-2">
 <Button
 onClick={handleImportToken}
 fullWidth
 disabled={importing || !accessToken.trim() || !machineId.trim()}
 >
 {importing ? "Importing..." : "Import Token"}
 </Button>
 <Button onClick={onClose} variant="ghost" fullWidth>
 Cancel
 </Button>
 </div>
 </>
 )}
 </div>
 </Modal>
 );
}

CursorAuthModal.propTypes = {
 isOpen: PropTypes.bool.isRequired,
 onSuccess: PropTypes.func,
 onClose: PropTypes.func.isRequired,
};
