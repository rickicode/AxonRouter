"use client";

import { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { Card, Button, Input, Modal, Toggle, ConfirmModal } from "@/shared/components";
import SecurityWarning from "./SecurityWarning";
import Icon from "@/shared/components/Icon";

export default function ApiKeysCard({
 keys,
 requireApiKey,
 onToggleRequireApiKey,
 onKeysChange,
 copied,
 onCopy,
 isRemoteHost,
}) {
 const [isExpanded, setIsExpanded] = useState(true);
 const [showAddModal, setShowAddModal] = useState(false);
 const [newKeyName, setNewKeyName] = useState("");
 const [createdKey, setCreatedKey] = useState(null);
 const [confirmState, setConfirmState] = useState(null);
 const [visibleKeys, setVisibleKeys] = useState(new Set());

 const maskKey = useCallback((fullKey) => {
 if (!fullKey || fullKey.length <= 10) return fullKey || "";
 return fullKey.slice(0, 6) + "•".repeat(fullKey.length - 10) + fullKey.slice(-4);
 }, []);

 const toggleKeyVisibility = (keyId) => {
 setVisibleKeys((prev) => {
 const next = new Set(prev);
 if (next.has(keyId)) next.delete(keyId);
 else next.add(keyId);
 return next;
 });
 };

 const handleCreateKey = async () => {
 if (!newKeyName.trim()) return;

 try {
 const res = await fetch("/api/keys", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name: newKeyName.trim() }),
 });
 const data = await res.json();

 if (res.ok) {
 setCreatedKey(data.key);
 if (onKeysChange) await onKeysChange();
 setNewKeyName("");
 setShowAddModal(false);
 }
 } catch (error) {
 console.log("Error creating key:", error);
 }
 };

 const handleDeleteKey = (id, name) => {
 setConfirmState({
 title: "Delete API Key",
 message: `Are you sure you want to delete API key "${name || id}"? Any client using it will immediately lose access.`,
 onConfirm: async () => {
 setConfirmState(null);
 try {
 const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
 if (res.ok) {
 if (onKeysChange) await onKeysChange();
 setVisibleKeys((prev) => {
 const next = new Set(prev);
 next.delete(id);
 return next;
 });
 }
 } catch (error) {
 console.log("Error deleting key:", error);
 }
 },
 });
 };

 const handleToggleKey = async (id, isActive) => {
 try {
 const res = await fetch(`/api/keys/${id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isActive }),
 });
 if (res.ok && onKeysChange) {
 await onKeysChange();
 }
 } catch (error) {
 console.log("Error toggling key:", error);
 }
 };

  const actionHeader = (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium bg-surface text-text-muted border border-border">
        {keys.length} {keys.length === 1 ? "KEY" : "KEYS"}
      </span>
      <Button
        size="sm"
        icon="add"
        onClick={() => setShowAddModal(true)}
        aria-label="Create new API Key"
      >
        Create Key
      </Button>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="size-11 sm:size-9 hover:bg-surface-2 rounded-sm text-text-muted hover:text-text-main focus-visible:outline-none flex items-center justify-center"
        aria-label={isExpanded ? "Collapse API Keys details" : "Expand API Keys details"}
        aria-expanded={isExpanded}
      >
<Icon name={isExpanded ? "expand_less" : "expand_more"} size={18} className="transition-transform" />
      </button>
    </div>
  );

 return (
 <>
 <Card
 id="require-api-key"
 title="API Keys"
 subtitle="Manage authentication tokens for clients calling AxonRouter"
 icon="vpn_key"
 action={actionHeader}
 >
 {isExpanded && (
 <div className="mt-3 pt-3 border-t border-border flex flex-col gap-3">
 {/* Require API key toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div className="min-w-0">
                  <p className="font-medium text-sm">Require API key</p>
                  <p className="text-xs text-text-muted font-mono mt-0.5 leading-relaxed">
                    Protects model endpoints (/v1/*). Clients must supply an Authorization: Bearer &lt;key&gt; header. Does not gate dashboard UI login.
                  </p>
                </div>
                <div className="shrink-0">
                  <Toggle
                    checked={requireApiKey}
                    onChange={() => onToggleRequireApiKey(!requireApiKey)}
                  />
                </div>
              </div>

 {isRemoteHost && !requireApiKey && (
 <SecurityWarning message="Model endpoint is exposed remotely without an API key requirement. Anyone with the URL can send requests." />
 )}

 {/* Keys list */}
 {keys.length === 0 ? (
 <div className="text-center p-3 border border-dashed border-border rounded-sm bg-surface">
 <div className="inline-flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary">
 <Icon name="vpn_key" size={18} />
 </div>
 <p className="text-text-main font-medium text-sm mb-1">No API keys yet</p>
 <p className="text-xs text-text-muted max-w-sm mx-auto mb-3 font-mono">
 Create an API key to authenticate client requests to /v1/* endpoints when key requirement is enabled.
 </p>
 <Button
 size="sm"
 icon="add"
 onClick={() => setShowAddModal(true)}
 aria-label="Create your first API key"
 >
 Create your first API key
 </Button>
 </div>
 ) : (
 <div className="flex flex-col divide-y divide-border-subtle">
 {keys.map((key) => (
 <div
 key={key.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 transition-opacity ${
                  key.isActive === false ? "opacity-60" : ""
                }`}
              >
 <div className="flex-1 min-w-0 pr-3">
 <div className="flex items-center gap-2">
 <p className="text-sm font-medium">{key.name}</p>
 {key.isActive === false && (
 <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-sm bg-warning/10 text-warning border border-warning/30 font-medium">
 Paused
 </span>
 )}
 </div>
 <div className="flex items-center gap-2 mt-1">
 <code className="text-xs text-text-muted font-mono">
 {visibleKeys.has(key.id) ? key.key : maskKey(key.key)}
 </code>
 <button
 type="button"
 onClick={() => toggleKeyVisibility(key.id)}
                  className="size-11 sm:size-9 hover:bg-surface-2 rounded-sm text-text-muted hover:text-primary focus-visible:outline-none flex items-center justify-center"
 aria-label={visibleKeys.has(key.id) ? `Hide key for ${key.name}` : `Show key for ${key.name}`}
 >
<Icon name={visibleKeys.has(key.id) ? "visibility_off" : "visibility"} size={18} />
 </button>
 <button
 type="button"
 onClick={() => onCopy(key.key, key.id)}
                  className="size-11 sm:size-9 hover:bg-surface-2 rounded-sm text-text-muted hover:text-primary focus-visible:outline-none flex items-center justify-center"
 aria-label={copied === key.id ? "Copied" : `Copy API key ${key.name}`}
 >
<Icon name={copied === key.id ? "check" : "content_copy"} size={18} />
 </button>
 </div>
 <p className="text-[11px] text-text-muted font-mono mt-1">
 Created {new Date(key.createdAt).toLocaleDateString()}
 </p>
 </div>

 <div className="flex items-center gap-2 shrink-0">
 <Toggle
 size="sm"
 checked={key.isActive ?? true}
 onChange={(checked) => {
 if (key.isActive && !checked) {
 setConfirmState({
 title: "Pause API Key",
 message: `Pause API key "${key.name}"?\n\nThis key will stop working immediately but can be resumed later.`,
 onConfirm: async () => {
 setConfirmState(null);
 await handleToggleKey(key.id, checked);
 },
 });
 } else {
 handleToggleKey(key.id, checked);
 }
 }}
 />
 {/* Always-visible delete action with ConfirmModal */}
 <button
 type="button"
 onClick={() => handleDeleteKey(key.id, key.name)}
  className="size-11 shrink-0 rounded-sm text-danger hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-red-500"
 aria-label={`Delete API key ${key.name}`}
 title={`Delete API key ${key.name}`}
 >
 <Icon name="delete" size={18} />
 </button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </Card>

 {/* Add Key Modal */}
 <Modal
 isOpen={showAddModal}
 title="Create API Key"
 onClose={() => {
 setShowAddModal(false);
 setNewKeyName("");
 }}
 >
 <div className="flex flex-col gap-3">
 <Input
 label="Key Name"
 value={newKeyName}
 onChange={(e) => setNewKeyName(e.target.value)}
 placeholder="e.g. Production Client"
 autoFocus
 />
 <div className="flex gap-2">
 <Button onClick={handleCreateKey} fullWidth disabled={!newKeyName.trim()}>
 Create Key
 </Button>
 <Button
 onClick={() => {
 setShowAddModal(false);
 setNewKeyName("");
 }}
 variant="ghost"
 fullWidth
 >
 Cancel
 </Button>
 </div>
 </div>
 </Modal>

 {/* Created Key Modal */}
 <Modal
 isOpen={!!createdKey}
 title="API Key Created"
 onClose={() => setCreatedKey(null)}
 >
 <div className="flex flex-col gap-3">
 <div className="bg-warning/10 border border-warning/30 rounded-sm p-3">
 <p className="text-sm text-warning mb-1 font-medium">
 Save this key now!
 </p>
 <p className="text-xs text-warning font-mono">
 This is the only time the full key will be displayed. Store it securely.
 </p>
 </div>
 <div className="flex gap-2">
 <Input
 value={createdKey || ""}
 readOnly
 className="flex-1 font-mono text-sm"
 />
 <Button
 variant="secondary"
 icon={copied === "created_key" ? "check" : "content_copy"}
 onClick={() => onCopy(createdKey, "created_key")}
 aria-label={copied === "created_key" ? "Copied" : "Copy new key"}
 >
 {copied === "created_key" ? "Copied!" : "Copy"}
 </Button>
 </div>
 <Button onClick={() => setCreatedKey(null)} fullWidth>
 Done
 </Button>
 </div>
 </Modal>

 {/* Confirm Modal */}
 <ConfirmModal
 isOpen={!!confirmState}
 onClose={() => setConfirmState(null)}
 onConfirm={confirmState?.onConfirm}
 title={confirmState?.title || "Confirm"}
 message={confirmState?.message}
 variant="danger"
 />
 </>
 );
}

ApiKeysCard.propTypes = {
 keys: PropTypes.arrayOf(
 PropTypes.shape({
 id: PropTypes.string.isRequired,
 name: PropTypes.string.isRequired,
 key: PropTypes.string.isRequired,
 isActive: PropTypes.bool,
 createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)]),
 })
 ).isRequired,
 requireApiKey: PropTypes.bool.isRequired,
 onToggleRequireApiKey: PropTypes.func.isRequired,
 onKeysChange: PropTypes.func.isRequired,
 copied: PropTypes.string,
 onCopy: PropTypes.func.isRequired,
 isRemoteHost: PropTypes.bool,
};
