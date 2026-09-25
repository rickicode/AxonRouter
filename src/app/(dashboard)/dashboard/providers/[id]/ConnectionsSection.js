"use client";

import { Card, Button, Toggle, SegmentedControl } from "@/shared/components";
import dynamic from "@/lib/ui/dynamic.jsx";
import ConnectionRow from "./ConnectionRow";
import { translate } from "@/i18n/runtime";
const NoAuthProxyCard = dynamic(() => import("@/shared/components/NoAuthProxyCard"), { ssr: false, loading: () => <div className="flex flex-col gap-3"><div className="h-40 animate-pulse rounded-sm bg-surface-2" /></div> });
const Modal = dynamic(() => import("@/shared/components/Modal"), { ssr: false, loading: () => null });
import { getPaginationItems } from "./utils";
import Icon from "@/shared/components/Icon";

function ConnectionsCardHeader({
 connections, proxyPools, providerStrategy, oneByOneRunning, oneByOneStopping,
 handleBulkResetStatus, handleRunOneByOneTest, handleStopOneByOneTest,
 handleRoundRobinToggle, handleStickyLimitChange, providerStickyLimit, connectionStats,
 setShowBulkProxyModal,
}) {
 return (
 <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-3 ">
 <div className="flex items-center gap-3">
 <h2 className="text-sm font-semibold">Connections</h2>
 <span className="text-xs text-text-muted font-medium">
 ({connectionStats.total ?? connections.length} total)
 </span>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 {connections.length > 0 && proxyPools.length > 0 && (
 <Button size="sm" variant="secondary" icon="lan" onClick={() => setShowBulkProxyModal(true)} title="Apply proxy to all or selected connections">
 Apply Proxy
 </Button>
 )}
 {connections.length > 0 && (
 <Button size="sm" variant="secondary" icon="restart_alt" onClick={handleBulkResetStatus}
 title="Clear all model locks, cooldowns, and error statuses for all or selected connections">
 Reset Exhausted
 </Button>
 )}
 {connections.length > 0 && (
 <div className="flex items-center gap-1.5">
 <Button size="sm" variant="secondary" icon="sync" onClick={handleRunOneByOneTest} disabled={oneByOneRunning}>
 {oneByOneRunning ? "Testing..." : "Test One-by-One"}
 </Button>
 {oneByOneRunning && (
 <Button size="sm" variant="ghost" icon="stop" onClick={handleStopOneByOneTest} disabled={oneByOneStopping}>
 {oneByOneStopping ? "Stopping..." : "Stop"}
 </Button>
 )}
 </div>
 )}
      <div className="flex flex-wrap items-center gap-2 border-l border-border pl-2">
        <span className="text-xs text-text-muted font-medium whitespace-nowrap">Round Robin</span>
        <Toggle checked={providerStrategy === "round-robin"} onChange={handleRoundRobinToggle} />
        {providerStrategy === "round-robin" && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-muted">Sticky:</span>
            <input
              type="number" min={1} value={providerStickyLimit}
              onChange={(e) => handleStickyLimitChange(e.target.value)} placeholder="1"
              className="w-14 px-1.5 min-h-11 text-xs border border-border rounded-sm bg-surface focus:outline-none focus:border-primary sm:min-h-9"
            />
          </div>
        )}
      </div>
 </div>
 </div>
 );
}

