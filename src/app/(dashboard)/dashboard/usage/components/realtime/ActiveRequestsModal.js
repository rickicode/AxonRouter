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
      className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
      title={isStream ? "Streaming response" : "Non-streaming JSON response"}
    >
      <Icon name={meta.icon} size={12} />
      {meta.label}
    </span>
  );
}

/** A labelled value. Wraps rather than truncates — a clipped value reads as missing. */
function Field({ icon, label, value, title, mono = false, tone = "" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-muted">
        <Icon className="shrink-0" name={icon} size={11} />
        {label}
      </span>
      <span
        className={`min-w-0 break-words text-xs ${mono ? "font-mono" : ""} ${tone || "text-text-main"}`}
        title={title}
      >
        {value}
      </span>
    </div>
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
      className="sm:max-w-[900px]"
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
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Active in-flight requests">
            {activeRequests.map((req, idx) => {
              const apiKey = req.clientApiKey || req.apiKey || "Default";
              // A keyless provider's account is a placeholder; the egress pool is what
              // actually identifies the request, so that is what the card leads with.
              const accountIsProxy = req.accountIsProxy === true;
              const accountLabel = accountIsProxy ? "Proxy" : "Account";
              return (
                <li
                  key={req.id || req.requestId || idx}
                  className="flex min-w-0 flex-col gap-2 rounded-sm border border-border bg-surface-2/30 p-2.5 transition-colors hover:bg-surface-2/50"
                >
                  {/* Model + mode + elapsed: the identity of the request. */}
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Field
                        icon="memory"
                        label="Model"
                        value={req.model || "—"}
                        title={req.model}
                        mono
                      />
                      <div>
                        <ModeBadge isStream={req.isStream} />
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-text-muted tabular-nums">
                      <TimeAgo timestamp={req.startedAt} />
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-t border-border/60 pt-2">
                    <Field icon="hub" label="Provider" value={req.provider || "—"} />
                    <Field
                      icon={accountIsProxy ? "lan" : "account_circle"}
                      label={accountLabel}
                      value={req.account || "—"}
                      title={req.account}
                    />
                    <Field
                      icon="key"
                      label="API Key"
                      value={apiKey}
                      title={apiKey}
                      mono
                      tone="text-text-muted"
                    />
                    {/* Only meaningful once the request is known to be proxied; the
                        account field above already shows it in that case. */}
                    {!accountIsProxy && req.proxyLabel ? (
                      <Field
                        icon="lan"
                        label="Proxy"
                        value={req.proxyLabel}
                        title={req.proxyLabel}
                        mono
                        tone="text-text-muted"
                      />
                    ) : (
                      <Field
                        icon="bolt"
                        label="Mode"
                        value={req.isStream ? "Streaming" : "Non-streaming"}
                      />
                    )}
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
