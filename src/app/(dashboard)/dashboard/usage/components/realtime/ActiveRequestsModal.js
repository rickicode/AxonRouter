"use client";

import Modal from "@/shared/components/Modal";
import Badge from "@/shared/components/Badge";
import { TimeAgo } from "./realtimeHelpers";
import Icon from "@/shared/components/Icon";

export default function ActiveRequestsModal({ isOpen, onClose, activeRequests = [] }) {
 return (
 <Modal
 isOpen={isOpen}
 onClose={onClose}
 title={null}
 size="full"
 showTrafficLights={true}
 className="sm:max-w-[760px]"
 >
 <div className="flex flex-col gap-3">
 {/* Header inside modal */}
 <div className="flex items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <span className="relative flex h-3 w-3">
 <span className="absolute inline-flex h-full w-full rounded-sm bg-primary animate-ping opacity-60"></span>
 <span className="relative inline-flex rounded-sm h-3 w-3 bg-primary"></span>
 </span>
 <h3 className="text-sm font-semibold text-text-main">
 Active In-Flight Requests
 </h3>
 <span className="inline-flex items-center justify-center min-w-8 h-5 px-2 rounded-sm bg-primary/10 text-primary text-xs font-medium tabular-nums">
 {activeRequests.length}
 </span>
 </div>
 <span className="text-[11px] text-text-muted flex items-center gap-1">
 <Icon name="schedule" size={18} />
 Live — auto-refresh
 </span>
 </div>

 {/* Empty state */}
 {activeRequests.length === 0 ? (
 <div className="flex flex-col items-center justify-center p-3 rounded-sm border border-dashed border-border gap-2">
 <Icon className="text-text-muted/50" name="cloud_done" size={18} />
 <span className="text-sm text-text-muted">No active in-flight requests</span>
 </div>
 ) : (
 /* Table layout */
 <div className="rounded-sm border border-border overflow-hidden">
 <table className="w-full text-xs" aria-label="Active in-flight requests">
 <thead>
 <tr className="bg-surface-2/60 text-text-muted font-medium text-[11px]">
 <th scope="col" className="text-left px-3 h-8 text-xs font-medium text-text-muted">Status</th>
 <th scope="col" className="text-left px-3 h-8 text-xs font-medium text-text-muted">Model</th>
 <th scope="col" className="text-left px-3 h-8 text-xs font-medium text-text-muted">Provider</th>
 <th scope="col" className="text-left px-3 h-8 text-xs font-medium text-text-muted">Account</th>
 <th scope="col" className="text-left px-3 h-8 text-xs font-medium text-text-muted">API Key</th>
 <th scope="col" className="text-right px-3 h-8 text-xs font-medium text-text-muted">Elapsed</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border/40">
 {activeRequests.map((req, idx) => (
 <tr
 key={req.id || idx}
 className="hover:bg-surface-2/40"
 >
 <td className="px-3 h-8 text-sm">
 <span className="inline-flex items-center gap-1 rounded-sm bg-primary/10 text-primary px-2 py-1 text-[11px] font-medium animate-pulse">
<Icon name={req.isStream ? "wifi_tethering" : "code"} size={18} />
 {req.isStream ? "STREAM" : "JSON"}
 </span>
 </td>
 <td className="px-3 h-8 font-mono font-medium text-text-main truncate max-w-[220px] text-sm" title={req.model}>
 {req.model}
 </td>
 <td className="px-3 h-8 text-sm">
 <Badge variant="neutral" size="sm">{req.provider}</Badge>
 </td>
 <td className="px-3 h-8 text-text-main truncate max-w-[180px] text-sm" title={req.account || "Direct request"}>
 <span className="inline-flex items-center gap-1">
 <Icon className="text-text-muted" name="account_circle" size={18} />
 {req.account || "Direct request"}
 </span>
 </td>
 <td className="px-3 h-8 truncate max-w-[150px] text-sm" title={req.clientApiKey || req.apiKey || "Default Key"}>
 <span className="inline-flex items-center gap-1 font-mono text-text-muted">
 <Icon name="key" size={18} />
 {req.clientApiKey || req.apiKey || "Default"}
 </span>
 </td>
 <td className="px-3 h-8 text-right font-mono text-text-muted tabular-nums text-sm">
 <TimeAgo timestamp={req.startedAt} />
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}

 {/* Footer hint */}
 <div className="flex items-center gap-2 text-[11px] text-text-muted pt-1 border-t border-border h-8">
 <Icon name="info" size={18} />
 <span>Live updates active. Close modal to pause polling.</span>
 </div>
 </div>
 </Modal>
 );
}
