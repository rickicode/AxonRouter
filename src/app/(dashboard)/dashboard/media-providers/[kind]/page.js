"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Badge, Button, Toggle, AddCustomEmbeddingModal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";
import { getComboBadge } from "@/shared/utils/comboBadge";
import Icon from "@/shared/components/Icon";

// Kinds that support combos (currently disabled for image/tts — temporarily hidden).
// webSearch/webFetch handled by /web page.
const COMBO_KINDS = new Set([]);
const COMBO_BASE_NAMES = { image: "image-combo", tts: "tts-combo" };

function getEffectiveStatus(conn) {
 const isCooldown = Object.entries(conn).some(
 ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
 );
 if (isCooldown) return "unavailable";
 return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function MediaProviderCard({ provider, kind, providerStats, isCustom, onToggle }) {
 const providerInfo = AI_PROVIDERS[provider.id];
 const isNoAuth = !!providerInfo?.noAuth;

 const pStats = providerStats[provider.id] || {};
 let connected = 0;
 let error = 0;
 let total = 0;
 let allDisabled = true;

 for (const type of Object.keys(pStats)) {
 const stat = pStats[type];
 if (stat) {
 total += stat.total || 0;
 connected += stat.connected || 0;
 error += stat.error || 0;
 if (!stat.allDisabled) allDisabled = false;
 }
 }
 if (total === 0) allDisabled = false;

 const handleToggleClick = (e) => {
 e.preventDefault();
 e.stopPropagation();
 if (onToggle) onToggle(provider.id, allDisabled);
 };

 const renderStatus = () => {
 if (isNoAuth) return <Badge variant="success" size="sm">Ready</Badge>;
 if (allDisabled) return <Badge variant="default" size="sm">Disabled</Badge>;
 if (total === 0) return <span className="text-xs text-text-muted">No connections</span>;
 return (
 <>
 {connected > 0 && <Badge variant="success" size="sm" dot>{connected} Connected</Badge>}
 {error > 0 && <Badge variant="error" size="sm" dot>{error} Error</Badge>}
 {connected === 0 && error === 0 && <Badge variant="default" size="sm">{total} Added</Badge>}
 </>
 );
 };

 return (
 <Link href={`/dashboard/media-providers/${kind}/${provider.id}`} className="group">
 <Card
 padding="xs"
 className={`h-full hover:bg-surface-2 cursor-pointer ${allDisabled ? "opacity-50" : ""}`}
 >
 <div className="flex min-w-0 items-center justify-between gap-3">
 <div className="flex min-w-0 items-center gap-3">
 <div
 className="size-8 rounded-sm flex items-center justify-center shrink-0"
 style={{ backgroundColor: `${provider.color?.length > 7 ? provider.color : (provider.color ?? "#888") + "15"}` }}
 >
 <ProviderIcon
 src={`/providers/${provider.id}.png`}
 alt={provider.name}
 size={30}
 className="object-contain rounded-sm max-w-[30px] max-h-[30px]"
 fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
 fallbackColor={provider.color}
 />
 </div>
 <div className="min-w-0">
 <h3 className="font-semibold text-sm">{provider.name}</h3>
 <div className="flex items-center gap-2 mt-0.5 flex-wrap">
 {isCustom && <Badge variant="default" size="sm">Custom</Badge>}
 {renderStatus()}
 </div>
 </div>
 </div>
 {total > 0 && (
 <div
 className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
 onClick={handleToggleClick}
 >
 <Toggle
 size="sm"
 checked={!allDisabled}
 onChange={() => {}}
 title={allDisabled ? "Enable provider" : "Disable provider"}
 />
 </div>
 )}
 </div>
 </Card>
 </Link>
 );
}

function ComboList({ combos }) {
 if (combos.length === 0) return null;
 return (
 <div className="flex flex-col gap-2">
 {combos.map((combo) => {
 const badge = getComboBadge(combo);
 return (
 <Link key={combo.id} href={`/dashboard/media-providers/combo/${encodeURIComponent(combo.id)}`}>
 <Card padding="xs" className="hover:bg-surface-2 cursor-pointer">
 <div className="flex min-w-0 items-center gap-3">
 <div className={`size-8 rounded-sm flex items-center justify-center shrink-0 border ${badge.border} ${badge.bg} ${badge.text}`} title={badge.title}>
<Icon name={badge.icon} size={18} />
 </div>
 <code className="text-sm font-mono font-medium flex-1 truncate">{combo.name}</code>
 <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
 {combo.models.slice(0, 6).map((entry, i) => {
 const pid = typeof entry === "string" ? entry.split("/")[0] : "";
 const p = AI_PROVIDERS[pid];
 return (
 <div key={`${entry}-${i}`} title={p?.name || entry} className="size-5 rounded-sm flex items-center justify-center" style={{ backgroundColor: `${(p?.color ?? "#888")}15` }}>
 <ProviderIcon
 src={`/providers/${pid}.png`}
 alt={p?.name || pid}
 size={18}
 className="object-contain rounded-sm max-w-[18px] max-h-[18px]"
 fallbackText={p?.textIcon || pid.slice(0, 2).toUpperCase()}
 fallbackColor={p?.color}
 />
 </div>
 );
 })}
 {combo.models.length > 6 && (
 <span className="text-[11px] text-text-muted ml-1">+{combo.models.length - 6}</span>
 )}
 </div>
 <span className="text-[11px] text-text-muted shrink-0">{combo.models.length}</span>
 <Icon className="text-text-muted" name="chevron_right" size={18} />
 </div>
 </Card>
 </Link>
 );
 })}
 </div>
 );
}

export default function MediaProviderKindPage() {
 const { kind } = useParams();
 const router = useRouter();
 const [providerStats, setProviderStats] = useState({});
 const [customNodes, setCustomNodes] = useState([]);
 const [combos, setCombos] = useState([]);
 const [showAddCustomEmbedding, setShowAddCustomEmbedding] = useState(false);
 const notify = useNotificationStore();

 // webSearch/webFetch listing pages are merged into /web
 useEffect(() => {
 if (kind === "webSearch" || kind === "webFetch") {
 router.replace("/dashboard/media-providers/web");
 }
 }, [kind, router]);

 const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
 const isEmbedding = kind === "embedding";
 const supportsCombo = COMBO_KINDS.has(kind);

 useEffect(() => {
 if (!kindConfig) return;
 fetch("/api/providers/stats", { cache: "no-store" })
 .then((r) => r.json())
 .then((d) => setProviderStats(d.stats || {}))
 .catch(() => {});
 if (isEmbedding) {
 fetch("/api/provider-nodes", { cache: "no-store" })
 .then((r) => r.json())
 .then((d) => setCustomNodes((d.nodes || []).filter((n) => n.type === "custom-embedding")))
 .catch(() => {});
 }
 if (supportsCombo) {
 fetch("/api/combos", { cache: "no-store" })
 .then((r) => r.json())
 .then((d) => setCombos(d.combos || []))
 .catch(() => {});
 }
 }, [kind, isEmbedding, supportsCombo, kindConfig]);

 if (!kindConfig) return notFound();

 const providers = getProvidersByKind(kind);
 const kindCombos = combos.filter((c) => c.kind === kind);

 // Map custom nodes to MediaProviderCard shape
 const customProviders = customNodes.map((n) => ({
 id: n.id,
 name: n.name || "Custom Embedding",
 color: "#6366F1",
 textIcon: "CE",
 }));

 const allProviders = [...providers, ...customProviders];

 const handleToggleProvider = async (providerId, newActive) => {
 setProviderStats((prev) => {
 const p = { ...(prev[providerId] || {}) };
 for (const k of Object.keys(p)) {
 p[k] = { ...p[k], allDisabled: !newActive };
 }
 return { ...prev, [providerId]: p };
 });
 try {
 await fetch("/api/providers", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 provider: providerId,
 isActive: newActive,
 }),
 });
 } catch {
 // noop
 }
 };

 const handleCreateCombo = async () => {
 const base = COMBO_BASE_NAMES[kind] || `${kind}-combo`;
 let name = base;
 let i = 1;
 const existing = new Set(combos.map((c) => c.name));
 while (existing.has(name)) { name = `${base}-${i++}`; }
 const res = await fetch("/api/combos", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name, models: [], kind }),
 });
 if (res.ok) {
 const created = await res.json();
 router.push(`/dashboard/media-providers/combo/${encodeURIComponent(created.id)}`);
 } else {
 const err = await res.json();
 notify.error(err.error || "Failed to create combo");
 }
 };

 return (
 <div className="flex flex-col gap-3">
 {(isEmbedding || supportsCombo) && (
 <div className="flex items-center justify-end gap-2">
 {supportsCombo && (
 <Button size="sm" icon="add" onClick={handleCreateCombo}>Create Combo</Button>
 )}
 {isEmbedding && (
 <Button size="sm" icon="add" onClick={() => setShowAddCustomEmbedding(true)}>
 Add Custom Embedding
 </Button>
 )}
 </div>
 )}

 {supportsCombo && kindCombos.length > 0 && (
 <ComboList combos={kindCombos} />
 )}

 {allProviders.length === 0 ? (
 <div className="border border-dashed border-border rounded-sm px-3 py-3 text-sm text-text-muted">
 No providers support <strong>{kindConfig.label}</strong> yet.
 </div>
 ) : (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
 {providers.map((provider) => (
 <MediaProviderCard
 key={provider.id}
 provider={provider}
 kind={kind}
 providerStats={providerStats}
 onToggle={handleToggleProvider}
 />
 ))}
 {customProviders.map((provider) => (
 <MediaProviderCard
 key={provider.id}
 provider={provider}
 kind={kind}
 providerStats={providerStats}
 isCustom
 onToggle={handleToggleProvider}
 />
 ))}
 </div>
 )}

 {isEmbedding && (
 <AddCustomEmbeddingModal
 isOpen={showAddCustomEmbedding}
 onClose={() => setShowAddCustomEmbedding(false)}
 onCreated={(node) => {
 setCustomNodes((prev) => [...prev, node]);
 setShowAddCustomEmbedding(false);
 }}
 />
 )}
 </div>
 );
}
