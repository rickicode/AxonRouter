"use client";

import Link from "@/lib/ui/link.jsx";
import Image from "@/lib/ui/image.jsx";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import { Card, Button } from "@/shared/components";
import Icon from "@/shared/components/Icon";

export default function ProviderHeader({
 providerInfo, providerId, providerNode, isCompatible, isOpenAICompatible, isAnthropicCompatible,
 headerImgError, setHeaderImgError, connectionCount, setAddConnectionError, setShowAddApiKeyModal,
 setShowEditNodeModal, setConfirmState, router,
}) {
 const getHeaderIconPath = () => {
 if (isOpenAICompatible && providerInfo.apiType) {
 return providerInfo.apiType === "responses" ? "/providers/oai-r.png" : "/providers/oai-cc.png";
 }
 if (isAnthropicCompatible) {
 return "/providers/anthropic-m.png";
 }
 return getProviderIconSrc(providerInfo.id);
 };

 return (
 <>
 <div className="min-w-0">
 <Link
 href="/dashboard/providers"
className="inline-flex min-h-11 items-center gap-1 text-sm text-text-muted hover:text-primary mb-3 sm:h-8 sm:min-h-0"
 >
 <Icon name="arrow_back" size={18} />
 Back to Providers
 </Link>
 <div className="flex min-w-0 items-center gap-3 sm:gap-3">
 <div
 className="flex size-8 shrink-0 items-center justify-center rounded-sm"
 style={{ backgroundColor: `${providerInfo.color}15` }}
 >
 {headerImgError || !getHeaderIconPath() ? (
 <span className="text-sm font-semibold" style={{ color: providerInfo.color }}>
 {providerInfo.textIcon || providerInfo.id.slice(0, 2).toUpperCase()}
 </span>
 ) : (
 <Image
 src={getHeaderIconPath()}
 alt={providerInfo.name}
 width={48}
 height={48}
 className="max-h-12 max-w-12 rounded-sm object-contain"
 sizes="48px"
 onError={() => {
 markProviderIconMissing(providerInfo.id);
 setHeaderImgError(true);
 }}
 loading="lazy"
 decoding="async"
 />
 )}
 </div>
 <div className="min-w-0">
 <div className="flex items-center gap-3 flex-wrap">
 <h2 className="truncate text-sm font-semibold">{providerInfo.name}</h2>
 {(providerInfo.notice?.apiKeyUrl || providerInfo.notice?.signupUrl || providerInfo.website) && (
 <a
 href={providerInfo.notice?.apiKeyUrl || providerInfo.notice?.signupUrl || providerInfo.website}
 target="_blank"
 rel="noopener noreferrer"
className="text-xs text-primary hover:underline inline-flex min-h-11 items-center gap-1 sm:min-h-0"
 >
 <Icon className="text-sm" name="open_in_new" size={18} />
 {providerInfo.notice?.apiKeyUrl ? "Get API Key" : "Sign up / Learn more"}
 </a>
 )}
 </div>
 <p className="text-text-muted">
 {connectionCount} connection{connectionCount === 1 ? "" : "s"}
 </p>
 </div>
 </div>
 </div>

 {providerInfo.deprecated && (
<div className="flex items-center gap-2 px-3 min-h-11 rounded-sm bg-warning/10 border border-warning/30 sm:h-8 sm:min-h-0">
 <Icon className="text-warning mt-0.5 shrink-0" name="warning" size={18} />
 <p className="text-xs text-danger">{providerInfo.deprecationNotice}</p>
 </div>
 )}

 {providerInfo.notice?.text && !providerInfo.deprecated && (
 <div className="flex flex-col gap-2 rounded-sm border border-primary/30 bg-primary/10 px-3 py-2 sm:flex-row sm:items-center">
 <Icon className="text-primary shrink-0" name="info" size={18} />
 <p className="min-w-0 flex-1 text-xs text-primary">{providerInfo.notice.text}</p>
 {providerInfo.notice.apiKeyUrl && (
 <a
 href={providerInfo.notice.apiKeyUrl}
 target="_blank"
 rel="noopener noreferrer"
className="inline-flex justify-center rounded-sm bg-primary px-2 min-h-11 text-xs font-medium text-white hover:bg-primary-hover sm:min-h-9 sm:py-1"
 >
 Get API Key →
 </a>
 )}
 </div>
 )}

 {isCompatible && providerNode && (
 <Card>
 <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
 <div className="min-w-0">
 <h2 className="text-sm font-semibold">{isAnthropicCompatible ? "Anthropic Compatible Details" : "OpenAI Compatible Details"}</h2>
 <p className="break-all text-sm text-text-muted">
 {isAnthropicCompatible ? "Messages API" : (providerNode.apiType === "responses" ? "Responses API" : "Chat Completions")} · {(providerNode.baseUrl || "").replace(/\/$/, "")}/
 {isAnthropicCompatible ? "messages" : (providerNode.apiType === "responses" ? "responses" : "chat/completions")}
 </p>
 </div>
 <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
 <Button
 size="sm"
 icon="add"
 onClick={() => {
 setAddConnectionError("");
 setShowAddApiKeyModal(true);
 }}
 className="w-full sm:w-auto"
 >
 Add API Key
 </Button>
 <Button
 size="sm"
 variant="secondary"
 icon="edit"
 onClick={() => setShowEditNodeModal(true)}
 className="w-full sm:w-auto"
 >
 Edit
 </Button>
 <Button
 size="sm"
 variant="secondary"
 icon="delete"
 onClick={async () => {
 setConfirmState({
 title: "Delete Compatible Node",
 message: `Delete this ${isAnthropicCompatible ? "Anthropic" : "OpenAI"} Compatible node?`,
 onConfirm: async () => {
 setConfirmState(null);
 try {
 const res = await fetch(`/api/provider-nodes/${providerId}`, { method: "DELETE" });
 if (res.ok) {
 router.push("/dashboard/providers");
 }
 } catch (error) {
 console.log("Error deleting provider node:", error);
 }
 }
 });
 }}
 className="w-full sm:w-auto"
 >
 Delete
 </Button>
 </div>
 </div>
 </Card>
 )}
 </>
 );
}
