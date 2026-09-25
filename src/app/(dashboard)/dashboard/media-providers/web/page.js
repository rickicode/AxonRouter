"use client";

import Link from "@/lib/ui/link.jsx";
import { useEffect, useState } from "react";
import { useRouter } from "@/lib/ui/navigation.js";
import { useNotificationStore } from "@/store/notificationStore";
import { Card, Badge, Button } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";
import { getComboBadge } from "@/shared/utils/comboBadge";
import Icon from "@/shared/components/Icon";

function ProviderCard({ provider, kind, providerStats }) {
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
 <Card padding="xs" className={`h-full hover:bg-surface-2 cursor-pointer ${allDisabled ? "opacity-50" : ""}`}>
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
 <div>
 <h3 className="font-semibold text-sm">{provider.name}</h3>
 <div className="flex items-center gap-2 mt-0.5 flex-wrap">{renderStatus()}</div>
 </div>
 </div>
 </Card>
 </Link>
 );
}

function ComboList({ combos }) {
 if (combos.length === 0) {
 return <p className="text-xs text-text-muted italic">No combos yet.</p>;
 }
 return (
 <div className="flex flex-col gap-2">
 {combos.map((combo) => {
 const badge = getComboBadge(combo);
 return (
 <Link key={combo.id} href={`/dashboard/media-providers/combo/${encodeURIComponent(combo.id)}`}>
 <Card padding="xs" className="hover:bg-surface-2 cursor-pointer">
 <div className="flex min-w-0 items-center gap-3">
 <div className={`size-7 rounded-sm flex items-center justify-center shrink-0 border ${badge.border} ${badge.bg} ${badge.text}`} title={badge.title}>
<Icon name={badge.icon} size={18} />
 </div>
 <code className="text-sm font-mono font-medium flex-1 truncate">{combo.name}</code>
 {/* Provider icons preview */}
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

function Section({ title, icon, kind, providers, providerStats, combos, onCreateCombo }) {
 return (
 <div>
 {/* Header — title left, Create Combo right */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
 <div className="flex flex-wrap items-center gap-2">
<Icon name={icon} size={18} className="text-primary" />
 <h2 className="text-sm font-semibold">{title}</h2>
 <span className="text-xs text-text-muted">({providers.length} providers · {combos.length} combos)</span>
 </div>
 <Button size="sm" icon="add" onClick={onCreateCombo}>Create Combo</Button>
 </div>

 {/* Combos — top */}
 {combos.length > 0 && (
 <div className="mb-3">
 <ComboList combos={combos} />
 </div>
 )}

 {/* Providers grid — bottom */}
 {providers.length === 0 ? (
 <div className="text-center py-3 border border-dashed border-border rounded-sm text-text-muted text-sm">
 No providers.
 </div>
 ) : (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
 {providers.map((p) => (
 <ProviderCard key={p.id} provider={p} kind={kind} providerStats={providerStats} />
 ))}
 </div>
 )}
 </div>
 );
}

export default function WebProvidersPage() {
 const router = useRouter();
 const [providerStats, setProviderStats] = useState({});
 const notify = useNotificationStore();
 const [combos, setCombos] = useState([]);

 const fetchAll = async () => {
 try {
 const [statsRes, combosRes] = await Promise.all([
 fetch("/api/providers/stats", { cache: "no-store" }),
 fetch("/api/combos", { cache: "no-store" }),
 ]);
 if (statsRes.ok) setProviderStats((await statsRes.json()).stats || {});
 if (combosRes.ok) setCombos((await combosRes.json()).combos || []);
 } catch { /* noop */ }
 };

 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(() => { fetchAll(); }, []);

 const searchProviders = getProvidersByKind("webSearch");
 const fetchProviders = getProvidersByKind("webFetch");
 const searchCombos = combos.filter((c) => c.kind === "webSearch");
 const fetchCombos = combos.filter((c) => c.kind === "webFetch");

 const handleCreateCombo = async (kind) => {
 // Generate unique default name
 const base = kind === "webSearch" ? "search-combo" : "fetch-combo";
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
 <Section
 title="Web Search"
 icon="travel_explore"
 kind="webSearch"
 providers={searchProviders}
 providerStats={providerStats}
 combos={searchCombos}
 onCreateCombo={() => handleCreateCombo("webSearch")}
 />

 {/* Divider between sections */}
 <div className="border-t border-border" />

 <Section
 title="Web Fetch"
 icon="download"
 kind="webFetch"
 providers={fetchProviders}
 providerStats={providerStats}
 combos={fetchCombos}
 onCreateCombo={() => handleCreateCombo("webFetch")}
 />
 </div>
 );
}
