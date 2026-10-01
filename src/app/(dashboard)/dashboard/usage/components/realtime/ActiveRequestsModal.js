"use client";

// Active in-flight requests.
//
// This was a six-column table with fixed max-widths inside an overflow-hidden box.
// On a phone that is unusable: at 375px the six cells plus their padding exceed the
// viewport, every long value (model ids, account emails, key names) hit its
// max-w and got clipped with no way to read it — and overflow-hidden meant there
// was not even a scrollbar to reach the rest.
//
// Three columns instead, and the information that belongs together is stacked in
// one cell so nothing needs a column of its own:
//
//   Request   model id, with the STREAM/JSON mode as a badge beside it
//   Route     provider, then the account, then the API key
//   Elapsed   right-aligned on desktop, on the first row on mobile
//
// Below `sm` the rows become cards: the first line carries model + mode + elapsed,
// the second carries provider / account / key. Values wrap instead of truncating
// there, because a clipped value on a phone is the same as a missing one. From
// `sm` up it is a real three-column grid, and long values still truncate with a
// title tooltip because there the neighbouring columns are visible and the row
// height matters more.
import Modal from "@/shared/components/Modal";
import Badge from "@/shared/components/Badge";
import { TimeAgo } from "./realtimeHelpers";
import Icon from "@/shared/components/Icon";

const MODE_META = {
  STREAM: { icon: "wifi_tethering", label: "STREAM" },
  JSON: { icon: "code", label: "JSON" },
};

function ModeBadge({ isStream }) {
  const meta = isStream ? MODE_META.STREAM : MODE_META.JSON;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary animate-pulse"
      title={isStream ? "Streaming response" : "Non-streaming JSON response"}
    >
      <Icon name={meta.icon} size={12} />
      {meta.label}
    </span>
  );
}

function MetaLine({ icon, children, title }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-muted">
      <Icon className="shrink-0 text-text-muted" name={icon} size={12} />
      {/* break-all rather than truncate: on mobile this line wraps to a second row
          instead of hiding the value behind an ellipsis. */}
      <span className="min-w-0 break-all" title={title}>
        {children}
      </span>
    </span>
  );
}

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
          <span className="hidden sm:inline-flex text-[11px] text-text-muted items-center gap-1">
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
          <ul className="flex flex-col gap-1.5" aria-label="Active in-flight requests">
            {activeRequests.map((req, idx) => {
              const account = req.account || "Direct request";
              const apiKey = req.clientApiKey || req.apiKey || "Default";
              return (
                <li
                  key={req.id || idx}
                  className="rounded-sm border border-border bg-surface-2/30 px-2.5 py-2 hover:bg-surface-2/50 transition-colors"
                >
                  {/* Mobile: two lines. Desktop: the grid below takes over. */}
                  <div className="flex flex-col gap-1 sm:hidden">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <ModeBadge isStream={req.isStream} />
                        <span className="min-w-0 break-all font-mono text-xs font-medium text-text-main">
                          {req.model}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-text-muted tabular-nums">
                        <TimeAgo timestamp={req.startedAt} />
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5 pl-0.5">
                      <Badge variant="neutral" size="sm">{req.provider}</Badge>
                      <MetaLine icon="account_circle" title={account}>{account}</MetaLine>
                      <MetaLine icon="key" title={apiKey}>{apiKey}</MetaLine>
                    </div>
                  </div>

                  {/* Desktop: three columns */}
                  <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <ModeBadge isStream={req.isStream} />
                      <span
                        className="truncate font-mono text-xs font-medium text-text-main"
                        title={req.model}
                      >
                        {req.model}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Badge variant="neutral" size="sm">{req.provider}</Badge>
                      <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-muted">
                        <Icon className="shrink-0" name="account_circle" size={12} />
                        <span className="truncate" title={account}>{account}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-text-muted">
                        <Icon className="shrink-0" name="key" size={12} />
                        <span className="truncate" title={apiKey}>{apiKey}</span>
                      </span>
                    </div>
                    <div className="text-right font-mono text-[11px] text-text-muted tabular-nums">
                      <TimeAgo timestamp={req.startedAt} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
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
