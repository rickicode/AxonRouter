"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, Modal, Toggle } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { CAPACITY_META } from "@/shared/constants/models";

const defaultCaps = () => Object.fromEntries(Object.keys(CAPACITY_META).map((key) => [key, false]));

export default function AddCustomModelModal({ isOpen, providerAlias, providerDisplayAlias, onSave, onClose }) {
 const [modelId, setModelId] = useState("");
 const [caps, setCaps] = useState(defaultCaps);
 const [testStatus, setTestStatus] = useState(null); // null | "testing" | "ok" | "error"
 const [testError, setTestError] = useState("");
 const [saving, setSaving] = useState(false);

 // Reset state when modal opens
 useEffect(() => {
 if (!isOpen) return;
 let cancelled = false;
 queueMicrotask(() => {
 if (cancelled) return;
 setModelId(""); setCaps(defaultCaps()); setTestStatus(null); setTestError("");
 });
 return () => { cancelled = true; };
 }, [isOpen]);

 // Strip provider's own alias prefix (e.g. "cc/model" -> "model" for cc provider)
 const stripAlias = (id) => {
 const prefix = `${providerAlias}/`;
 return id.startsWith(prefix) ? id.slice(prefix.length) : id;
 };

 const handleTest = async () => {
 const cleanId = stripAlias(modelId.trim());
 if (!cleanId) return;
 setTestStatus("testing");
 setTestError("");
 try {
 const res = await fetch("/api/models/test", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ model: `${providerAlias}/${cleanId}` }),
 });
 const data = await res.json();
 setTestStatus(data.ok ? "ok" : "error");
 setTestError(data.error || "");
 } catch (err) {
 setTestStatus("error");
 setTestError(err.message);
 }
 };

 const handleSave = async () => {
 const cleanId = stripAlias(modelId.trim());
 if (!cleanId || saving) return;
 setSaving(true);
 try {
 await onSave(cleanId, caps);
 } finally {
 setSaving(false);
 }
 };

 const handleKeyDown = (e) => {
 if (e.key === "Enter") handleTest();
 };

 return (
 <Modal isOpen={isOpen} onClose={onClose} title="Add Custom Model">
 <div className="flex flex-col gap-3">
 <div>
 <label className="font-medium mb-1.5 block text-xs text-text-muted">Model ID</label>
 <div className="flex gap-2">
 <input
 type="text"
 value={modelId}
 onChange={(e) => { setModelId(e.target.value); setTestStatus(null); setTestError(""); }}
 onKeyDown={handleKeyDown}
 placeholder="e.g. claude-opus-4-5"
className="flex-1 px-3 h-11 text-sm border border-border rounded-sm bg-surface focus:outline-none focus:border-primary sm:h-8"
 autoFocus
 />
 <Button
 variant="secondary"
 icon="science"
 loading={testStatus === "testing"}
 onClick={handleTest}
 disabled={!modelId.trim() || testStatus === "testing"}
 >
 {testStatus === "testing" ? "Testing..." : "Test"}
 </Button>
 </div>
 <p className="text-xs text-text-muted mt-1">
 Sent to provider as: <code className="font-mono bg-sidebar px-1 rounded-sm">{stripAlias(modelId.trim()) || "model-id"}</code>
 </p>
 </div>

 <div>
 <label className="font-medium mb-1.5 block text-xs text-text-muted">Capabilities</label>
 <div className="flex flex-wrap gap-3">
 {Object.entries(CAPACITY_META).map(([key, meta]) => (
 <Toggle
 key={key}
 checked={!!caps[key]}
 onChange={(v) => setCaps((prev) => ({ ...prev, [key]: v }))}
 label={meta.label}
 description={meta.desc}
 size="sm"
 />
 ))}
 </div>
 </div>

 {/* Test result */}
 {testStatus === "ok" && (
 <div className="flex items-center gap-2 text-sm text-success">
 <Icon className="text-sm" name="check_circle" size={18} />
 Model is reachable
 </div>
 )}
 {testStatus === "error" && (
 <div className="flex items-start gap-2 text-sm text-danger">
 <Icon className="text-sm shrink-0" name="cancel" size={18} />
 <span>{testError || "Model not reachable"}</span>
 </div>
 )}

 <div className="flex gap-2 pt-1">
 <Button onClick={onClose} variant="ghost" fullWidth size="sm">Cancel</Button>
 <Button
 onClick={handleSave}
 fullWidth
 size="sm"
 disabled={!modelId.trim() || saving}
 >
 {saving ? "Adding..." : "Add Model"}
 </Button>
 </div>
 </div>
 </Modal>
 );
}

AddCustomModelModal.propTypes = {
 isOpen: PropTypes.bool.isRequired,
 providerAlias: PropTypes.string.isRequired,
 providerDisplayAlias: PropTypes.string.isRequired,
 onSave: PropTypes.func.isRequired,
 onClose: PropTypes.func.isRequired,
};
