"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState, useEffect, useCallback } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

const DEFAULT_MITM_ROUTER_BASE = DEFAULT_AXONROUTER_BASE_URL;

/**
 * Shared MITM infrastructure card — manages SSL cert + server start/stop.
 * DNS per-tool is handled separately in MitmToolCard.
 */
export default function MitmServerCard({ apiKeys, onStatusChange }) {
  const inv = useInvalidate();
  const [status, setStatus] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [mitmRouterBaseUrl, setMitmRouterBaseUrl] = useState(DEFAULT_MITM_ROUTER_BASE);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);

  const requiresSudo = status?.requiresSudo !== false;
  const isWindows = status?.serverPlatform === "win32" || (!requiresSudo && typeof navigator !== "undefined" && navigator.userAgent?.includes("Windows"));
  const isAdmin = status?.isAdmin !== false;
  const effectiveSelectedApiKey = selectedApiKey || (apiKeys?.length > 0 ? apiKeys[0].key : "");

  const applyFetchedStatus = useCallback((data) => {
    setStatus(data);
    if (data?.mitmRouterBaseUrl) {
      setMitmRouterBaseUrl(data.mitmRouterBaseUrl);
    }
    onStatusChange?.(data);
  }, [onStatusChange]);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm");
      if (res.ok) {
        const data = await res.json();
        applyFetchedStatus(data);
      }
    } catch {
      applyFetchedStatus({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/cli-tools/antigravity-mitm");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) applyFetchedStatus(data);
        }
      } catch {
        if (!cancelled) {
          applyFetchedStatus({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFetchedStatus]);

  const handleAction = (action) => {
    setActionError(null);
    if (!requiresSudo || isWindows || status?.hasCachedPassword) {
      doAction(action, "");
    } else {
      setPendingAction(action);
      setShowPasswordModal(true);
      setModalError(null);
    }
  };

  const actionMutation = useMutation({
    retry: false,
    mutationFn: async ({ action, password }: { action: string; password: string }) => {
      let res: Response;
      if (action === "trust-cert") {
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trust-cert", sudoPassword: password }),
        });
      } else if (action === "start") {
        const keyToUse = effectiveSelectedApiKey?.trim()
          || "sk_axonrouter";
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: keyToUse,
            sudoPassword: password,
            mitmRouterBaseUrl: mitmRouterBaseUrl.trim() || DEFAULT_MITM_ROUTER_BASE,
            autoStartEnabled,
          }),
        });
      } else {
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sudoPassword: password }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} MITM server`);
      }
      return res.json();
    },
    onSuccess: () => {
      inv.cliTools();
      setShowPasswordModal(false);
      setSudoPassword("");
      fetchStatus();
    },
    onError: (error: Error) => {
      setActionError(error.message);
    },
    onSettled: () => {
      setPendingAction(null);
    },
  });

  const doAction = (action: string, password: string) => {
    setActionError(null);
    actionMutation.mutate({ action, password });
  };

  const handleConfirmPassword = () => {
    if (!sudoPassword.trim()) {
      setModalError("Sudo password is required");
      return;
    }
    doAction(pendingAction, sudoPassword);
  };

  const isRunning = status?.running;

  return (
    <>
      <Card className="border-primary/20 bg-primary/5">
        <CardContent>
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AppIcon name="security" size={20} className="text-primary" />
              <span className="font-semibold text-sm text-text-main">MITM Server</span>
              {isRunning ? (
                <Badge variant="default">Running</Badge>
              ) : (
                <Badge variant="default">Stopped</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-text-muted" data-i18n-skip="true">
              {[
                { label: "Cert", ok: status?.certExists },
                { label: "Trusted", ok: status?.certTrusted },
                { label: "Server", ok: isRunning },
              ].map(({ label, ok }) => (
                <span key={label} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${ok ? "text-green-600" : "text-text-muted"}`}>
                  <AppIcon name={ok ? "check_circle" : "cancel"} size={12} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Purpose & How it works */}
          <div className="px-2 py-2 rounded-lg bg-surface/50 border border-border/50 flex flex-col gap-2">
            <p className="text-[11px] text-text-muted leading-relaxed">
              <span className="font-medium text-text-main">Purpose:</span> Use Antigravity IDE & GitHub Copilot → with ANY provider/model from AxonRouter
            </p>
            <p className="text-[11px] text-text-muted leading-relaxed">
              <span className="font-medium text-text-main">How it works:</span> Antigravity/Copilot IDE request → DNS redirect to localhost:443 → MITM proxy intercepts → AxonRouter → response to Antigravity/Copilot
            </p>
          </div>

          {/* Base URL + API Key — same row pattern as Claude Code / cli-tools */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">AxonRouter Base URL</span>
              <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
              <input
                type="text"
                value={mitmRouterBaseUrl}
                onChange={(e) => setMitmRouterBaseUrl(e.target.value)}
                placeholder={DEFAULT_MITM_ROUTER_BASE}
                disabled={isRunning}
                className="flex-1 min-w-0 px-2 py-1.5 bg-surface rounded border border-border text-xs text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              />
            </div>
            {!isRunning && (
              <div className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">API Key</span>
                <AppIcon name="arrow_forward" size={14} className="text-text-muted" />
                {apiKeys?.length > 0 ? (
                  <select
                    value={effectiveSelectedApiKey}
                    onChange={(e) => setSelectedApiKey(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-surface rounded text-xs border border-border text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    {apiKeys.map((key) => (
                      <option key={key.id} value={key.key}>
                        {key.key}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="flex-1 px-2 py-1.5 text-xs text-text-muted">
                    {"sk_axonrouter (default)"}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="rounded border border-border/60 bg-surface/40 px-3 py-2 text-[11px] leading-relaxed text-text-muted">
            MITM server will not auto-start by default. Use the Start Server button manually, or enable the auto-start option below for future integration-driven startup behavior.
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3" data-i18n-skip="true">
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface/60 px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-text-main">Auto-start MITM server</span>
                <span className="text-[11px] text-text-muted">Keep disabled unless you want future integrations to start the server automatically.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoStartEnabled}
                onClick={() => setAutoStartEnabled((value) => !value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${autoStartEnabled ? "border-primary bg-primary/80" : "border-border bg-bg-subtle"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoStartEnabled ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            {status?.certExists && !status?.certTrusted && (
              <button
                onClick={() => handleAction("trust-cert")}
                disabled={actionMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 font-medium text-xs flex items-center gap-1.5 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
              >
                <AppIcon name="verified_user" size={16} />
                Trust Cert
              </button>
            )}
            {isRunning ? (
              <button
                onClick={() => handleAction("stop")}
                disabled={actionMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 font-medium text-xs flex items-center gap-1.5 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <AppIcon name="stop_circle" size={16} />
                Stop Server
              </button>
            ) : (
              <button
                onClick={() => handleAction("start")}
                disabled={actionMutation.isPending || (isWindows && !isAdmin)}
                className="px-4 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary font-medium text-xs flex items-center gap-1.5 hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <AppIcon name="play_circle" size={16} />
                Start Server
              </button>
            )}
              {isRunning && (
                <p className="text-xs text-text-muted">Enable DNS per tool below to activate interception</p>
              )}
            </div>
          </div>

          {/* Action error */}
          {actionError && (
            <div className="flex items-start gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
              <CircleAlert className="mt-0.5 h-[14px] w-[14px] shrink-0" strokeWidth={2} />
              <span>{actionError}</span>
            </div>
          )}

          {/* Windows admin warning */}
          {isWindows && !isAdmin && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600 border border-red-500/20">
              <AppIcon name="shield_lock" size={14} />
              <span>Administrator required — restart AxonRouter as Administrator to use MITM</span>
            </div>
          )}
        </div>
        </CardContent>
      </Card>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-xl">
            <h3 className="font-semibold text-text-main">Sudo Password Required</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <TriangleAlert className="h-5 w-5 text-yellow-500" strokeWidth={2} />
              <p className="text-xs text-text-muted">Required on macOS/Linux for SSL certificate and server startup</p>
            </div>
            <Input
              type="password"
              placeholder="Enter sudo password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !actionMutation.isPending) handleConfirmPassword(); }}
            />
            {modalError && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600">
                <CircleAlert className="h-[14px] w-[14px]" strokeWidth={2} />
                <span>{modalError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setModalError(null); }} disabled={actionMutation.isPending}>
                Cancel
              </Button>
              <Button variant="default" onClick={handleConfirmPassword} disabled={actionMutation.isPending}>
                {actionMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
