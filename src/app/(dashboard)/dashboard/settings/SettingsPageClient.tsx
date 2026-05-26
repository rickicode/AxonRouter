"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import ProfileSettingsContent from "@/shared/components/settings/ProfileSettingsContent";
import { fetchJson, queryKeys, useInvalidate } from "@/shared/query";

const STATUS_TONE_CLASSNAMES = {
  idle: "border-[var(--color-border)] bg-[var(--color-bg-alt)] text-[var(--color-text-muted)]",
  ready: "border-[var(--color-border)] bg-[var(--color-bg-alt)] text-[var(--color-text-main)]",
  pending: "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-text-main)]",
  success: "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-text-main)]",
  error: "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-text-main)]",
};

function formatRelativeTimestamp(value, fallback) {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
}

function modelSyncMinutesToDays(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return 2;
  return Math.max(1, Math.round(minutes / 1440));
}

function modelSyncDaysToMinutes(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return 2880;
  return Math.max(1, Math.round(days)) * 1440;
}

function formatModelSyncCadence(value) {
  const days = modelSyncMinutesToDays(value);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function getModelSyncScheduleLabel(modelSyncState) {
  if (modelSyncState?.scheduler?.running) return "Sync in progress";
  if (modelSyncState?.settings?.enabled !== true) return "Automatic sync disabled";
  if (modelSyncState?.scheduler?.nextRunAt) return "Scheduled";
  return "Scheduler not armed";
}

function getModelSyncScheduleTone(modelSyncState) {
  if (modelSyncState?.scheduler?.running) return "pending";
  if (modelSyncState?.settings?.enabled !== true) return "idle";
  if (modelSyncState?.scheduler?.nextRunAt) return "success";
  return "error";
}

function getModelSyncLastStatusTone(status) {
  if (status === "success") return "success";
  if (status === "partial") return "pending";
  if (status === "error") return "error";
  return "idle";
}


export default function SettingsPageClient() {
  const inv = useInvalidate();
  const [routingProfile, setRoutingProfile] = useState("balanced");
  const [routingProfilePreview, setRoutingProfilePreview] = useState(null);
  const [savingRoutingProfile, setSavingRoutingProfile] = useState(false);
  const [modelSyncState, setModelSyncState] = useState(null);
  const [loadingModelSync, setLoadingModelSync] = useState(true);
  const [savingModelSync, setSavingModelSync] = useState(false);
  const [runningModelSync, setRunningModelSync] = useState(false);
  const [modelSyncFeedback, setModelSyncFeedback] = useState({ type: "", message: "" });
  const [otelSettings, setOtelSettings] = useState({ enabled: false, jaegerOtlpHttpEndpoint: "" });
  const [savingOtel, setSavingOtel] = useState(false);
  const [otelFeedback, setOtelFeedback] = useState({ type: "", message: "" });
  const modelSyncQuery = useQuery({
    queryKey: queryKeys.modelSync(),
    queryFn: ({ signal }) => fetchJson("/api/model-sync", { signal }),
  });
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: ({ signal }) => fetchJson("/api/settings", { signal }),
  });
  const routingProfilePreviewQuery = useQuery({
    queryKey: queryKeys.routingProfilePreview(routingProfile),
    queryFn: ({ signal }) => fetchJson(`/api/routing/profile-preview?profile=${encodeURIComponent(routingProfile)}`, { signal, cache: "no-store" }),
    enabled: !settingsQuery.isPending,
  });

  useEffect(() => {
    const settings: any = settingsQuery.data;
    if (!settings) return;
    const otel = settings?.observability?.otel || {};
    queueMicrotask(() => {
      setOtelSettings({
        enabled: otel?.enabled === true,
        jaegerOtlpHttpEndpoint: typeof otel?.jaegerOtlpHttpEndpoint === "string" ? otel.jaegerOtlpHttpEndpoint : "",
      });
      setRoutingProfile(settings.routingProfile || settings.routing?.profile || "balanced");
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!modelSyncQuery.data) return;
    queueMicrotask(() => setModelSyncState(modelSyncQuery.data));
  }, [modelSyncQuery.data]);

  useEffect(() => {
    const data: any = routingProfilePreviewQuery.data;
    queueMicrotask(() => setRoutingProfilePreview(data?.preset || null));
  }, [routingProfilePreviewQuery.data]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoadingModelSync(modelSyncQuery.isPending);
      if (modelSyncQuery.isError) {
        setModelSyncFeedback({ type: "error", message: modelSyncQuery.error?.message || "Failed to load model sync settings" });
      }
    });
  }, [modelSyncQuery.error, modelSyncQuery.isError, modelSyncQuery.isPending]);

  async function loadModelSyncSettings() {
    await modelSyncQuery.refetch();
  }

  const saveModelSyncMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await fetch("/api/model-sync", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelSync: modelSyncState.settings }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save model sync settings");
      return data;
    },
    onSuccess: (data) => {
      setModelSyncState((current) => ({ ...(current || {}), settings: data.settings }));
      setModelSyncFeedback({ type: "success", message: "Model sync settings saved." });
      inv.modelSync();
    },
    onError: (error: any) => {
      setModelSyncFeedback({ type: "error", message: error.message || "Failed to save model sync settings" });
    },
  });

  const handleSaveModelSyncSettings = () => {
    if (!modelSyncState?.settings) return;
    setSavingModelSync(true);
    setModelSyncFeedback({ type: "", message: "" });
    saveModelSyncMutation.mutate(undefined, { onSettled: () => setSavingModelSync(false) });
  };

  const runModelSyncMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await fetch("/api/model-sync", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to run model sync batch");
      return data;
    },
    onSuccess: (data) => {
      setModelSyncFeedback({ type: "success", message: data.message || "Model sync batch completed." });
      inv.modelSync(); inv.providerModels();
      loadModelSyncSettings();
    },
    onError: (error: any) => {
      setModelSyncFeedback({ type: "error", message: error.message || "Failed to run model sync batch" });
    },
  });

  const handleRunModelSyncNow = () => {
    setRunningModelSync(true);
    setModelSyncFeedback({ type: "", message: "" });
    runModelSyncMutation.mutate(undefined, { onSettled: () => setRunningModelSync(false) });
  };

  const saveSettingsMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routingProfile }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      inv.settings();
    },
  });

  const saveRoutingProfile = () => {
    setSavingRoutingProfile(true);
    saveSettingsMutation.mutate(undefined, { onSettled: () => setSavingRoutingProfile(false) });
  };

  async function handleSaveOtelSettings() {
    setSavingOtel(true);
    setOtelFeedback({ type: "", message: "" });
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observability: {
            otel: {
              enabled: otelSettings.enabled,
              jaegerOtlpHttpEndpoint: otelSettings.jaegerOtlpHttpEndpoint,
            },
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save telemetry settings");
      setOtelFeedback({ type: "success", message: "Telemetry settings saved." });
      inv.settings();
    } catch (error: any) {
      setOtelFeedback({ type: "error", message: error?.message || "Failed to save telemetry settings" });
    } finally {
      setSavingOtel(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
          <Card><CardHeader><div><CardTitle>Workspace Settings</CardTitle></div></CardHeader><CardContent>
            <div className="space-y-4">
            <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/72 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Routing Profile</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["economy", "Economy"],
                      ["balanced", "Balanced"],
                      ["premium", "Premium"],
                    ].map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={routingProfile === value ? "default" : "secondary"}
                        onClick={() => setRoutingProfile(value)}
                        className="rounded-sm"
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button size="sm" onClick={saveRoutingProfile} disabled={savingRoutingProfile}>
                  {savingRoutingProfile ? <Spinner data-icon="inline-start" /> : null}
                  {savingRoutingProfile ? "Saving" : "Save Profile"}
                </Button>
              </div>
              {routingProfilePreview && (
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Profile</p>
                    <p className="mt-2 font-semibold text-[var(--color-text-main)]">{routingProfilePreview.profile}</p>
                  </div>
                  <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Cost</p>
                    <p className="mt-2 font-semibold text-[var(--color-text-main)]">{routingProfilePreview.objectives?.cost}</p>
                  </div>
                  <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Latency</p>
                    <p className="mt-2 font-semibold text-[var(--color-text-main)]">{routingProfilePreview.objectives?.latency}</p>
                  </div>
                  <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Quality</p>
                    <p className="mt-2 font-semibold text-[var(--color-text-main)]">{routingProfilePreview.objectives?.quality}</p>
                  </div>
                </div>
              )}
              {routingProfilePreview?.tradeoff && (
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">{routingProfilePreview.tradeoff}</p>
              )}
              {Array.isArray(routingProfilePreview?.sampleRanking) && routingProfilePreview.sampleRanking.length > 0 && (
                <div className="mt-4 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Sample Ranking</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {routingProfilePreview.sampleRanking.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2">
                        <div>
                          <p className="font-medium text-[var(--color-text-main)]">{item.name}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{item.provider}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[var(--color-text-main)]">{Number(item.routingScore || 0).toFixed(3)}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">c {item.routingScoreBreakdown?.cost} / l {item.routingScoreBreakdown?.latency} / q {item.routingScoreBreakdown?.quality}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <ProfileSettingsContent />
            </div>
          </CardContent></Card>

          <Card><CardHeader><div><CardTitle>Telemetry (Jaeger)</CardTitle></div></CardHeader><CardContent>
            <div className="flex flex-col gap-4">
              {otelFeedback.message ? (
                <Alert
                  variant={otelFeedback.type === "error" ? "destructive" : "default"}
                  className="rounded-[4px]"
                >
                  <AlertDescription>{otelFeedback.message}</AlertDescription>
                </Alert>
              ) : null}

              <label className="flex gap-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4 text-sm text-[var(--color-text-main)]">
                <Switch
                  checked={otelSettings.enabled === true}
                  onToggle={(checked) => setOtelSettings((current) => ({ ...current, enabled: checked }))}
                  disabled={savingOtel || settingsQuery.isPending}
                />
                <span className="flex flex-col gap-1">
                  <span className="block font-medium">Enable OpenTelemetry export</span>
                </span>
              </label>

              <Input
                type="url"
                value={otelSettings.jaegerOtlpHttpEndpoint}
                onChange={(event) => setOtelSettings((current) => ({ ...current, jaegerOtlpHttpEndpoint: event.target.value }))}
                placeholder="http://localhost:4318/v1/traces"
                autoComplete="url"
                disabled={savingOtel || settingsQuery.isPending}
              />

              <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4 text-sm leading-6 text-[var(--color-text-muted)]">
                <p>Only Jaeger OTLP HTTP endpoint is required. Service name is fixed inline.</p>
                <p>If disabled or endpoint is empty, OpenTelemetry stays off.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveOtelSettings} disabled={savingOtel || settingsQuery.isPending}>
                  {savingOtel ? <Spinner data-icon="inline-start" /> : null}
                  {savingOtel ? "Saving" : "Save Telemetry Settings"}
                </Button>
              </div>
            </div>
          </CardContent></Card>

          <Card><CardHeader><div><CardTitle>Model Sync</CardTitle></div></CardHeader><CardContent>
            <div className="flex flex-col gap-4">
              {modelSyncFeedback.message ? (
                <Alert
                  variant={modelSyncFeedback.type === "error" ? "destructive" : "default"}
                  className="rounded-[4px]"
                >
                  <AlertDescription>{modelSyncFeedback.message}</AlertDescription>
                </Alert>
              ) : null}

              {loadingModelSync ? (
                <Skeleton className="h-44 w-full" />
              ) : modelSyncState?.settings ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className={`rounded-[4px] border p-4 ${STATUS_TONE_CLASSNAMES[getModelSyncScheduleTone(modelSyncState)]}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Schedule</p>
                      <p className="mt-3 text-lg font-semibold text-[var(--color-text-main)]">{getModelSyncScheduleLabel(modelSyncState)}</p>
                      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                        {modelSyncState.settings.enabled === true
                          ? `Repeats every ${formatModelSyncCadence(modelSyncState.settings.intervalMinutes)}.`
                          : "Enable automatic sync to keep provider model lists refreshed."}
                      </p>
                    </div>
                    <div className={`rounded-[4px] border p-4 ${STATUS_TONE_CLASSNAMES[getModelSyncLastStatusTone(modelSyncState.settings.lastRunStatus)]}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Last Batch</p>
                      <p className="mt-3 text-lg font-semibold text-[var(--color-text-main)]">{modelSyncState.settings.lastRunStatus || "idle"}</p>
                      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                        {formatRelativeTimestamp(modelSyncState.settings.lastRunAt, "Not recorded")}
                      </p>
                    </div>
                    <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">Eligible Connections</p>
                      <p className="mt-3 text-lg font-semibold text-[var(--color-text-main)]">
                        {Array.isArray(modelSyncState.eligibleConnections) ? modelSyncState.eligibleConnections.length : 0}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Connections currently included in the next automatic sync batch.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
                      <div className="flex flex-col gap-4">
                        <label className="flex gap-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text-main)]">
                          <Switch
                            checked={modelSyncState.settings.enabled === true}
                            onToggle={(checked) => setModelSyncState((current) => ({
                              ...(current || {}),
                              settings: {
                                ...(current?.settings || {}),
                                enabled: checked,
                              },
                            }))}
                            disabled={savingModelSync || runningModelSync}
                          />
                          <span className="flex flex-col gap-1">
                            <span className="block font-medium">Enable automatic model sync</span>
                            <span className="text-[var(--color-text-muted)]">AxonRouter will periodically refresh `/models` metadata for eligible provider connections.</span>
                          </span>
                        </label>

                        <Field>
                          <FieldLabel>Sync every N days</FieldLabel>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={modelSyncMinutesToDays(modelSyncState.settings.intervalMinutes)}
                            onChange={(event) => setModelSyncState((current) => ({
                              ...(current || {}),
                              settings: {
                                ...(current?.settings || {}),
                                intervalMinutes: modelSyncDaysToMinutes(event.target.value),
                              },
                            }))}
                            disabled={savingModelSync || runningModelSync}
                          />
                          <FieldDescription>
                            Stored internally in minutes for compatibility, but configured here in whole days.
                          </FieldDescription>
                        </Field>
                      </div>
                    </div>

                    <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4 text-sm leading-6 text-[var(--color-text-muted)]">
                      <p><span className="font-medium text-[var(--color-text-main)]">Next run:</span> {formatRelativeTimestamp(modelSyncState.scheduler?.nextRunAt, "Not scheduled")}</p>
                      <p><span className="font-medium text-[var(--color-text-main)]">Worker active:</span> {modelSyncState.scheduler?.running ? "yes" : "no"}</p>
                      {modelSyncState.settings.lastRunMessage ? (
                        <p><span className="font-medium text-[var(--color-text-main)]">Last message:</span> {modelSyncState.settings.lastRunMessage}</p>
                      ) : (
                        <p><span className="font-medium text-[var(--color-text-main)]">Last message:</span> No batch result recorded yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSaveModelSyncSettings} disabled={savingModelSync || runningModelSync}>
                      {savingModelSync ? <Spinner data-icon="inline-start" /> : null}
                      {savingModelSync ? "Saving" : "Save Model Sync Settings"}
                    </Button>
                    <Button variant="secondary" onClick={handleRunModelSyncNow} disabled={runningModelSync}>
                      {runningModelSync ? <Spinner data-icon="inline-start" /> : null}
                      {runningModelSync ? "Running" : "Run Sync Now"}
                    </Button>
                  </div>
                </>
              ) : (
                <Empty><EmptyHeader><EmptyMedia><AppIcon name="sync_problem" /></EmptyMedia><EmptyTitle>Model sync settings unavailable</EmptyTitle><EmptyDescription>AxonRouter could not load automatic /models sync settings for this runtime.</EmptyDescription></EmptyHeader></Empty>
              )}
            </div>
          </CardContent></Card>
    </div>
  );
}
