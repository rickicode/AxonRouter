"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import Icon from "@/shared/components/Icon";

function PassthroughModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onTest, testStatus, isTesting }) {
 const borderColor = testStatus === "ok"
 ? "border-success/30"
 : testStatus === "error"
 ? "border-danger/30"
 : "border-border";

 const iconColor = testStatus === "ok"
 ? "#22c55e"
 : testStatus === "error"
 ? "#ef4444"
 : undefined;

 return (
 <div className={`flex items-center gap-3 p-3 rounded-sm border ${borderColor} hover:bg-surface-2`}>
 <Icon
 name={testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
 size={14}
 className="text-text-muted"
 style={iconColor ? { color: iconColor } : undefined}
 />

 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium truncate">{modelId}</p>

 <div className="flex items-center gap-1 mt-1">
 <code className="text-xs text-text-muted font-mono bg-sidebar px-1.5 py-1 rounded-sm">{fullModel}</code>
 <div className="relative group/btn">
<button
onClick={() => onCopy(fullModel, `model-${modelId}`)}
className="size-11 sm:size-8 hover:bg-surface-2 rounded-sm text-text-muted hover:text-primary"
>
<Icon name={copied === `model-${modelId}` ? "check" : "content_copy"} size={14} />
</button>
 <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[11px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
 {copied === `model-${modelId}` ? "Copied!" : "Copy"}
 </span>
 </div>
 {onTest && (
 <div className="relative group/btn">
<button
onClick={onTest}
disabled={isTesting}
className="size-11 sm:size-8 hover:bg-surface-2 rounded-sm text-text-muted hover:text-primary"
>
<Icon name={isTesting ? "progress_activity" : "science"} size={14} style={isTesting ? { animation: "spin 1s linear infinite" } : undefined} />
</button>
 <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[11px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
 {isTesting ? "Testing..." : "Test"}
 </span>
 </div>
 )}
 </div>
 </div>

 {/* Delete button */}
<button
onClick={onDeleteAlias}
className="size-11 sm:size-8 hover:bg-danger/10 rounded-sm text-danger"
title="Remove model"
>
<Icon className="text-sm" name="delete" size={18} />
</button>
 </div>
 );
}

PassthroughModelRow.propTypes = {
 modelId: PropTypes.string.isRequired,
 fullModel: PropTypes.string.isRequired,
 copied: PropTypes.string,
 onCopy: PropTypes.func.isRequired,
 onDeleteAlias: PropTypes.func.isRequired,
 onTest: PropTypes.func,
 testStatus: PropTypes.oneOf(["ok", "error"]),
 isTesting: PropTypes.bool,
};

export default function PassthroughModelsSection({ providerAlias, modelAliases, customModels, copied, onCopy, onDeleteAlias, onAddCustomModel, onDeleteCustomModel }) {
 const [newModel, setNewModel] = useState("");
 const [adding, setAdding] = useState(false);
 const notify = useNotificationStore();

 const allModels = getProviderCustomModelRows({
 customModels,
 modelAliases,
 providerAlias,
 type: "llm",
 });

 const handleAdd = async () => {
 if (!newModel.trim() || adding) return;
 const modelId = newModel.trim();

 if (allModels.some((model) => model.id === modelId)) {
 notify.warning("Model already exists for this provider.");
 return;
 }

 setAdding(true);
 try {
 await onAddCustomModel(modelId);
 setNewModel("");
 } catch {
 } finally {
 setAdding(false);
 }
 };

 return (
 <div className="flex flex-col gap-3">
 <p className="text-sm text-text-muted">
 OpenRouter supports any model. Add models and create aliases for quick access.
 </p>

 {/* Add new model */}
 <div className="flex items-end gap-2">
 <div className="flex-1">
 <label htmlFor="new-model-input" className="text-xs text-text-muted mb-1 block font-medium">Model ID (from OpenRouter)</label>
 <input
 id="new-model-input"
 type="text"
 value={newModel}
 onChange={(e) => setNewModel(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && handleAdd()}
 placeholder="anthropic/claude-3-opus"
className="h-11 sm:h-8 w-full border border-border bg-surface px-2 text-sm text-text-main outline-none focus:border-primary"
 />
 </div>
 <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
 {adding ? "Adding..." : "Add"}
 </Button>
 </div>

 {/* Models list */}
 {allModels.length > 0 && (
 <div className="flex flex-col gap-3">
 {allModels.map(({ id, fullModel, alias, source }) => (
 <PassthroughModelRow
 key={`${source}-${fullModel}`}
 modelId={id}
 fullModel={fullModel}
 copied={copied}
 onCopy={onCopy}
 onDeleteAlias={() => source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias)}
 />
 ))}
 </div>
 )}
 </div>
 );
}

PassthroughModelsSection.propTypes = {
 providerAlias: PropTypes.string.isRequired,
 modelAliases: PropTypes.object.isRequired,
 customModels: PropTypes.arrayOf(PropTypes.object),
 copied: PropTypes.string,
 onCopy: PropTypes.func.isRequired,
 onDeleteAlias: PropTypes.func.isRequired,
 onAddCustomModel: PropTypes.func.isRequired,
 onDeleteCustomModel: PropTypes.func.isRequired,
};
