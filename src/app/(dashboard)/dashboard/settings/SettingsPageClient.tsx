"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import ProfileSettingsContent from "@/shared/components/settings/ProfileSettingsContent";
import { fetchJson, queryKeys, useInvalidate } from "@/shared/query";
import {
  buildR2SettingsPayload,
  DEFAULT_R2_SETTINGS_RESPONSE,
  getDirtyR2Config,
  getNextR2Config,
  getR2ConnectionState,
  hasUnsavedR2Changes,
  isPrivateR2Configured,
  isPrivateR2Ready,
  normalizeR2SettingsResponse,
  sanitizeR2RuntimeCacheTtlSeconds,
} from "./r2SettingsUi";

const R2_FIELD_DEFINITIONS = [
  { key: "accountId", label: "Account ID", required: true, autoComplete: "off" },
  { key: "accessKeyId", label: "Access Key ID", required: true, autoComplete: "off" },
  {
    key: "secretAccessKey",
    label: "Secret Access Key",
    required: true,
    autoComplete: "off",
    type: "password",
  },
  { key: "bucket", label: "Bucket Name", required: true, autoComplete: "off" },
  { key: "endpoint", label: "Endpoint", required: true, autoComplete: "url" },
  { key: "region", label: "Region", required: true, autoComplete: "off" },
  { key: "publicUrl", label: "Public/Base URL", autoComplete: "url" },
];

const STATUS_TONE_CLASSNAMES = {
  idle: "border-[var(--color-border)] bg-[var(--color-bg-alt)] text-[var(--color-text-muted)]",
  ready: "border-[var(--color-border)] bg-[var(--color-bg-alt)] text-[var(--color-text-main)]",
  pending: "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-text-main)]",
  success: "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-text-main)]",
  error: "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-text-main)]",
};

const BACKUP_SCHEDULE_OPTIONS = ["daily", "weekly", "monthly"];