function SearchFilterBar({ connectionSearch, setConnectionSearch, connectionPage, setConnectionPage, fetchConnections, connectionStatusFilter, setConnectionStatusFilter, connectionStats }) {
 return (
 <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 ">
 <div className="relative flex-1 max-w-sm">
 <Icon name="search" size={18} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text" value={connectionSearch}
          onChange={(e) => {
            const val = e.target.value;
            setConnectionSearch(val);
            setConnectionPage(1);
            fetchConnections(1, val, connectionStatusFilter);
          }}
          placeholder="Search account name or email..."
          className="w-full rounded-sm border border-border bg-surface min-h-11 pl-8 pr-8 text-xs text-text-main placeholder-text-muted focus:border-primary focus:outline-none sm:min-h-9"
        />
        {connectionSearch && (
          <button type="button"
            onClick={() => { setConnectionSearch(""); setConnectionPage(1); fetchConnections(1, "", connectionStatusFilter); }}
            className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-text-muted hover:text-text-main sm:min-h-9 sm:min-w-9"
            aria-label="Clear search"
          >
            <Icon name="close" size={18} />
          </button>
        )}
 </div>
      <SegmentedControl
        options={[
          { key: "all", label: `All (${connectionStats.total ?? 0})` },
          { key: "active", label: `Active (${connectionStats.active ?? 0})` },
          { key: "exhausted", label: `Exhausted (${connectionStats.exhausted ?? 0})` },
          { key: "unavailable", label: `Unavailable (${connectionStats.unavailable ?? 0})` },
          { key: "disabled", label: `Disabled (${connectionStats.disabled ?? 0})` },
        ].map((t) => ({ value: t.key, label: t.label }))}
        value={connectionStatusFilter}
        onChange={(key) => {
          setConnectionStatusFilter(key);
          setConnectionPage(1);
          fetchConnections(1, connectionSearch, key);
        }}
        size="touch"
        snap
        aria-label="Filter connections by status"
      />
 </div>
 );
}

function ConnectionsList({
 connections, proxyPools, proxyGroups, providerId, isOAuth, isSelected, toggleSelectConnection,
 handleSwapPriority, handleUpdateConnectionStatus, handleAutoPingConnection,
 autoPing, autoPingEnabled, handleDelete, handleResetConnectionStatus, oneByOneResults,
 handleUnlockModel, setSelectedConnection, setShowEditModal, handleConnectionProxyUpdate,
}) {
 return (
 <div className="flex min-w-0 flex-col divide-y divide-border">
 {connections.map((conn, index) => (
 <div key={conn.id} className="flex min-w-0 items-stretch relative">
 <div className="flex shrink-0 items-center pl-1 sm:pl-2">
 <input
 type="checkbox" checked={isSelected(conn.id)}
 onChange={() => toggleSelectConnection(conn.id)}
 className="h-4 w-4 rounded-sm border-border text-primary"
 />
 </div>
 <div className="flex-1 min-w-0">
 <ConnectionRow
 connection={conn}
 proxyPools={proxyPools}
 proxyGroups={proxyGroups}
 isOAuth={isOAuth}
 isFirst={index === 0}
 isLast={index === connections.length - 1}
 onMoveUp={() => handleSwapPriority(index, index - 1)}
 onMoveDown={() => handleSwapPriority(index, index + 1)}
 onToggleActive={(isActive) => handleUpdateConnectionStatus(conn.id, isActive)}
          autoPing={autoPingEnabled && conn.authType === "oauth" ? {
            on: autoPing?.connections?.[conn.id] === true,
            onToggle: (on) => handleAutoPingConnection?.(conn.id, on),
            provider: providerId,
          } : null}
 onUpdateProxy={(proxyConfig) => handleConnectionProxyUpdate(conn.id, proxyConfig)}
 onEdit={() => { setSelectedConnection(conn); setShowEditModal(true); }}
 onDelete={() => handleDelete(conn.id)}
 onResetStatus={handleResetConnectionStatus}
          oneByOneStatus={oneByOneResults?.[conn.id] || null}
 onUnlockModel={providerId === "freebuff" ? () => handleUnlockModel(conn.id) : null}
 />
 </div>
 </div>
 ))}
 </div>
 );
}

