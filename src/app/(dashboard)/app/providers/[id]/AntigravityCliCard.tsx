"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { translate } from "@/i18n/runtime";
import { fetchJson, queryKeys, useInvalidate } from "@/shared/query";

interface AutoSwitchSettings {
  enabled: boolean;
  activeConnectionId: string | null;
  lastRotatedAt?: string | null;
  lastRotatedFrom?: string | null;
  lastRotatedTo?: string | null;
}

interface ActiveAccountInfo {
  connectionId: string | null;
  connectionName: string | null;
  email: string | null;
  projectId: string | null;
}

function formatRotationTime(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export default function AntigravityCliCard() {
  const inv = useInvalidate();

  const settingsQuery = useQuery({
    queryKey: queryKeys.providerAutoSwitch("antigravity"),
    queryFn: ({ signal }) => fetchJson<AutoSwitchSettings>("/api/providers/antigravity/auto-switch", { signal }),
  });

  const activeAccountQuery = useQuery({
    queryKey: queryKeys.providerAutoSwitchActive("antigravity"),
    queryFn: ({ signal }) => fetchJson<ActiveAccountInfo>("/api/providers/antigravity/auto-switch/active", { signal }),
  });

  const providersQuery = useQuery({
    queryKey: queryKeys.providers(),
    queryFn: ({ signal }) => fetchJson<{ connections: any[] }>("/api/providers", { signal }),
  });

  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const updateSettingsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/providers/antigravity/auto-switch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: (data, enabled) => {
      inv.providerAutoSwitch("antigravity");
      setInfo(enabled
        ? "Auto-switch enabled. Antigravity CLI account will rotate automatically."
        : "Auto-switch disabled.");
      setError("");
    },
    onError: (err: any) => {
      setError(err.message || "Failed to update");
      setInfo("");
    }
  });

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/providers/antigravity/auto-switch/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Rotation failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      inv.providerAutoSwitch("antigravity");
      if (data.rotated) {
        setInfo(`Rotated to next account: ${data.newAccountName || data.newConnectionId?.slice(0, 8) || "unknown"}`);
      } else {
        setInfo(data.message || "No rotation needed or no other account available");
      }
      setError("");
    },
    onError: (err: any) => {
      setError(err.message || "Failed to rotate");
      setInfo("");
    }
  });

  const clearActiveAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/providers/antigravity/auto-switch/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: null }),
      });
      if (!res.ok) throw new Error("Failed to clear active account");
    },
    onSuccess: () => {
      inv.providerAutoSwitch("antigravity");
      setInfo("Active account cleared. No account will be written to the CLI token file.");
      setError("");
    }
  });

  const switchAccountMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch("/api/providers/antigravity/auto-switch/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to switch account");
      }
      return res.json();
    },
    onSuccess: () => {
      setSwitchingTo(null);
      inv.providerAutoSwitch("antigravity");
      setInfo("Switched to selected Antigravity account. Token file updated.");
      setError("");
    },
    onError: (err: any) => {
      setError(err.message || "Failed to switch");
      setInfo("");
    }
  });

  const loading = settingsQuery.isPending || activeAccountQuery.isPending;
  const settings = settingsQuery.data || { enabled: false, activeConnectionId: null };
  const activeAccount = activeAccountQuery.data || null;
  const agConnections = (providersQuery.data?.connections || []).filter((c: any) => c.provider === "antigravity");
  const saving = updateSettingsMutation.isPending || rotateMutation.isPending || switchAccountMutation.isPending || clearActiveAccountMutation.isPending;

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="py-6 text-sm text-muted-foreground">
            <Spinner className="size-4 inline-block mr-2" />
            Loading Antigravity CLI settings…
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>{translate("Antigravity CLI")}</CardTitle>
            <CardDescription>
              {translate("Manage which Antigravity account the CLI uses. Updates")}{" "}
              <code className="font-mono">~/.gemini/antigravity-cli/antigravity-oauth-token</code>
              {" "}{translate("so the CLI authenticates as the selected account.")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-muted-foreground">
              {settings.enabled ? "Enabled" : "Disabled"}
            </span>
            <Switch
              checked={settings.enabled}
              onToggle={(v) => updateSettingsMutation.mutate(v)}
              disabled={saving}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-xs text-red-500 break-words">{error}</p>
        )}
        {info && !error && (
          <p className="text-xs text-emerald-500 break-words">{info}</p>
        )}

        {/* Active account info */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{translate("Active Account")}</h4>
            <Badge variant={settings.enabled ? "default" : "secondary"}>
              {settings.enabled ? "Auto-switch ON" : "Auto-switch OFF"}
            </Badge>
          </div>

          {activeAccount ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {activeAccount.connectionName || activeAccount.email || activeAccount.connectionId?.slice(0, 12) || "Unknown"}
                </span>
                {activeAccount.projectId && (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-mono">
                    {activeAccount.projectId}
                  </Badge>
                )}
              </div>
              {activeAccount.email && (
                <p className="text-xs">{activeAccount.email}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {settings.enabled
                ? "No active account set. Auto-switch will pick the first healthy account."
                : "No active account selected."}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => rotateMutation.mutate()}
              disabled={saving || !settings.enabled}
            >
              {rotateMutation.isPending ? <Spinner className="size-3 mr-1" /> : null}
              {rotateMutation.isPending ? "Rotating…" : "Rotate Now"}
            </Button>
            {activeAccount?.connectionId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => clearActiveAccountMutation.mutate()}
                disabled={saving}
              >
                Clear
              </Button>
            )}
          </div>

          {/* Manual account picker */}
          {agConnections.length > 1 && (
            <div className="pt-2 border-t border-border/60">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                {translate("Switch to account")}
              </label>
              <div className="flex items-center gap-2">
                <Select
                  value={switchingTo || ""}
                  onValueChange={(value) => setSwitchingTo(value)}
                  disabled={saving}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select an account…" />
                  </SelectTrigger>
                  <SelectContent>
                    {agConnections.map((conn: any) => {
                      const isActive = conn.id === activeAccount?.connectionId;
                      const label = conn.name || conn.email || conn.displayName || conn.id?.slice(0, 12) || "Unknown";
                      return (
                        <SelectItem key={conn.id} value={conn.id}>
                          <span className="flex items-center gap-2">
                            <span className="truncate max-w-[200px]">{label}</span>
                            {isActive && (
                              <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 leading-none">
                                Active
                              </Badge>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => switchingTo && switchAccountMutation.mutate(switchingTo)}
                  disabled={saving || !switchingTo || switchingTo === activeAccount?.connectionId}
                  className="shrink-0 h-8 text-xs"
                >
                  {switchAccountMutation.isPending ? <Spinner className="size-3" /> : "Switch"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Last rotation event */}
        {settings.lastRotatedAt && (
          <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Last rotation:</span>{" "}
            {formatRotationTime(settings.lastRotatedAt)}
            {settings.lastRotatedFrom && settings.lastRotatedTo && (
              <span className="block text-[10px] text-muted-foreground/60">
                {settings.lastRotatedFrom.slice(0, 8)} → {settings.lastRotatedTo.slice(0, 8)}
              </span>
            )}
          </div>
        )}

        <div className="rounded-md border border-border p-3 text-xs text-muted-foreground bg-muted/30">
          <p className="font-medium text-foreground mb-1">{translate("How it works")}</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>{translate("Switching accounts updates")} <code className="font-mono">~/.gemini/antigravity-cli/antigravity-oauth-token</code> {translate("with the selected account's OAuth tokens.")}</li>
            <li>{translate("The Antigravity CLI will then authenticate as that Google account.")}</li>
            <li>{translate("Enable auto-switch to automatically rotate when the current account is exhausted.")}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