type GoRouterStatusResponse = {
  enabled?: boolean;
  host?: string;
  port?: number | string;
  [key: string]: unknown;
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

function formatArtifactState(label, artifact) {
  if (!artifact) return `${label} unavailable`;
  if (artifact.skipped) return `${label} skipped`;
  if (artifact.uploaded || artifact.ok) return `${label} uploaded`;
  return `${label} failed`;
}

function formatDirectBackupMessage(data: any = {}) {
  const parts = [
    formatArtifactState("backup", data.backup),
    formatArtifactState("runtime", data.runtime),
    formatArtifactState("SQLite", data.sqlite),
  ];

  return data.success
    ? `R2 publish complete: ${parts.join(", ")}.`
    : `R2 publish finished with issues: ${parts.join(", ")}.`;
}

function formatDirectR2Status(data: any = {}) {
  if (data.status?.summary) return data.status.summary;
  if (!data.configured) return "R2 direct runtime storage is not configured.";

  const backupAt = formatRelativeTimestamp(data.r2LastBackupAt, "not recorded");
  const runtimeAt = formatRelativeTimestamp(data.r2LastRuntimePublishAt, "not recorded");
  return `Direct R2 status loaded. Last backup ${backupAt}. Last runtime publish ${runtimeAt}.`;
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
  const [r2Settings, setR2Settings] = useState(DEFAULT_R2_SETTINGS_RESPONSE);
  const [savedR2Settings, setSavedR2Settings] = useState(DEFAULT_R2_SETTINGS_RESPONSE);
  const [loadingR2, setLoadingR2] = useState(true);
  const [savingR2, setSavingR2] = useState(false);
  const [testingR2, setTestingR2] = useState(false);
  const [r2Feedback, setR2Feedback] = useState({ type: "", message: "" });
  const [runningBackup, setRunningBackup] = useState(false);
  const [loadingR2Status, setLoadingR2Status] = useState(false);
  const [restoringR2, setRestoringR2] = useState(false);
  const [r2ActionFeedback, setR2ActionFeedback] = useState({ type: "", message: "" });
  const [r2StatusSummary, setR2StatusSummary] = useState("");
  const [restorePreview, setRestorePreview] = useState(null);
  const [goRouterStatus, setGoRouterStatus] = useState(null);
  const [goRouterDraft, setGoRouterDraft] = useState({ enabled: false, host: "127.0.0.1", port: 12778 });
  const [loadingGoRouter, setLoadingGoRouter] = useState(true);
  const [savingGoRouter, setSavingGoRouter] = useState(false);
  const [restartingGoRouter, setRestartingGoRouter] = useState(false);
  const [goRouterFeedback, setGoRouterFeedback] = useState({ type: "", message: "" });
  const [otelSettings, setOtelSettings] = useState({ enabled: false, jaegerOtlpHttpEndpoint: "" });
  const [savingOtel, setSavingOtel] = useState(false);
  const [otelFeedback, setOtelFeedback] = useState({ type: "", message: "" });
  const goRouterQuery = useQuery({
    queryKey: queryKeys.goRouter(),
    queryFn: ({ signal }) => fetchJson<GoRouterStatusResponse>("/api/go-router", { signal }),
  });
  const modelSyncQuery = useQuery({
    queryKey: queryKeys.modelSync(),
    queryFn: ({ signal }) => fetchJson("/api/model-sync", { signal }),
  });
  const r2SettingsQuery = useQuery({
    queryKey: queryKeys.r2Settings(),
    queryFn: ({ signal }) => fetchJson("/api/r2", { signal }),
  });
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: ({ signal }) => fetchJson("/api/settings", { signal }),
  });
  const routingProfilePreviewQuery = useQuery({
    queryKey: queryKeys.routingProfilePreview(routingProfile),
    queryFn: ({ signal }) => fetchJson(`/api/routing/profile-preview?profile=${encodeURIComponent(routingProfile)}`, { signal, cache: "no-store" }),
    enabled: !r2SettingsQuery.isPending,
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
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!goRouterQuery.data) return;
    const data = goRouterQuery.data;
    queueMicrotask(() => {
      setGoRouterStatus(data);
      setGoRouterDraft({
        enabled: data.enabled === true,
        host: data.host || "127.0.0.1",
        port: Number(data.port) || 12778,
      });
    });
  }, [goRouterQuery.data]);

  useEffect(() => {
    if (!modelSyncQuery.data) return;
    queueMicrotask(() => setModelSyncState(modelSyncQuery.data));
  }, [modelSyncQuery.data]);

  useEffect(() => {
    if (!r2SettingsQuery.data) return;
    const data: any = r2SettingsQuery.data;
    const normalized = normalizeR2SettingsResponse(data);
    queueMicrotask(() => {
      setSavedR2Settings(normalized);
      setR2Settings(normalized);
      setRoutingProfile(data.routingProfile || data.routing?.profile || "balanced");
    });
  }, [r2SettingsQuery.data]);

  useEffect(() => {
    const data: any = routingProfilePreviewQuery.data;
    queueMicrotask(() => setRoutingProfilePreview(data?.preset || null));
  }, [routingProfilePreviewQuery.data]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoadingGoRouter(goRouterQuery.isPending);
      if (goRouterQuery.isError) {
        setGoRouterFeedback({ type: "error", message: goRouterQuery.error?.message || "Failed to load Go router status" });
      }
    });
  }, [goRouterQuery.error, goRouterQuery.isError, goRouterQuery.isPending]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoadingModelSync(modelSyncQuery.isPending);
      if (modelSyncQuery.isError) {
        setModelSyncFeedback({ type: "error", message: modelSyncQuery.error?.message || "Failed to load model sync settings" });
      }
    });
  }, [modelSyncQuery.error, modelSyncQuery.isError, modelSyncQuery.isPending]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoadingR2(r2SettingsQuery.isPending);
      if (r2SettingsQuery.isError) {
        setR2Feedback({ type: "error", message: r2SettingsQuery.error?.message || "Failed to load R2 settings" });
        setR2Settings(DEFAULT_R2_SETTINGS_RESPONSE);
        setSavedR2Settings(DEFAULT_R2_SETTINGS_RESPONSE);
      }
    });
  }, [r2SettingsQuery.error, r2SettingsQuery.isError, r2SettingsQuery.isPending]);

  async function loadGoRouterStatus() {
    await goRouterQuery.refetch();
  }

  async function loadModelSyncSettings() {
    await modelSyncQuery.refetch();
  }

  async function loadR2Settings() {
    await r2SettingsQuery.refetch();
  }

  const handleR2FieldChange = (field, value) => {
    setR2Settings((current) => ({
      ...current,
      r2Config: getNextR2Config(current.r2Config, value, field),
    }));
  };

  const handleR2SettingsChange = (field, value) => {
    setR2Settings((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveR2Mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await fetch("/api/r2", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildR2SettingsPayload(r2Settings, savedR2Settings)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save R2 settings");
      return data;
    },
    onSuccess: (data) => {
      const normalized = normalizeR2SettingsResponse({
        ...savedR2Settings,
        ...data,
        r2Config: data.r2Config || savedR2Settings.r2Config,
        r2LastRuntimePublishAt: data.r2LastRuntimePublishAt ?? savedR2Settings.r2LastRuntimePublishAt,
        r2LastBackupAt: data.r2LastBackupAt ?? savedR2Settings.r2LastBackupAt,
        r2LastRestoreAt: data.r2LastRestoreAt ?? savedR2Settings.r2LastRestoreAt,
      });
      setSavedR2Settings(normalized);
      setR2Settings(normalized);
      setR2Feedback({ type: "success", message: "R2 settings saved." });
      inv.r2Settings();
    },
    onError: (error: any) => {
      setR2Feedback({ type: "error", message: error.message || "Failed to save R2 settings" });
    },
  });

  const handleSaveR2Settings = () => {
    setSavingR2(true);
    setR2Feedback({ type: "", message: "" });
    saveR2Mutation.mutate(undefined, { onSettled: () => setSavingR2(false) });
  };

  const testR2Mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await fetch("/api/r2/test", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Connection test failed");
      return data;
    },
    onSuccess: () => {
      loadR2Settings();
      setR2Feedback({ type: "success", message: "R2 connection verified." });
    },
    onError: (error: any) => {
      loadR2Settings();
      setR2Feedback({ type: "error", message: error.message || "Connection test failed" });
    },
  });

  const handleTestR2Connection = () => {
    if (hasUnsavedR2Changes(r2Settings, savedR2Settings)) {
      setR2Feedback({ type: "error", message: "Save your R2 changes before testing the persisted connection." });
      return;
    }
    setTestingR2(true);
    setR2Feedback({ type: "", message: "" });
    testR2Mutation.mutate(undefined, { onSettled: () => setTestingR2(false) });
  };

  const backupR2Mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await fetch("/api/r2/backup", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Backup failed");
      return data;
    },
    onSuccess: (data) => {
      loadR2Settings();
      const message = data.error || formatDirectBackupMessage(data);
      setR2ActionFeedback({ type: data.success ? "success" : "error", message });
      if (data.success) inv.r2Settings();
    },
    onError: (error: any) => {
      loadR2Settings();
      setR2ActionFeedback({ type: "error", message: error.message || "Backup failed" });
    },
  });

  const handleBackupNow = () => {
    setRunningBackup(true);
    setR2ActionFeedback({ type: "", message: "" });
    backupR2Mutation.mutate(undefined, { onSettled: () => setRunningBackup(false) });
  };

  const handleViewR2Status = async () => {
    setLoadingR2Status(true);
    setR2ActionFeedback({ type: "", message: "" });
    try {
      const response = await fetch("/api/r2/info");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to load R2 status");
      }

      setR2StatusSummary(formatDirectR2Status(data));
      setRestorePreview(
        data.restoreReady && data.backupArtifact?.sqlite
          ? {
              key: data.backupArtifact.sqlite.key,
              generatedAt: data.backupArtifact.generatedAt,
              machineId: data.backupArtifact.machineId,
              size: data.backupArtifact.sqlite.size,
            }
          : null
      );
      setR2ActionFeedback({ type: "success", message: "R2 status loaded." });
    } catch (error) {
      setR2StatusSummary("");
      setRestorePreview(null);
      setR2ActionFeedback({ type: "error", message: error.message || "Failed to load R2 status" });
    } finally {
      setLoadingR2Status(false);
    }
  };

  const restoreR2Mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const restoreListResponse = await fetch("/api/r2/restore");
      const restoreListData = await restoreListResponse.json().catch(() => ({}));
      if (!restoreListResponse.ok) throw new Error(restoreListData.error || "Failed to load restore information");

      const backup = Array.isArray(restoreListData.backups) ? restoreListData.backups[0] : null;
      if (!backup?.key) throw new Error("No SQLite backup is available to restore.");

      setRestorePreview({
        key: backup.key,
        generatedAt: backup.generatedAt || null,
        machineId: backup.machineId || null,
        size: Number.isFinite(backup.size) ? backup.size : null,
      });

      const generatedAt = formatRelativeTimestamp(backup.generatedAt, "unknown time");
      const machineLabel = backup.machineId || "this workspace";
      const confirmed = window.confirm(
        `Restore the latest SQLite backup from ${machineLabel} generated at ${generatedAt}? This overwrites the current local database.`
      );
      if (!confirmed) throw new Error("Restore canceled before any local data was overwritten.");

      const response = await fetch("/api/r2/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmRestore: true, key: backup.key }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Restore failed");
      return { data, backup };
    },
    onSuccess: ({ data, backup }) => {
      loadR2Settings();
      setR2ActionFeedback({
        type: "success",
        message:
          `Restore complete from ${data.restoredBackup?.machineId || backup.machineId || "R2"}. ` +
          `Latest backup timestamp: ${formatRelativeTimestamp(data.restoredBackup?.generatedAt || backup.generatedAt, "unknown")}.`,
      });
      inv.r2Settings(); inv.settings(); inv.providers();
    },
    onError: (error: any) => {
      setR2ActionFeedback({ type: "error", message: error.message || "Restore failed" });
    },
  });

  const handleRestoreFromR2 = () => {
    setRestoringR2(true);
    setR2ActionFeedback({ type: "", message: "" });
    restoreR2Mutation.mutate(undefined, { onSettled: () => setRestoringR2(false) });
  };

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

  const r2IsDirty = hasUnsavedR2Changes(r2Settings, savedR2Settings);
  const r2ConnectionState = getR2ConnectionState(r2Settings.r2Config, testingR2, r2IsDirty);
  const r2Busy = savingR2 || testingR2 || runningBackup || restoringR2 || loadingR2Status;
  const privateR2Configured = isPrivateR2Configured(r2Settings.r2Config);
  const privateR2Ready = isPrivateR2Ready(r2Settings.r2Config, r2IsDirty);
  const canTestConnection = !loadingR2 && !savingR2 && !testingR2 && !r2IsDirty && privateR2Configured;
  const canOperateR2Backup = privateR2Ready && !loadingR2 && !r2Busy;
  const canViewR2Status = privateR2Ready && !loadingR2 && !savingR2 && !testingR2 && !loadingR2Status && !restoringR2;
  const canRestoreFromR2 = canOperateR2Backup && Boolean(restorePreview?.key || savedR2Settings.r2LastBackupAt);
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

  const saveGoRouterMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      return fetchJson<GoRouterStatusResponse>("/api/go-router", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: goRouterDraft.enabled,
          host: goRouterDraft.host,
          port: Number(goRouterDraft.port) || 12778,
        }),
      });
    },
    onSuccess: (data) => {
      setGoRouterStatus(data);
      setGoRouterDraft({
        enabled: data.enabled === true,
        host: data.host || "127.0.0.1",
        port: Number(data.port) || 12778,
      });
      setGoRouterFeedback({ type: "success", message: "Go router settings saved." });
      inv.goRouter();
    },
    onError: (error: any) => {
      setGoRouterFeedback({ type: "error", message: error.message || "Failed to save Go router settings" });
    },
  });

  function handleSaveGoRouter() {
    setSavingGoRouter(true);
    setGoRouterFeedback({ type: "", message: "" });
    saveGoRouterMutation.mutate(undefined, { onSettled: () => setSavingGoRouter(false) });
  }

  const restartGoRouterMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      return fetchJson("/api/go-router/restart", { method: "POST" });
    },
    onSuccess: (data) => {
      setGoRouterStatus(data);
      setGoRouterFeedback({ type: "success", message: "Go router restarted." });
      inv.goRouter();
    },
    onError: (error: any) => {
      setGoRouterFeedback({ type: "error", message: error.message || "Failed to restart Go router" });
    },
  });

  function handleRestartGoRouter() {
    setRestartingGoRouter(true);
    setGoRouterFeedback({ type: "", message: "" });
    restartGoRouterMutation.mutate(undefined, { onSettled: () => setRestartingGoRouter(false) });
  }

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

          <Card><CardHeader><div><CardTitle>Go Router</CardTitle></div></CardHeader><CardContent>
            <div className="flex flex-col gap-4">
              {goRouterFeedback.message ? (
                <Alert
                  variant={goRouterFeedback.type === "error" ? "destructive" : "default"}
                  className="rounded-[4px]"
                >
                  <AlertDescription>{goRouterFeedback.message}</AlertDescription>
                </Alert>
              ) : null}

              {loadingGoRouter ? (
                <Skeleton className="h-44 w-full" />
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Status</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--color-text-main)]">
                        {goRouterStatus?.running ? "Running" : goRouterStatus?.enabled ? "Enabled, waiting to start" : "Disabled"}
                      </p>
                    </div>
                    <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Endpoint</p>
                      <p className="mt-2 break-all text-sm font-semibold text-[var(--color-text-main)]">{goRouterStatus?.endpointUrl || "-"}</p>
                    </div>
                    <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Binary</p>
                      <p className="mt-2 break-all text-sm font-semibold text-[var(--color-text-main)]">{goRouterStatus?.binaryPath || "-"}</p>
                    </div>
                  </div>

                  <label className="flex gap-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4 text-sm text-[var(--color-text-main)]">
                    <Switch
                      checked={goRouterDraft.enabled === true}
                      onToggle={(checked) => setGoRouterDraft((current) => ({ ...current, enabled: checked }))}
                      disabled={savingGoRouter || restartingGoRouter}
                    />
                    <span className="flex flex-col gap-1">
                      <span className="block font-medium">Enable Go router</span>
                    </span>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      type="text"
                      value={goRouterDraft.host}
                      onChange={(event) => setGoRouterDraft((current) => ({ ...current, host: event.target.value }))}
                      disabled={savingGoRouter || restartingGoRouter}
                    />
                    <Input
                      type="number"
                      min="1"
                      max="65535"
                      value={goRouterDraft.port}
                      onChange={(event) => setGoRouterDraft((current) => ({ ...current, port: Number(event.target.value) || 12778 }))}
                      disabled={savingGoRouter || restartingGoRouter}
                    />
                  </div>

                  <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4 text-sm leading-6 text-[var(--color-text-muted)]">
                    <p>PID: {goRouterStatus?.pid ?? "not running"} · Last error: {goRouterStatus?.lastError || "none"}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSaveGoRouter} disabled={savingGoRouter || restartingGoRouter}>
                      {savingGoRouter ? <Spinner data-icon="inline-start" /> : null}
                      {savingGoRouter ? "Saving" : "Save Go Router Settings"}
                    </Button>
                    <Button variant="secondary" onClick={handleRestartGoRouter} disabled={!goRouterDraft.enabled || savingGoRouter || restartingGoRouter}>
                      {restartingGoRouter ? <Spinner data-icon="inline-start" /> : null}
                      {restartingGoRouter ? "Restarting" : "Restart Go Router"}
                    </Button>
                    <Button variant="outline" onClick={() => void loadGoRouterStatus()} disabled={savingGoRouter || restartingGoRouter}>
                      Refresh Status
                    </Button>
                  </div>
                </>
              )}
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

          <Card><CardHeader><div><CardTitle>R2 Storage</CardTitle></div></CardHeader><CardContent>
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">Connection</p>
                  <p className="mt-3 text-lg font-semibold text-[var(--color-text-main)]">{r2ConnectionState.label}</p>
                </div>
                <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">Last Backup</p>
                  <p className="mt-3 text-lg font-semibold text-[var(--color-text-main)]">{formatRelativeTimestamp(r2Settings.r2LastBackupAt, "Not recorded")}</p>
                </div>
                <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">Last Publish</p>
                  <p className="mt-3 text-lg font-semibold text-[var(--color-text-main)]">{formatRelativeTimestamp(r2Settings.r2LastRuntimePublishAt, "Not recorded")}</p>
                </div>
              </div>

              <div
                className={`rounded-[4px] border p-4 ${STATUS_TONE_CLASSNAMES[r2ConnectionState.tone]}`}
                role="status"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                      Connection Status
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--color-text-main)]">
                      {r2ConnectionState.label}
                    </p>
                  </div>
                  <span className="rounded border border-current/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em]">
                    {r2ConnectionState.tone}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6">{r2ConnectionState.detail}</p>
              </div>

              {r2Feedback.message ? (
                <Alert
                  variant={r2Feedback.type === "error" ? "destructive" : "default"}
                  className="rounded-[4px]"
                >
                  <AlertDescription>{r2Feedback.message}</AlertDescription>
                </Alert>
              ) : null}

              {r2ActionFeedback.message ? (
                <Alert
                  variant={r2ActionFeedback.type === "error" ? "destructive" : "default"}
                  className="rounded-[4px]"
                >
                  <AlertDescription>{r2ActionFeedback.message}</AlertDescription>
                </Alert>
              ) : null}

              {loadingR2 ? (
                <Skeleton className="h-44 w-full" />
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {R2_FIELD_DEFINITIONS.map((field) => (
                      <Input
                        key={field.key}
                        type={field.type || "text"}
                        value={r2Settings.r2Config[field.key] || ""}
                        onChange={(event) => handleR2FieldChange(field.key, event.target.value)}
                        autoComplete={field.autoComplete}
                        disabled={r2Busy}
                        spellCheck={false}
                      />
                    ))}
                  </div>

                  <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4 text-sm leading-6 text-[var(--color-text-muted)]">
                    {r2IsDirty ? (
                      <p>Save changes before testing connection.</p>
                    ) : null}
                    {!privateR2Configured ? (
                      <p>Complete all R2 fields to enable backup/restore.</p>
                    ) : null}
                    {privateR2Configured && !privateR2Ready ? (
                      <p>Run a connection test before using backup/restore.</p>
                    ) : null}
                  </div>

                  <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-4 sm:col-span-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                          Runtime publishing
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                          type="url"
                          value={r2Settings.r2RuntimePublicBaseUrl}
                          onChange={(event) =>
                            handleR2SettingsChange("r2RuntimePublicBaseUrl", event.target.value)
                          }
                          autoComplete="url"
                          disabled={r2Busy}
                        />

                        <Input
                          type="number"
                          min="1"
                          max="300"
                          value={r2Settings.r2RuntimeCacheTtlSeconds}
                          onChange={(event) =>
                            handleR2SettingsChange(
                              "r2RuntimeCacheTtlSeconds",
                              sanitizeR2RuntimeCacheTtlSeconds(event.target.value)
                            )
                          }
                          disabled={r2Busy}
                        />
                      </div>

                      <label className="flex gap-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4 text-sm text-[var(--color-text-main)]">
                        <Switch
                          checked={r2Settings.r2AutoPublishEnabled}
                          onToggle={(checked) =>
                            handleR2SettingsChange("r2AutoPublishEnabled", checked)
                          }
                          disabled={r2Busy}
                        />
                        <span className="flex flex-col gap-1">
                          <span className="block font-medium">Automatic runtime publish</span>
                        </span>
                      </label>

                      <p className="text-sm leading-6 text-[var(--color-text-muted)]">
                        Last runtime publish: {formatRelativeTimestamp(r2Settings.r2LastRuntimePublishAt, "Not recorded")}
                      </p>
                    </div>

                    <Field>
                      <FieldLabel>Automatic backups</FieldLabel>
                      <Select value={r2Settings.r2BackupEnabled ? "enabled" : "disabled"} onValueChange={(value) => handleR2SettingsChange("r2BackupEnabled", value === "enabled")} disabled={r2Busy}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">Disabled</SelectItem>
                          <SelectItem value="enabled">Enabled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldDescription>Enable/disable scheduled backups.</FieldDescription>
                    </Field>

                    <Field>
                      <FieldLabel>Backup schedule</FieldLabel>
                      <Select value={r2Settings.r2SqliteBackupSchedule} onValueChange={(value) => handleR2SettingsChange("r2SqliteBackupSchedule", value)} disabled={r2Busy}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BACKUP_SCHEDULE_OPTIONS.map((schedule) => (
                            <SelectItem key={schedule} value={schedule}>{schedule.charAt(0).toUpperCase() + schedule.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>Backup frequency when enabled.</FieldDescription>
                    </Field>

                    <div className="space-y-2 text-sm leading-6 text-[var(--color-text-muted)] sm:col-span-2">
                      <p>
                        Last backup: {formatRelativeTimestamp(r2Settings.r2LastBackupAt, "Not recorded")}
                      </p>
                      <p>
                        Last restore: {formatRelativeTimestamp(r2Settings.r2LastRestoreAt, "Not recorded")}
                      </p>
                      {restorePreview?.key ? (
                        <p>
                          Restore candidate: {restorePreview.key} · {formatRelativeTimestamp(restorePreview.generatedAt, "unknown time")}
                        </p>
                      ) : null}
                      {r2StatusSummary ? <p>{r2StatusSummary}</p> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSaveR2Settings} disabled={r2Busy}>
                      {savingR2 ? <Spinner data-icon="inline-start" /> : null}
                      {savingR2 ? "Saving" : "Save"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleTestR2Connection}
                      disabled={!canTestConnection}
                    >
                      {testingR2 ? <Spinner data-icon="inline-start" /> : null}
                      {testingR2 ? "Testing" : "Test Connection"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleBackupNow}
                      disabled={!canOperateR2Backup}
                    >
                      {runningBackup ? <Spinner data-icon="inline-start" /> : null}
                      {runningBackup ? "Backing Up" : "Backup Now"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleViewR2Status}
                      disabled={!canViewR2Status}
                    >
                      {loadingR2Status ? <Spinner data-icon="inline-start" /> : null}
                      {loadingR2Status ? "Loading Status" : "View R2 Status"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleRestoreFromR2}
                      disabled={!canRestoreFromR2}
                    >
                      {restoringR2 ? <Spinner data-icon="inline-start" /> : null}
                      {restoringR2 ? "Restoring" : "Restore from R2"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent></Card>
    </div>
  );
}
