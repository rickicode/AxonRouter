"use client";

// Active in-flight requests.
//
// Was a six-column table with fixed max-widths inside an overflow-hidden box, which
// is unusable at 375px: the cells plus their padding exceed the viewport, so every
// long value (model ids, account emails, key names) hit its max-w and was clipped
// with no way to read it — and overflow-hidden meant there was not even a scrollbar
// to reach the rest.
//
// Now a responsive grid of cards: one column on a phone, two from `sm`, three from
// `lg`. Each cell carries a labelled field, so nothing has to be truncated to make
// the row fit, and the values wrap instead. Every field the API sends is shown —
// nothing is dropped to save width.
//
// The account field is the one that needed real work rather than layout. Keyless
// providers (opencode, beatapi, …) are served by a synthetic connection whose id is
// the literal "noauth", so the Account column used to read "noauth", which tells an
// operator nothing about where the request actually went. Those requests now carry
// the egress pool they went through, and the API resolves it to a readable label —
// so the cell shows the proxy and is labelled as such. A real account still wins
// when there is one, and the proxy is shown alongside it as an extra field rather
// than replacing anything.
import Modal from "@/shared/components/Modal";
import Badge from "@/shared/components/Badge";
import { TimeAgo, formatProviderModel } from "./realtimeHelpers";
import Icon from "@/shared/components/Icon";

const MODE_META = {
  STREAM: { icon: "wifi_tethering", label: "STREAM" },
  JSON: { icon: "code", label: "JSON" },
};

function ModeBadge({ isStream }) {
  const meta = isStream ? MODE_META.STREAM : MODE_META.JSON;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary"
      title={isStream ? "Streaming response" : "Non-streaming JSON response"}
    >
      <Icon name={meta.icon} size={11} />
      {meta.label}
    </span>
  );
}
export default function ActiveRequestsModal({
  isOpen,
  onClose,
  activeRequests = [],
  activeFeedStale = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={null}
      size="full"
      showTrafficLights={true}
      className="sm:max-w-[900px] xl:max-w-[1140px]"
    >
      <div className="flex flex-col gap-3">
        {/* Header inside modal */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* The ping is a claim that data is arriving. A pulsing dot next to a
                "reconnecting" banner is the UI arguing with itself, so it stops. */}
            <span className="relative flex h-3 w-3">
              {!activeFeedStale && (
                <span className="absolute inline-flex h-full w-full rounded-sm bg-primary animate-ping opacity-60"></span>
              )}
              <span
                className={`relative inline-flex rounded-sm h-3 w-3 ${
                  activeFeedStale ? "bg-warning" : "bg-primary"
                }`}
              ></span>
            </span>
            <h3 className="text-sm font-semibold text-text-main">
              Active In-Flight Requests
            </h3>
            <span className="inline-flex items-center justify-center min-w-8 h-5 px-2 rounded-sm bg-primary/10 text-primary text-xs font-medium tabular-nums">
              {activeRequests.length}
            </span>
          </div>
          <span
            className={`hidden sm:inline-flex text-[11px] items-center gap-1 ${
              activeFeedStale ? "text-warning" : "text-text-muted"
            }`}
          >
            <Icon name={activeFeedStale ? "cloud_off" : "schedule"} size={12} />
            {/* The list keeps its last known rows when the feed dies, so saying "Live"
                unconditionally would present stale data as current. */}
            {activeFeedStale ? "Reconnecting, list may be out of date" : "Live, auto-refresh"}
          </span>
        </div>

        {activeFeedStale && (
          <p className="rounded-sm border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
            Not refreshing. These are the last rows received, not necessarily what is in flight now.
          </p>
        )}

        {activeRequests.length === 0 ? (
          /* Two different empty states, because they mean different things. With a live
             feed, no rows means nothing is in flight. With a dead feed, no rows means we
             cannot see anything, which is not the same claim at all. */
          activeFeedStale ? (
            <div className="flex flex-col items-center justify-center gap-2 p-3 rounded-sm border border-dashed border-warning/40 bg-warning/5">
              <Icon className="text-warning/70" name="cloud_off" size={18} />
              <span className="text-sm text-warning">
                Cannot see in-flight requests while the feed is down
              </span>
              <span className="text-[11px] text-text-muted">
                This is not a report that nothing is running.
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-3 rounded-sm border border-dashed border-border gap-2">
              <Icon className="text-text-muted/50" name="cloud_done" size={18} />
              <span className="text-sm text-text-muted">No active in-flight requests</span>
            </div>
          )
        ) : (
          <div className="max-h-[72vh] overflow-y-auto pr-0.5">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Active in-flight requests">
              {activeRequests.map((req, idx) => {
                // A keyless provider's account is a placeholder; the egress pool is what
                // actually identifies the request, so that is what the card leads with.
                const accountIsProxy = req.accountIsProxy === true;
                const accountLabel = accountIsProxy ? "Proxy" : "Account";
                const { alias, cleanModel, full: modelDisplay } = formatProviderModel(req.provider, req.model);
                const missingAccount = req.account == null || req.account === "";
                return (
                  <li
                    key={req.id || req.requestId || idx}
                    className="flex min-w-0 flex-col justify-between gap-1.5 rounded-sm border border-border/80 bg-surface-2/30 p-2 transition-colors hover:bg-surface-2/50"
                  >
                    {/* Provider/Model with slash + Mode & Elapsed */}
                    <div className="flex items-start justify-between gap-1.5 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-text-muted">
                          <Icon className="shrink-0 text-text-muted/70" name="memory" size={10} />
                          <span>Model</span>
                        </div>
                        <div
                          className="truncate font-mono text-[11px] font-medium text-text-main mt-0.5"
                          title={`${req.provider ? `${req.provider} · ` : ""}${req.model || "not reported"}`}
                        >
                          {alias ? (
                            <span className="text-primary font-semibold">{alias}/</span>
                          ) : null}
                          <span className={cleanModel ? "" : "italic text-text-muted"}>
                            {cleanModel || "not reported"}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                        <ModeBadge isStream={req.isStream} />
                        <span className="font-mono text-[10px] text-text-muted tabular-nums">
                          <TimeAgo timestamp={req.startedAt} />
                        </span>
                      </div>
                    </div>

                    {/* Account / Proxy Egress info */}
                    <div className="flex items-center justify-between gap-1.5 border-t border-border/50 pt-1.5 text-[11px]">
                      <div className="flex min-w-0 flex-1 items-center gap-1" title={req.account}>
                        <Icon
                          className="shrink-0 text-text-muted/70"
                          name={accountIsProxy ? "lan" : "account_circle"}
                          size={11}
                        />
                        <span className="text-[9px] uppercase tracking-wider text-text-muted shrink-0">
                          {accountLabel}:
                        </span>
                        <span
                          className={`truncate text-[10.5px] ${
                            missingAccount ? "italic text-text-muted" : "text-text-main break-words"
                          }`}
                        >
                          {missingAccount ? "not reported" : req.account}
                        </span>
                      </div>
                      {!accountIsProxy && req.proxyLabel ? (
                        <div
                          className="flex shrink-0 items-center gap-1 text-[10px] text-text-muted font-mono"
                          title={req.proxyLabel}
                        >
                          <span className="text-[9px] uppercase tracking-wider text-text-muted">Proxy:</span>
                          <span className="truncate max-w-[110px] break-words">{req.proxyLabel}</span>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        </div>
    </Modal>
  );
}
