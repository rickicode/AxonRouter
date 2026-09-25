"use client";

import { useParams, notFound, useRouter } from "@/lib/ui/navigation.js";
import Link from "@/lib/ui/link.jsx";
import { useState, useEffect } from "react";
import { Card, Badge, Button, AddCustomEmbeddingModal, NoAuthProxyCard, ProviderInfoCard } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { ConfirmModal } from "@/shared/components/Modal";
import { useNotificationStore } from "@/store/notificationStore";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS, isCustomEmbeddingProvider } from "@/shared/constants/providers";
import ConnectionsCard from "@/app/(dashboard)/dashboard/providers/components/ConnectionsCard";
import ModelsCard from "@/app/(dashboard)/dashboard/providers/components/ModelsCard";
import { KIND_EXAMPLE_CONFIG } from "./components/exampleShared";
import { EmbeddingExampleCard } from "./components/EmbeddingExampleCard";
import { TtsExampleCard } from "./components/TtsExampleCard";
import { GenericExampleCard } from "./components/GenericExampleCard";
import { SttExampleCard } from "./components/SttExampleCard";

// MediaProviderDetailPage
export default function MediaProviderDetailPage() {
 const { kind, id } = useParams();
 const router = useRouter();
 const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
 const isCustom = isCustomEmbeddingProvider(id) && kind === "embedding";

 const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
 const notify = useNotificationStore();

 const handleDeleteCustom = async () => {
 try {
 const res = await fetch(`/api/provider-nodes/${id}`, { method: "DELETE" });
 if (isCustom) {
 router.push(`/dashboard/media-providers/${kind}`);
 }
 } catch {
 notify.error("Failed to delete custom embedding node");
 }
 };

 const [customNode, setCustomNode] = useState(null);
 const [customLoading, setCustomLoading] = useState(isCustom);
 const [showEditModal, setShowEditModal] = useState(false);

 // Fetch custom node info from API for custom embedding nodes
 useEffect(() => {
 if (!isCustom) return;
 let cancelled = false;
 fetch("/api/provider-nodes", { cache: "no-store" })
 .then((r) => r.json())
 .then((d) => {
 if (cancelled) return;
 setCustomNode((d.nodes || []).find((n) => n.id === id) || null);
 setCustomLoading(false);
 })
 .catch(() => { if (!cancelled) setCustomLoading(false); });
 return () => { cancelled = true; };
 }, [id, isCustom]);

 if (!kindConfig) return notFound();

 const builtInProvider = AI_PROVIDERS[id];

 // For custom embedding nodes, build a synthetic provider object
 const provider = isCustom
 ? (customNode ? { id, name: customNode.name || "Custom Embedding", color: "#6366F1", textIcon: "CE" } : null)
 : builtInProvider;

 if (!isCustom && !builtInProvider) return notFound();
 if (isCustom && !customLoading && !customNode) return notFound();
 if (isCustom && customLoading) {
 return <div className="text-text-muted text-sm py-3 text-center">Loading...</div>;
 }

 const kinds = isCustom ? ["embedding"] : (provider.serviceKinds ?? ["llm"]);
 if (!isCustom && !kinds.includes(kind)) return notFound();

 return (
 <div className="flex flex-col gap-3">
 {/* Back */}
 <div>
 <Link
 href={`/dashboard/media-providers/${kind}`}
 className="inline-flex h-8 items-center gap-1 text-sm text-text-muted hover:text-primary mb-3"
 >
 <Icon name="arrow_back" size={18} />
 {kindConfig.label}
 </Link>

 {/* Header */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
 <div className="size-8 rounded-sm flex items-center justify-center shrink-0" style={{ backgroundColor: `${provider.color}15` }}>
 <ProviderIcon
 src={`/providers/${provider.id}.png`}
 alt={provider.name}
 size={48}
 className="object-contain rounded-sm max-w-[48px] max-h-[48px]"
 fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
 fallbackColor={provider.color}
 />
 </div>
 <div className="flex-1">
 <div className="flex flex-wrap items-center gap-2 sm:gap-3">
 <h2 className="text-sm font-semibold">{provider.name}</h2>
 {!isCustom && provider.notice?.apiKeyUrl && (
 <a
 href={provider.notice.apiKeyUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="text-xs text-primary hover:underline inline-flex items-center gap-1"
 >
 <Icon className="text-sm" name="open_in_new" size={18} />
 Get API Key
 </a>
 )}
 </div>
 <div className="flex items-center gap-1.5 mt-1 flex-wrap">
 {isCustom && <Badge variant="default" size="sm">Custom · {customNode?.prefix}</Badge>}
 {kinds.map((k) => (
 <Badge key={k} variant={k === kind ? "primary" : "default"} size="sm">
 {k.toUpperCase()}
 </Badge>
 ))}
 </div>
 </div>
 {isCustom && (
 <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
 <Button size="sm" variant="secondary" icon="edit" onClick={() => setShowEditModal(true)}>
 Edit
 </Button>
 <Button size="sm" variant="secondary" icon="delete" onClick={() => setDeleteConfirmOpen(true)}>
 Delete
 </Button>
 </div>
 )}
 </div>
 </div>

 {/* Kind-specific notice (e.g. codex/image requires Plus) */}
 {!isCustom && provider.kindNotice?.[kind] && (
 <div className="flex items-start gap-3 h-8 px-3 rounded-sm bg-warning/10 border border-warning/30 text-warning">
 <Icon className="mt-0.5" name="warning" size={18} />
 <p className="text-sm">{provider.kindNotice[kind]}</p>
 </div>
 )}

 {/* Provider notice text (only when there's actual text content) */}
 {!isCustom && provider.notice?.text && !provider.deprecated && (
 <div className="flex flex-col gap-2 rounded-sm border border-primary/30 bg-primary/10 px-3 py-2 sm:flex-row sm:items-center">
 <Icon className="text-primary shrink-0" name="info" size={18} />
 <p className="min-w-0 flex-1 text-xs text-primary">{provider.notice.text}</p>
 {provider.notice.apiKeyUrl && (
 <a
 href={provider.notice.apiKeyUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex justify-center rounded-sm bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-hover sm:py-1"
 >
 Get API Key →
 </a>
 )}
 </div>
 )}

 {/* Connections */}
 {!isCustom && provider.noAuth ? (
 <NoAuthProxyCard providerId={id} />
 ) : (
 <ConnectionsCard providerId={id} isOAuth={false} />
 )}

 {/* Models - show when provider has models for this kind or searchViaChat */}
 {kind !== "tts" && kind !== "webFetch" && (kind !== "webSearch" || !!provider.searchViaChat) && (
 <ModelsCard
 providerId={id}
 kindFilter={kind}
 providerAliasOverride={isCustom ? customNode?.prefix : undefined}
 />
 )}

 {/* Provider Info — config-driven, supports searchConfig, fetchConfig, ttsConfig, embeddingConfig, searchViaChat */}
 {!isCustom && (provider.searchConfig || provider.fetchConfig || provider.ttsConfig || provider.sttConfig || provider.embeddingConfig || provider.searchViaChat) && (
 <ProviderInfoCard
 config={
 kind === "webFetch" ? provider.fetchConfig
 : kind === "tts" ? provider.ttsConfig
 : kind === "stt" ? provider.sttConfig
 : kind === "embedding" ? provider.embeddingConfig
 : provider.searchConfig || { mode: "chat-completions", defaultModel: provider.searchViaChat?.defaultModel, pricingUrl: provider.searchViaChat?.pricingUrl, freeTier: provider.searchViaChat?.freeTier }
 }
 provider={provider}
 title={`${kindConfig.label} Config`}
 />
 )}

 {/* Example — per kind */}
 {kind === "embedding" && (
 <EmbeddingExampleCard providerId={id} customAlias={customNode?.prefix} />
 )}
 {kind === "tts" && <TtsExampleCard providerId={id} />}
 {kind === "stt" && !isCustom && <SttExampleCard providerId={id} />}
 {!isCustom && KIND_EXAMPLE_CONFIG[kind] && <GenericExampleCard providerId={id} kind={kind} />}

 {isCustom && (<>
 <ConfirmModal isOpen={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} onConfirm={handleDeleteCustom} title="Delete Custom Embedding" message="Delete this Custom Embedding node?" variant="danger" />

 <AddCustomEmbeddingModal
 isOpen={showEditModal}
 node={customNode}
 onClose={() => setShowEditModal(false)}
 onSaved={(updated) => {
 setCustomNode(updated);
 setShowEditModal(false);
 }}
 />
 </>)}
 </div>
 );
}
