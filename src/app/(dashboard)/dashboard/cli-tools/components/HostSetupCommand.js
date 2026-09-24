"use client";

import { useState, useMemo } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Icon from "@/shared/components/Icon";

export default function HostSetupCommand({
 toolId,
 baseUrl = "",
 apiKey = "",
 model = "",
 subagentModel = "",
 models = {},
 modelsList = [],
 maxContextTokens = "",
}) {
 const [activeTab, setActiveTab] = useState("bash"); // "bash" | "ps1"
 const { copy, copied } = useCopyToClipboard();

 // Determine current origin from window if running in browser
 const currentOrigin = useMemo(() => {
 if (typeof window !== "undefined") {
 return window.location.origin;
 }
 return "http://localhost:3777";
 }, []);

 const effectiveBaseUrl = baseUrl || currentOrigin;

 // Build query string for the script endpoint
 const queryParams = useMemo(() => {
 const params = new URLSearchParams();
 params.set("baseUrl", effectiveBaseUrl);
 if (apiKey) params.set("apiKey", apiKey);
 if (model) params.set("model", model);
 if (subagentModel) params.set("subagentModel", subagentModel);
 if (maxContextTokens) params.set("maxContextTokens", maxContextTokens);

 if (models) {
 Object.entries(models).forEach(([k, v]) => {
 if (v) params.set(k, v);
 });
 }

 if (modelsList && modelsList.length > 0) {
 params.set("modelsList", modelsList.join(","));
 }

 return params.toString();
 }, [effectiveBaseUrl, apiKey, model, subagentModel, maxContextTokens, models, modelsList]);

 const scriptUrlBash = `${currentOrigin}/api/cli-tools/setup/${toolId}?${queryParams}`;
 const scriptUrlPs1 = `${currentOrigin}/api/cli-tools/setup/${toolId}?format=ps1&${queryParams}`;

 const bashCommand = `curl -fsSL "${scriptUrlBash}" | bash`;
 const ps1Command = `irm "${scriptUrlPs1}" | iex`;

 const activeCommand = activeTab === "bash" ? bashCommand : ps1Command;

 return (
 <div className="flex flex-col gap-2 p-3 bg-primary/10 border border-primary/30 rounded-sm">
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div className="flex items-center gap-1.5">
 <Icon className="text-primary" name="terminal" size={18} />
 <span className="text-xs font-medium text-text-main">
 Host One-Click Auto Setup
 </span>
 <span className="px-1.5 py-0.5 text-[11px] bg-primary/10 text-primary font-medium rounded-sm">
 Remote & Docker Ready
 </span>
 </div>

 {/* Tab switchers */}
 <div
 role="tablist"
 aria-orientation="horizontal"
 aria-label="Host command format"
 className="inline-flex border border-border bg-bg"
 onKeyDown={(e) => {
 if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
 e.preventDefault();
 setActiveTab((prev) => (prev === "bash" ? "ps1" : "bash"));
 }
 }}
 >
 <button
 type="button"
 role="tab"
 aria-selected={activeTab === "bash"}
 tabIndex={activeTab === "bash" ? 0 : -1}
 onClick={() => setActiveTab("bash")}
 className={`flex h-8 items-center px-2.5 text-xs font-medium ${
 activeTab === "bash"
 ? "bg-surface text-text-main"
 : "text-text-muted hover:text-text-main"
 }`}
 >
 macOS / Linux (Bash)
 </button>
 <button
 type="button"
 role="tab"
 aria-selected={activeTab === "ps1"}
 tabIndex={activeTab === "ps1" ? 0 : -1}
 onClick={() => setActiveTab("ps1")}
 className={`flex h-8 items-center px-2.5 text-xs font-medium ${
 activeTab === "ps1"
 ? "bg-surface text-text-main"
 : "text-text-muted hover:text-text-main"
 }`}
 >
 Windows (PowerShell)
 </button>
 </div>
 </div>

 <p className="text-[11px] text-text-muted">
 Paste and run this command in your host machine terminal to apply the configured endpoint, API key, and models directly:
 </p>

 {/* Command snippet box */}
 <div className="relative group">
 <pre className="pr-20 font-mono text-xs rounded-sm overflow-x-auto whitespace-pre-wrap break-all select-all border border-border bg-surface p-3 text-text-main">
 {activeCommand}
 </pre>

 <button
 type="button"
 onClick={() => copy(activeCommand)}
 className="absolute right-2 top-2 px-2.5 bg-surface/90 hover:bg-surface-2 border border-border text-text-main text-[11px] font-medium rounded-sm flex items-center gap-1 h-8"
 >
 <Icon name={copied ? "check" : "content_copy"} size={18} />
 <span>{copied ? "Copied!" : "Copy"}</span>
 </button>
 </div>
 </div>
 );
}