export default function ConnectionsSection(d) {
 const {
 isFreeNoAuth, providerId, providerStrategy, connections, proxyPools, proxyGroups,
 connectionStats, connectionPage, setConnectionPage, connectionPagination, connectionSearch,
 setConnectionSearch, connectionStatusFilter, setConnectionStatusFilter, selectedConnectionIds,
 allSelected, toggleSelectConnection, toggleSelectAllConnections, clearSelection,
 oneByOneRunning, oneByOneStopping, oneByOneSummary, oneByOneCurrentConnectionId, oneByOneResults,
 handleBulkResetStatus, handleRunOneByOneTest, handleStopOneByOneTest,
 handleRoundRobinToggle, handleStickyLimitChange, providerStickyLimit,
 handleBulkToggleActive, handleBulkDelete, handleDelete, handleResetConnectionStatus, handleSwapPriority,
 handleUpdateConnectionStatus, handleAutoPingConnection, autoPing,
 handleUnlockModel, setSelectedConnection, setShowEditModal,
 handleApplyOneToOne, handleApplyRotationStrategy, handleApplySinglePool,
 handleApplyGroup, showBulkProxyModal, closeBulkProxyModal, bulkUpdatingProxy,
 bulkProxyRotationStrategy, setBulkProxyRotationStrategy, fetchConnections,
 isSelected, triggerAddConnection, triggerOAuthConnection, triggerApiKeyConnection,
 hasDualAuthModes, oauthConnectionLabel, apiKeyConnectionLabel, isCompatible,
 setShowBulkProxyModal, showIFlowCookieModal, setShowIFlowCookieModal,
 setShowBulkImportCodex, setShowBulkImportGrokCli, setShowBulkImportJwt,
 showAddApiKeyModal, setAddConnectionError, setShowAddApiKeyModal,
 selectedConnection: editSelectedConnection,
 } = d;

 const activePools = proxyPools.filter((p) => p.isActive === true);

 return (
 <>
 {isFreeNoAuth ? (
 <NoAuthProxyCard providerId={providerId} />
 ) : (
 <Card>
 <ConnectionsCardHeader
 connections={connections} proxyPools={proxyPools}
 providerStrategy={providerStrategy} oneByOneRunning={oneByOneRunning}
 oneByOneStopping={oneByOneStopping} handleBulkResetStatus={handleBulkResetStatus}
 handleRunOneByOneTest={handleRunOneByOneTest} handleStopOneByOneTest={handleStopOneByOneTest}
 handleRoundRobinToggle={handleRoundRobinToggle} handleStickyLimitChange={handleStickyLimitChange}
 providerStickyLimit={providerStickyLimit} connectionStats={connectionStats}
 setShowBulkProxyModal={setShowBulkProxyModal}
 />
 <SearchFilterBar
 connectionSearch={connectionSearch} setConnectionSearch={setConnectionSearch}
 connectionPage={connectionPage} setConnectionPage={setConnectionPage}
 fetchConnections={fetchConnections} connectionStatusFilter={connectionStatusFilter}
 setConnectionStatusFilter={setConnectionStatusFilter} connectionStats={connectionStats}
 />

 {connections.length === 0 ? (
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-center gap-3">
 <div className="inline-flex items-center justify-center w-9 h-8 rounded-sm bg-primary/10 text-primary shrink-0">
 <Icon name={d.isOAuth ? "lock" : "key"} size={18} />
 </div>
 <div className="min-w-0">
 <p className="text-sm text-text-muted">No connections yet</p>
 {hasDualAuthModes && (
 <p className="text-xs text-text-muted">Choose {oauthConnectionLabel} or {apiKeyConnectionLabel}.</p>
 )}
 </div>
 </div>
          <div className="flex flex-wrap gap-2">
            {hasDualAuthModes ? (
              <>
                <Button size="sm" icon="lock" variant="secondary" onClick={triggerOAuthConnection} className="min-h-11 sm:min-h-7">{oauthConnectionLabel}</Button>
                <Button size="sm" icon="key" onClick={triggerApiKeyConnection} className="min-h-11 sm:min-h-7">{apiKeyConnectionLabel}</Button>
              </>
            ) : (
              <>
                {!isCompatible && providerId === "iflow" && (
                  <Button size="sm" icon="cookie" variant="secondary" onClick={() => setShowIFlowCookieModal(true)} className="min-h-11 sm:min-h-7">Cookie</Button>
                )}
                {providerId === "codex" && (
                  <Button size="sm" icon="playlist_add" variant="secondary" onClick={() => setShowBulkImportCodex(true)} className="min-h-11 sm:min-h-7">{translate("Bulk Add")}</Button>
                )}
                {providerId === "grok-cli" && (
                  <Button size="sm" icon="playlist_add" variant="secondary" onClick={() => setShowBulkImportGrokCli(true)} className="min-h-11 sm:min-h-7">{translate("Bulk Add")}</Button>
                )}
                {(providerId === "codebuddy-intl" || providerId === "codebuddy-cn" || providerId === "workbuddy") && (
                  <Button size="sm" icon="playlist_add" variant="secondary" onClick={() => setShowBulkImportJwt(true)} className="min-h-11 sm:min-h-7">{translate("Bulk Add")}</Button>
                )}
                <Button size="sm" icon="add" onClick={triggerAddConnection} className="min-h-11 sm:min-h-7">
                  {isCompatible ? "Add API Key" : (providerId === "iflow" ? "OAuth" : "Add Connection")}
                </Button>
              </>
            )}
          </div>
 </div>
 ) : (
 <>
 {oneByOneSummary && (
 <div className="mb-3 rounded-sm border border-border bg-surface p-3 text-xs text-text-muted">
 <div className="flex flex-wrap items-center gap-3">
 <span>Total: {oneByOneSummary.total}</span>
 <span>Completed: {oneByOneSummary.completed}</span>
 <span>Passed: {oneByOneSummary.passed}</span>
 <span>Failed: {oneByOneSummary.failed}</span>
 {oneByOneSummary.stopped && <span className="text-warning">Stopped</span>}
 {oneByOneRunning && oneByOneCurrentConnectionId && (
 <span>Running: {connections.find((conn) => conn.id === oneByOneCurrentConnectionId)?.name || oneByOneCurrentConnectionId}</span>
 )}
 </div>
 </div>
 )}
 {connections.length > 0 && (
 <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-surface p-3">
 <div className="flex items-center gap-3">
 <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-text-muted hover:text-primary">
 <input type="checkbox" checked={allSelected} onChange={toggleSelectAllConnections}
 className="h-3.5 w-3.5 rounded-sm border-border text-primary" />
 Select All ({connections.length} on page)
 </label>
 {selectedConnectionIds.length > 0 && (
 <span className="inline-flex items-center rounded-sm bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
 {selectedConnectionIds.length} selected
 </span>
 )}
 </div>
 {selectedConnectionIds.length > 0 && (
 <div className="flex flex-wrap items-center gap-1.5 animate-in fade-in">
 <Button size="sm" variant="secondary" icon="toggle_on" onClick={() => handleBulkToggleActive(true)} title="Enable selected connections" className="!py-1 !text-xs">Enable</Button>
 <Button size="sm" variant="secondary" icon="toggle_off" onClick={() => handleBulkToggleActive(false)} title="Disable selected connections" className="!py-1 !text-xs">Disable</Button>
 <Button size="sm" variant="danger" icon="delete" onClick={handleBulkDelete} title="Delete selected connections" className="!py-1 !text-xs">Delete ({selectedConnectionIds.length})</Button>
 <Button size="sm" variant="ghost" icon="close" onClick={clearSelection} title="Clear selection" className="!py-1 !text-xs">Clear</Button>
 </div>
 )}
 </div>
 )}
 <ConnectionsList
 connections={connections} proxyPools={proxyPools} proxyGroups={proxyGroups}
 providerId={providerId} isOAuth={d.isOAuth} isSelected={isSelected}
 toggleSelectConnection={toggleSelectConnection} handleSwapPriority={handleSwapPriority}
 handleUpdateConnectionStatus={handleUpdateConnectionStatus}
 handleAutoPingConnection={handleAutoPingConnection} autoPing={autoPing} autoPingEnabled={d.AUTO_PING_SETTINGS_KEYS?.[providerId]}
 handleDelete={handleDelete} handleResetConnectionStatus={handleResetConnectionStatus}
 oneByOneResults={oneByOneResults} handleUnlockModel={handleUnlockModel}
 setSelectedConnection={setSelectedConnection} setShowEditModal={setShowEditModal}
 handleConnectionProxyUpdate={d.handleConnectionProxyUpdate}
 />
 {connectionPagination.totalPages > 1 && (
 <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border pt-3 text-xs text-text-muted ">
 <span>
 Showing{" "}
 <span className="font-medium text-text-main">{(connectionPagination.page - 1) * connectionPagination.pageSize + 1}</span>-
 <span className="font-medium text-text-main">{Math.min(connectionPagination.page * connectionPagination.pageSize, connectionPagination.total)}</span>{" "}
 of <span className="font-medium text-text-main">{connectionPagination.total}</span> connections (Page {connectionPagination.page} of {connectionPagination.totalPages})
 </span>
 <div className="flex flex-wrap items-center gap-1">
 <button type="button" onClick={() => setConnectionPage((page) => Math.max(1, page - 1))}
 disabled={connectionPagination.page <= 1}
className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-xs font-medium text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 min-h-11 sm:h-8 sm:min-h-0"
 title="Previous Page">
 <Icon name="chevron_left" size={18} />
 <span>Prev</span>
 </button>
 {getPaginationItems(connectionPagination.page, connectionPagination.totalPages).map((item, idx) => {
 if (typeof item === "string") {
 return <span key={`ellipsis-${idx}`} className="px-1 text-text-muted select-none">…</span>;
 }
 const isCurrent = item === connectionPagination.page;
 return (
 <button key={item} type="button" onClick={() => setConnectionPage(item)}
className={`min-w-11 min-h-11 rounded-sm text-xs font-medium px-1.5 flex items-center justify-center sm:min-w-8 sm:h-8 sm:min-h-0 ${isCurrent ? "bg-primary text-white " : "border border-border bg-surface text-text-main hover:bg-surface-2"}`}>
 {item}
 </button>
 );
 })}
 <button type="button" onClick={() => setConnectionPage((page) => Math.min(connectionPagination.totalPages, page + 1))}
 disabled={connectionPagination.page >= connectionPagination.totalPages}
className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-xs font-medium text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 min-h-11 sm:h-8 sm:min-h-0"
 title="Next Page">
 <span>Next</span>
 <Icon name="chevron_right" size={18} />
 </button>
 </div>
 </div>
 )}
 {!isCompatible && (
            <div className="mt-4 flex flex-wrap gap-2">
              {providerId === "iflow" && (
                <Button size="sm" icon="cookie" variant="secondary" onClick={() => setShowIFlowCookieModal(true)} className="w-full sm:w-auto min-h-11 sm:min-h-7">Cookie</Button>
              )}
              {providerId === "codex" && (
                <Button size="sm" icon="playlist_add" variant="secondary" onClick={() => setShowBulkImportCodex(true)} className="w-full sm:w-auto min-h-11 sm:min-h-7">Bulk Add</Button>
              )}
              {providerId === "grok-cli" && (
                <Button size="sm" icon="playlist_add" variant="secondary" onClick={() => setShowBulkImportGrokCli(true)} className="w-full sm:w-auto min-h-11 sm:min-h-7">Bulk Add</Button>
              )}
              {(providerId === "codebuddy-intl" || providerId === "codebuddy-cn" || providerId === "workbuddy") && (
                <Button size="sm" icon="playlist_add" variant="secondary" onClick={() => setShowBulkImportJwt(true)} className="w-full sm:w-auto min-h-11 sm:min-h-7">Bulk Add</Button>
              )}
              {hasDualAuthModes ? (
                <>
                  <Button size="sm" icon="lock" variant="secondary" onClick={triggerOAuthConnection} className="w-full sm:w-auto min-h-11 sm:min-h-7">{oauthConnectionLabel}</Button>
                  <Button size="sm" icon="key" onClick={triggerApiKeyConnection} className="w-full sm:w-auto min-h-11 sm:min-h-7">{apiKeyConnectionLabel}</Button>
                </>
              ) : (
                <Button size="sm" icon="add" onClick={triggerAddConnection} className="w-full sm:w-auto min-h-11 sm:min-h-7">Add</Button>
              )}
            </div>
          )}
        </>
 )}
 </Card>
 )}

 {/* Bulk Proxy Modal */}
 <Modal
 isOpen={showBulkProxyModal}
 onClose={closeBulkProxyModal}
 title={selectedConnectionIds.length > 0
 ? `Apply Proxy (${selectedConnectionIds.length} selected connections)`
 : `Apply Proxy (All ${connectionPagination.total || connections.length} connections in ${providerId})`}
 >
 <div className="flex flex-col gap-3">
 <div className="rounded-sm border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
 Target: <strong>{selectedConnectionIds.length > 0 ? `${selectedConnectionIds.length} selected connection(s)` : `All ${connectionPagination.total || connections.length} connections for ${providerId}`}</strong>
 </div>
 <div className="rounded-sm border border-border bg-bg p-3">
 <label className="mb-2 block text-xs font-medium text-text-muted">Rotation Strategy</label>
 <select value={bulkProxyRotationStrategy} onChange={(e) => setBulkProxyRotationStrategy(e.target.value)}
 className="w-full rounded-sm border border-border bg-bg px-2 py-2 min-h-11 text-sm text-text-main focus:border-primary focus:outline-none sm:min-h-9"
 disabled={bulkUpdatingProxy}>
 <option value="none">None (Single Proxy)</option>
 <option value="random">Random</option>
 <option value="round-robin">Round Robin</option>
 <option value="failover">Failover</option>
 <option value="smart">Smart</option>
 </select>
 {bulkProxyRotationStrategy !== "none" && (
 <p className="mt-1 text-[11px] text-text-muted">All active proxy pools will be assigned to each connection using this strategy.</p>
 )}
 </div>
 <div className="flex flex-col">
 <button onClick={handleApplyOneToOne} disabled={bulkUpdatingProxy || activePools.length === 0}
 className="flex items-center gap-2 rounded-sm px-3 min-h-11 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:min-h-0">
 <Icon className="text-text-muted" name="sync_alt" size={18} />
 <span className="text-sm text-text-main">One-to-one (rotate)</span>
 </button>
 <button onClick={handleApplyRotationStrategy} disabled={bulkUpdatingProxy || bulkProxyRotationStrategy === "none" || activePools.length === 0}
 className="flex items-center gap-2 rounded-sm px-3 min-h-11 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:min-h-0">
 <Icon className="text-text-muted" name="sync" size={18} />
 <span className="text-sm text-text-main">Apply Rotation Strategy</span>
 </button>
 <button onClick={() => handleApplySinglePool(null)} disabled={bulkUpdatingProxy}
 className="flex items-center gap-2 rounded-sm px-3 min-h-11 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:min-h-0">
 <Icon className="text-text-muted" name="link_off" size={18} />
 <span className="text-sm text-text-main">None (unbind all)</span>
 </button>
 {(() => {
 const defaultList = proxyGroups?.defaultGroups || [
 { id: "default-cloudflare", key: "cloudflare", name: "Cloudflare Relay", type: "cloudflare" },
 { id: "default-http", key: "http", name: "HTTP", type: "http" },
 { id: "default-vercel", key: "vercel", name: "Vercel", type: "vercel" },
 { id: "default-deno", key: "deno", name: "Deno", type: "deno" },
 ];
 const customList = proxyGroups?.customGroups || [];
 const grpSet = new Set();
 (proxyPools || []).forEach(p => { if (p.group?.trim()) grpSet.add(p.group.trim()); });
 const legacyGroups = [...grpSet].filter(
 (lg) => !customList.some((cg) => cg.name.toLowerCase() === lg.toLowerCase())
 ).sort();
 return (
 <div className="my-1 border-y border-border py-1 flex flex-col gap-1">
 <p className="px-3 py-1 text-[11px] font-medium text-text-muted">Default Groups (Auto Round-Robin)</p>
 {defaultList.map(def => {
 const cnt = (proxyPools || []).filter(p => p.type === def.type && p.isActive).length;
 return (
 <button key={def.id} onClick={() => handleApplyGroup(def.key)} disabled={bulkUpdatingProxy}
 className="flex w-full items-center gap-2 rounded-sm px-3 min-h-11 text-left hover:bg-primary/10 text-primary sm:h-8 sm:min-h-0">
 <Icon name="auto_awesome" size={18} />
 <span className="truncate text-sm font-medium">{def.name}</span>
 <span className="ml-auto text-xs opacity-75 font-mono">({cnt} active)</span>
 </button>
 );
 })}
 {customList.length > 0 && (
 <>
 <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-text-muted">Custom Groups</p>
 {customList.map(cg => {
 const poolCount = (cg.poolIds || []).length;
 const stickyLabel = cg.isSticky ? `Sticky ${cg.stickyLimit || 3}x` : "Round Robin";
 return (
 <button key={cg.id} onClick={() => handleApplyGroup(cg.name)} disabled={bulkUpdatingProxy}
 className="flex w-full items-center gap-2 rounded-sm px-3 min-h-11 text-left hover:bg-primary/10 text-primary sm:h-8 sm:min-h-0">
 <Icon name="folder_special" size={18} />
 <span className="truncate text-sm font-medium">{cg.name}</span>
 <span className="ml-auto text-xs opacity-75 font-mono">({poolCount} pools, {stickyLabel})</span>
 </button>
 );
 })}
 </>
 )}
 {legacyGroups.length > 0 && (
 <>
 <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-text-muted">Tagged Groups</p>
 {legacyGroups.map(grp => {
 const cnt = (proxyPools || []).filter(p => p.group && p.group.toLowerCase() === grp.toLowerCase()).length;
 return (
 <button key={grp} onClick={() => handleApplyGroup(grp)} disabled={bulkUpdatingProxy}
 className="flex w-full items-center gap-2 rounded-sm px-3 min-h-11 text-left hover:bg-surface-2 text-text-muted sm:h-8 sm:min-h-0">
 <Icon name="label" size={18} />
 <span className="truncate text-sm font-medium">{grp}</span>
 <span className="ml-auto text-xs opacity-75 font-mono">({cnt} pools)</span>
 </button>
 );
 })}
 </>
 )}
 </div>
 );
 })()}
 {proxyPools.map((pool) => (
 <button key={pool.id} onClick={() => handleApplySinglePool(pool.id)}
 disabled={bulkUpdatingProxy || pool.isActive !== true}
 className="flex items-center gap-2 rounded-sm px-3 min-h-11 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:min-h-0">
 <Icon className="text-text-muted" name="lan" size={18} />
 <span className="truncate text-sm text-text-main">{pool.name}</span>
 {pool.isActive !== true && <span className="text-[11px] text-text-muted">(inactive)</span>}
 </button>
 ))}
 </div>
 {bulkUpdatingProxy && <p className="text-xs text-text-muted">Applying...</p>}
 <Button onClick={closeBulkProxyModal} variant="ghost" fullWidth disabled={bulkUpdatingProxy}>Cancel</Button>
 </div>
 </Modal>
 </>
 );
}
