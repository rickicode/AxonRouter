"use client";

import dynamic from "next/dynamic";

const ModalSkeleton = () => null;
const OAuthModal = dynamic(() => import("@/shared/components/OAuthModal"), { ssr: false, loading: ModalSkeleton });
const KiroOAuthWrapper = dynamic(() => import("@/shared/components/KiroOAuthWrapper"), { ssr: false, loading: ModalSkeleton });
const CursorAuthModal = dynamic(() => import("@/shared/components/CursorAuthModal"), { ssr: false, loading: ModalSkeleton });
const XiaomiMimoAuthModal = dynamic(() => import("@/shared/components/XiaomiMimoAuthModal"), { ssr: false, loading: ModalSkeleton });
const IFlowCookieModal = dynamic(() => import("@/shared/components/IFlowCookieModal"), { ssr: false, loading: ModalSkeleton });
const GitLabAuthModal = dynamic(() => import("@/shared/components/GitLabAuthModal"), { ssr: false, loading: ModalSkeleton });
const EditConnectionModal = dynamic(() => import("@/shared/components/EditConnectionModal"), { ssr: false, loading: ModalSkeleton });
const ConfirmModal = dynamic(() => import("@/shared/components/Modal").then((m) => m.ConfirmModal || m.default), { ssr: false, loading: ModalSkeleton });
const AddApiKeyModal = dynamic(() => import("./AddApiKeyModal"), { ssr: false });
const EditCompatibleNodeModal = dynamic(() => import("./EditCompatibleNodeModal"), { ssr: false });
const AddCustomModelModal = dynamic(() => import("./AddCustomModelModal"), { ssr: false });
const BulkImportCodexModal = dynamic(() => import("./BulkImportCodexModal"), { ssr: false });
const BulkImportGrokCliModal = dynamic(() => import("./BulkImportGrokCliModal"), { ssr: false });
const BulkImportJwtModal = dynamic(() => import("./BulkImportJwtModal"), { ssr: false });

export default function ProviderModals(d) {
 const {
 providerId, providerInfo, isCompatible, isOAuth, isAnthropicCompatible,
 showOAuthModal, setShowOAuthModal, showXiaomiMimoModal, setShowXiaomiMimoModal,
 showIFlowCookieModal, setShowIFlowCookieModal, showAddApiKeyModal, setShowAddApiKeyModal,
 addConnectionError, setAddConnectionError, showEditModal, setShowEditModal,
 showEditNodeModal, setShowEditNodeModal, showAddCustomModel, setShowAddCustomModel,
 showBulkImportCodex, setShowBulkImportCodex, showBulkImportGrokCli, setShowBulkImportGrokCli,
 showBulkImportJwt, setShowBulkImportJwt, showAgRiskModal, setShowAgRiskModal,
 confirmState, setConfirmState, selectedConnection, providerStorageAlias,
 providerDisplayAlias, proxyPools, connections,
 handleOAuthSuccess, handleIFlowCookieSuccess, handleSaveApiKey,
 handleUpdateConnection, handleUpdateNode, handleAddCustomModel, handleAgRiskConfirm,
  fetchConnections, fetchConnectionStats,
 } = d;

 return (
 <>
 {providerId === "kiro" ? (
 <KiroOAuthWrapper isOpen={showOAuthModal} providerInfo={providerInfo}
 onSuccess={handleOAuthSuccess} onClose={() => setShowOAuthModal(false)} />
 ) : providerId === "cursor" ? (
 <CursorAuthModal isOpen={showOAuthModal}
 onSuccess={handleOAuthSuccess} onClose={() => setShowOAuthModal(false)} />
 ) : providerId === "gitlab" ? (
 <GitLabAuthModal isOpen={showOAuthModal} providerInfo={providerInfo}
 onSuccess={handleOAuthSuccess} onClose={() => setShowOAuthModal(false)} />
 ) : (
 <OAuthModal isOpen={showOAuthModal} provider={providerId} providerInfo={providerInfo}
 onSuccess={handleOAuthSuccess} onClose={() => setShowOAuthModal(false)} />
 )}

 <XiaomiMimoAuthModal isOpen={showXiaomiMimoModal}
 onSuccess={handleOAuthSuccess} onClose={() => setShowXiaomiMimoModal(false)} />

 {providerId === "iflow" && (
 <IFlowCookieModal isOpen={showIFlowCookieModal}
 onSuccess={handleIFlowCookieSuccess} onClose={() => setShowIFlowCookieModal(false)} />
 )}

 <AddApiKeyModal
 isOpen={showAddApiKeyModal} provider={providerId}
 providerName={providerInfo.name} isCompatible={isCompatible}
 isAnthropic={isAnthropicCompatible} authType={providerInfo?.authType}
 authHint={providerInfo?.authHint} website={providerInfo?.website}
 proxyPools={proxyPools} error={addConnectionError}
 existingNames={connections.map((c) => c.name).filter(Boolean)}
  onSave={handleSaveApiKey} onBulkDone={() => { fetchConnections(); fetchConnectionStats(); }}
 onClose={() => { setAddConnectionError(""); setShowAddApiKeyModal(false); }}
 />

 <EditConnectionModal
 isOpen={showEditModal} connection={selectedConnection}
 proxyPools={proxyPools} onSave={handleUpdateConnection}
 onClose={() => setShowEditModal(false)}
 />

 {isCompatible && (
 <EditCompatibleNodeModal
 isOpen={showEditNodeModal} node={d.providerNode}
 onSave={handleUpdateNode} onClose={() => setShowEditNodeModal(false)}
 isAnthropic={isAnthropicCompatible}
 />
 )}

 {!isCompatible && (
 <AddCustomModelModal
 isOpen={showAddCustomModel} providerAlias={providerStorageAlias}
 providerDisplayAlias={providerDisplayAlias}
 onSave={async (modelId, caps) => {
 await handleAddCustomModel(modelId, "llm", providerStorageAlias, caps);
 setShowAddCustomModel(false);
 }}
 onClose={() => setShowAddCustomModel(false)}
 />
 )}

 {providerId === "codex" && (
 <BulkImportCodexModal isOpen={showBulkImportCodex}
  onClose={() => setShowBulkImportCodex(false)} onSuccess={() => { fetchConnections(); fetchConnectionStats(); }} />
 )}

 {providerId === "grok-cli" && (
 <BulkImportGrokCliModal isOpen={showBulkImportGrokCli}
  onClose={() => setShowBulkImportGrokCli(false)} onSuccess={() => { fetchConnections(); fetchConnectionStats(); }} />
 )}

 {(providerId === "codebuddy-intl" || providerId === "codebuddy-cn" || providerId === "workbuddy") && (
 <BulkImportJwtModal providerId={providerId} isOpen={showBulkImportJwt}
  onClose={() => setShowBulkImportJwt(false)} onSuccess={() => { fetchConnections(); fetchConnectionStats(); }} />
 )}

 <ConfirmModal
 isOpen={showAgRiskModal}
 onClose={() => setShowAgRiskModal(false)}
 onConfirm={handleAgRiskConfirm}
 title="Risk Notice"
 message={providerInfo?.deprecationNotice}
 confirmText="I Understand, Continue"
 cancelText="Cancel"
 variant="danger"
 />

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
