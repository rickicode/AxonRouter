"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useRef, useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import FormInput from "@/shared/components/Input";
import FormSelect from "@/shared/components/Select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";

const DEFAULT_CHAT_RUNTIME_SETTINGS = {
  upstreamTimeoutMs: null,
  compactUpstreamTimeoutMs: null,
  codexNonCompactTimeoutMs: 75000,
  codexAgenticTimeoutMs: 45000,
  streamIdleTimeoutMs: 120000,
  maxInflight: 2000,
  providerMaxInflight: 600,
  accountMaxInflight: 80,
  observabilityMode: "full",
  observabilitySampleRate: 0.1,
  highThroughputSelection: true,
};

const MS_PER_SECOND = 1000;

function msToSecondsString(value, fallbackMs) {
  const numericValue = Number(value);
  const resolvedMs = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallbackMs;
  if (!resolvedMs) return "";
  return String(Math.max(1, Math.round(resolvedMs / MS_PER_SECOND)));
}

function optionalSecondsStringToMs(value) {
  if (String(value ?? "").trim() === "") return null;
  const seconds = Number.parseFloat(value);
  if (!Number.isFinite(seconds)) return Number.NaN;
  return Math.round(seconds * MS_PER_SECOND);
}

function secondsStringToMs(value) {
  const seconds = Number.parseFloat(value);
  if (!Number.isFinite(seconds)) return Number.NaN;
  return Math.round(seconds * MS_PER_SECOND);
}

function normalizeChatRuntimeForm(value: any = {}) {
  const source: any = value && typeof value === "object" ? value : {};
  return {
    upstreamTimeoutSeconds: msToSecondsString(
      source.upstreamTimeoutMs,
      DEFAULT_CHAT_RUNTIME_SETTINGS.upstreamTimeoutMs,
    ),
    compactUpstreamTimeoutSeconds: msToSecondsString(
      source.compactUpstreamTimeoutMs,
      DEFAULT_CHAT_RUNTIME_SETTINGS.compactUpstreamTimeoutMs,
    ),
    codexNonCompactTimeoutSeconds: msToSecondsString(
      source.codexNonCompactTimeoutMs,
      DEFAULT_CHAT_RUNTIME_SETTINGS.codexNonCompactTimeoutMs,
    ),
    codexAgenticTimeoutSeconds: msToSecondsString(
      source.codexAgenticTimeoutMs,
      DEFAULT_CHAT_RUNTIME_SETTINGS.codexAgenticTimeoutMs,
    ),
    streamIdleTimeoutSeconds: msToSecondsString(
      source.streamIdleTimeoutMs,
      DEFAULT_CHAT_RUNTIME_SETTINGS.streamIdleTimeoutMs,
    ),
    maxInflight: String(source.maxInflight ?? DEFAULT_CHAT_RUNTIME_SETTINGS.maxInflight),
    providerMaxInflight: String(source.providerMaxInflight ?? DEFAULT_CHAT_RUNTIME_SETTINGS.providerMaxInflight),
    accountMaxInflight: String(source.accountMaxInflight ?? DEFAULT_CHAT_RUNTIME_SETTINGS.accountMaxInflight),
    observabilityMode: source.observabilityMode || DEFAULT_CHAT_RUNTIME_SETTINGS.observabilityMode,
    observabilitySampleRate: String(source.observabilitySampleRate ?? DEFAULT_CHAT_RUNTIME_SETTINGS.observabilitySampleRate),
    highThroughputSelection: source.highThroughputSelection !== false,
  };
}

function buildChatRuntimePayload(form) {
  return {
    upstreamTimeoutMs: optionalSecondsStringToMs(form.upstreamTimeoutSeconds),
    compactUpstreamTimeoutMs: optionalSecondsStringToMs(form.compactUpstreamTimeoutSeconds),
    codexNonCompactTimeoutMs: secondsStringToMs(form.codexNonCompactTimeoutSeconds),
    codexAgenticTimeoutMs: secondsStringToMs(form.codexAgenticTimeoutSeconds),
    streamIdleTimeoutMs: secondsStringToMs(form.streamIdleTimeoutSeconds),
    maxInflight: Number.parseInt(form.maxInflight, 10),
    providerMaxInflight: Number.parseInt(form.providerMaxInflight, 10),
    accountMaxInflight: Number.parseInt(form.accountMaxInflight, 10),
    observabilityMode: form.observabilityMode,
    observabilitySampleRate: Number.parseFloat(form.observabilitySampleRate),
    highThroughputSelection: form.highThroughputSelection === true,
  };
}

function SectionIntro({ icon, title, description, tone = "neutral", eyebrow = "Settings" }) {
  const toneClassName = {
    success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
    primary: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
    purple: "bg-[var(--color-purple-soft)] text-[var(--color-purple)]",
    warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
    neutral: "bg-[var(--color-bg-alt)] text-text-muted",
  }[tone] || "bg-[var(--color-bg-alt)] text-text-muted";

  return (
    <div className="flex items-start gap-3 border-b border-border/70 pb-3">
      <div className={cn("flex size-10 items-center justify-center rounded-[4px]", toneClassName)}>
        <AppIcon name={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{eyebrow}</p>
        <h3 className="mt-1 text-lg font-semibold text-text-main">{title}</h3>
        {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
      </div>
    </div>
  );
}

type SettingsState = any;

export default function ProfileSettingsContent() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<SettingsState>({
    routing: {
      strategy: "fill-first",
      stickyLimit: 3,
      sticky: { enabled: false, durationSeconds: 300 },
      comboStrategy: "priority",
      providerStrategies: {},
      comboStrategies: {},
    },
  });
  const [loading, setLoading] = useState(true);
  const [usageWorkerForm, setUsageWorkerForm] = useState({
    enabled: true,
    cadenceMinutes: "15",
    exhaustedThresholdPercent: "10",
  });
  const [usageWorkerStatus, setUsageWorkerStatus] = useState({ type: "", message: "" });
  const [usageWorkerLoading, setUsageWorkerLoading] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ type: "", message: "" });
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [proxyForm, setProxyForm] = useState({
    outboundProxyEnabled: false,
    outboundProxyUrl: "",
    outboundNoProxy: "",
  });
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);
  const [routingStatus, setRoutingStatus] = useState({ type: "", message: "" });
  const [routingLoading, setRoutingLoading] = useState(false);
  const [stickyDurationInput, setStickyDurationInput] = useState("300");
  const [chatRuntimeForm, setChatRuntimeForm] = useState(normalizeChatRuntimeForm(DEFAULT_CHAT_RUNTIME_SETTINGS));
  const [chatRuntimeStatus, setChatRuntimeStatus] = useState({ type: "", message: "" });
  const [chatRuntimeLoading, setChatRuntimeLoading] = useState(false);
  const [governanceForm, setGovernanceForm] = useState({
    enabled: false,
    allowedProviders: "",
    monthlyBudgetCapUsd: "0",
    apiKeyPolicyId: "",
    apiKeyAllowedProviders: "",
    apiKeyMonthlyBudgetCapUsd: "0",
  });
  const [governanceStatus, setGovernanceStatus] = useState({ type: "", message: "" });
  const [governanceLoading, setGovernanceLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setUsageWorkerForm({
          enabled: data?.usageWorker?.enabled !== false,
          cadenceMinutes: String(
            Math.max(15, Math.round((data?.usageWorker?.cadenceMs || 900000) / 60000))
          ),
          exhaustedThresholdPercent: String(
            Number.isFinite(data?.quotaExhaustedThresholdPercent)
              ? data.quotaExhaustedThresholdPercent
              : 10
          ),
        });
        setProxyForm({
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
          outboundProxyUrl: data?.outboundProxyUrl || "",
          outboundNoProxy: data?.outboundNoProxy || "",
        });
        setChatRuntimeForm(normalizeChatRuntimeForm(data?.chatRuntime));
        setGovernanceForm({
          enabled: data?.governance?.enabled === true,
          allowedProviders: Array.isArray(data?.governance?.allowedProviders) ? data.governance.allowedProviders.join(", ") : "",
          monthlyBudgetCapUsd: String(data?.governance?.monthlyBudgetCapUsd ?? 0),
          apiKeyPolicyId: "",
          apiKeyAllowedProviders: "",
          apiKeyMonthlyBudgetCapUsd: "0",
        });
        setStickyDurationInput(String(data?.routing?.sticky?.durationSeconds || data?.stickyDuration || 300));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });
  }, []);

  const reloadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data);
      setChatRuntimeForm(normalizeChatRuntimeForm(data?.chatRuntime));
      setGovernanceForm({
        enabled: data?.governance?.enabled === true,
        allowedProviders: Array.isArray(data?.governance?.allowedProviders) ? data.governance.allowedProviders.join(", ") : "",
        monthlyBudgetCapUsd: String(data?.governance?.monthlyBudgetCapUsd ?? 0),
        apiKeyPolicyId: "",
        apiKeyAllowedProviders: "",
        apiKeyMonthlyBudgetCapUsd: "0",
      });
      setStickyDurationInput(String(data?.routing?.sticky?.durationSeconds || data?.stickyDuration || 300));
    } catch (err) {
      console.error("Failed to reload settings:", err);
    }
  };

  const updateUsageWorker = async (updates, successMessage = "Usage worker updated") => {
    setUsageWorkerLoading(true);
    setUsageWorkerStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setUsageWorkerForm({
          enabled: data?.usageWorker?.enabled !== false,
          cadenceMinutes: String(
            Math.max(15, Math.round((data?.usageWorker?.cadenceMs || 900000) / 60000))
          ),
          exhaustedThresholdPercent: String(
            Number.isFinite(data?.quotaExhaustedThresholdPercent)
              ? data.quotaExhaustedThresholdPercent
              : 10
          ),
        });
        setUsageWorkerStatus({ type: "success", message: successMessage });
      } else {
        setUsageWorkerStatus({ type: "error", message: data.error || "Failed to update usage worker" });
      }
    } catch {
      setUsageWorkerStatus({ type: "error", message: "An error occurred" });
    } finally {
      setUsageWorkerLoading(false);
    }
  };

  const updateUsageWorkerEnabled = async (enabled) => {
    setUsageWorkerForm((prev) => ({ ...prev, enabled }));
    await updateUsageWorker(
      { usageWorker: { enabled } },
      enabled ? "Usage worker enabled" : "Usage worker disabled"
    );
  };

  const applyUsageWorkerSettings = async (e) => {
    e.preventDefault();
    const minutes = Number.parseInt(usageWorkerForm.cadenceMinutes, 10);
    if (!Number.isFinite(minutes) || minutes < 15) {
      setUsageWorkerStatus({ type: "error", message: "Scheduler interval must be at least 15 minutes" });
      return;
    }
    const threshold = Number.parseFloat(usageWorkerForm.exhaustedThresholdPercent);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      setUsageWorkerStatus({ type: "error", message: "Quota exhausted threshold must be between 0 and 100" });
      return;
    }
    await updateUsageWorker(
      {
        usageWorker: { intervalMinutes: minutes },
        quotaExhaustedThresholdPercent: threshold,
      },
      "Usage worker settings updated"
    );
  };

  const updateOutboundProxy = async (e) => {
    e.preventDefault();
    if (settings.outboundProxyEnabled !== true) return;
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundProxyUrl: proxyForm.outboundProxyUrl,
          outboundNoProxy: proxyForm.outboundNoProxy,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyStatus({ type: "success", message: "Proxy settings applied" });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const testOutboundProxy = async () => {
    if (settings.outboundProxyEnabled !== true) return;
    const proxyUrl = (proxyForm.outboundProxyUrl || "").trim();
    if (!proxyUrl) {
      setProxyStatus({ type: "error", message: "Please enter a Proxy URL to test" });
      return;
    }
    setProxyTestLoading(true);
    setProxyStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setProxyStatus({
          type: "success",
          message: `Proxy test OK (${data.status}) in ${data.elapsedMs}ms`,
        });
      } else {
        setProxyStatus({ type: "error", message: data?.error || "Proxy test failed" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyTestLoading(false);
    }
  };

  const updateOutboundProxyEnabled = async (outboundProxyEnabled) => {
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundProxyEnabled }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({ ...prev, outboundProxyEnabled: data?.outboundProxyEnabled === true }));
        setProxyStatus({
          type: "success",
          message: outboundProxyEnabled ? "Proxy enabled" : "Proxy disabled",
        });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }
    setPassLoading(true);
    setPassStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPassStatus({ type: "success", message: "Password updated successfully" });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        setPassStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  const updateFallbackStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing: { strategy } }),
      });
      if (res.ok) {
        setSettings((prev) => ({
          ...prev,
          routing: { ...(prev.routing || {}), strategy },
        }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const updateComboStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing: { comboStrategy: strategy } }),
      });
      if (res.ok) {
        setSettings((prev) => ({
          ...prev,
          routing: { ...(prev.routing || {}), comboStrategy: strategy },
        }));
      }
    } catch (err) {
      console.error("Failed to update combo strategy:", err);
    }
  };

  const updateStickyLimit = async (limit) => {
    const numLimit = parseInt(limit, 10);
    if (Number.isNaN(numLimit) || numLimit < 1) return;
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing: { stickyLimit: numLimit } }),
      });
      if (res.ok) {
        setSettings((prev) => ({
          ...prev,
          routing: { ...(prev.routing || {}), stickyLimit: numLimit },
        }));
      }
    } catch (err) {
      console.error("Failed to update sticky limit:", err);
    }
  };

  const updateObservabilityEnabled = async (enabled) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableObservability: enabled }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, enableObservability: enabled }));
      }
    } catch (err) {
      console.error("Failed to update enableObservability:", err);
    }
  };

  const updateRequestLogsEnabled = async (enabled) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableRequestLogs: enabled }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, enableRequestLogs: enabled }));
      }
    } catch (err) {
      console.error("Failed to update enableRequestLogs:", err);
    }
  };

  const validateChatRuntimePayload = (payload) => {
    const positiveFields = [
      ["upstreamTimeoutMs", "Upstream timeout"],
      ["compactUpstreamTimeoutMs", "Compact upstream timeout"],
      ["codexNonCompactTimeoutMs", "Codex non-compact timeout"],
      ["codexAgenticTimeoutMs", "Codex agentic timeout"],
      ["streamIdleTimeoutMs", "Stream idle timeout"],
      ["maxInflight", "Global concurrency"],
      ["providerMaxInflight", "Provider concurrency"],
      ["accountMaxInflight", "Account concurrency"],
    ];
    for (const [key, label] of positiveFields) {
      if (!Number.isFinite(payload[key]) || payload[key] <= 0) return `${label} must be greater than 0`;
    }
    if (!Number.isFinite(payload.observabilitySampleRate) || payload.observabilitySampleRate < 0 || payload.observabilitySampleRate > 1) {
      return "Observability sample rate must be between 0 and 1";
    }
    return null;
  };

  const saveChatRuntimeSettings = async (event) => {
    event.preventDefault();
    const payload = buildChatRuntimePayload(chatRuntimeForm);
    const validationError = validateChatRuntimePayload(payload);
    if (validationError) {
      setChatRuntimeStatus({ type: "error", message: validationError });
      return;
    }

    setChatRuntimeLoading(true);
    setChatRuntimeStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatRuntime: payload }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setChatRuntimeForm(normalizeChatRuntimeForm(data?.chatRuntime));
        setChatRuntimeStatus({ type: "success", message: "Chat runtime settings saved" });
      } else {
        setChatRuntimeStatus({ type: "error", message: data.error || "Failed to save chat runtime settings" });
      }
    } catch {
      setChatRuntimeStatus({ type: "error", message: "An error occurred" });
    } finally {
      setChatRuntimeLoading(false);
    }
  };

  const resetChatRuntimeDefaults = async () => {
    setChatRuntimeLoading(true);
    setChatRuntimeStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetChatRuntimeDefaults: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setChatRuntimeForm(normalizeChatRuntimeForm(data?.chatRuntime));
        setChatRuntimeStatus({ type: "success", message: "Chat runtime settings reset to defaults" });
      } else {
        setChatRuntimeStatus({ type: "error", message: data.error || "Failed to reset chat runtime settings" });
      }
    } catch {
      setChatRuntimeStatus({ type: "error", message: "An error occurred" });
    } finally {
      setChatRuntimeLoading(false);
    }
  };

  const updateCloudRoutingSettings = async (updates, successMessage) => {
    setRoutingLoading(true);
    setRoutingStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing: updates }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setStickyDurationInput(String(data?.routing?.sticky?.durationSeconds || data?.stickyDuration || 300));
        setRoutingStatus({ type: "success", message: successMessage });
      } else {
        setRoutingStatus({ type: "error", message: data.error || "Failed to update routing settings" });
      }
    } catch {
      setRoutingStatus({ type: "error", message: "An error occurred" });
    } finally {
      setRoutingLoading(false);
    }
  };

  const updateCloudRoundRobin = async (enabled) => {
    await updateCloudRoutingSettings(
      { strategy: enabled ? "round-robin" : "fill-first" },
      enabled ? "Round-robin enabled" : "Round-robin disabled"
    );
  };

  const updateCloudSticky = async (enabled) => {
    await updateCloudRoutingSettings(
      { sticky: { ...(settings?.routing?.sticky || {}), enabled } },
      enabled ? "Sticky sessions enabled" : "Sticky sessions disabled"
    );
  };

  const applyCloudStickyDuration = async (value) => {
    const duration = Number.parseInt(value, 10);
    if (!Number.isFinite(duration) || duration < 60 || duration > 3600) {
      setRoutingStatus({
        type: "error",
        message: "Sticky duration must be between 60 and 3600 seconds",
      });
      setStickyDurationInput(String(settings?.routing?.sticky?.durationSeconds || settings?.stickyDuration || 300));
      return;
    }
    await updateCloudRoutingSettings(
      { sticky: { ...(settings?.routing?.sticky || {}), durationSeconds: duration } },
      "Sticky duration updated"
    );
  };

  const handleExportDatabase = async () => {
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/database");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export database");
      }
      const payload = await res.json();
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      anchor.href = url;
      anchor.download = `axonrouter-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setDbStatus({ type: "success", message: "Database backup downloaded" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Failed to export database" });
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportDatabase = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);
      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import database");
      }
      await reloadSettings();
      setDbStatus({ type: "success", message: "Database imported successfully" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Invalid backup file" });
    } finally {
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
      setDbLoading(false);
    }
  };

  const observabilityEnabled = settings.enableObservability === true;
  const requestLogsEnabled = settings.enableRequestLogs === true;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <SectionIntro
            icon="computer"
            tone="success"
            title="Appearance & Storage"
            description="Theme, local database location, and backup tools for this machine."
          />
          <div className="inline-flex rounded-[4px] bg-[var(--color-bg-alt)] p-1">
            {(["light", "dark", "system"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 font-medium transition-all",
                  theme === option
                    ? "bg-[var(--color-bg)] text-text-main ring-1 ring-[var(--color-border-strong)]/50"
                    : "text-text-muted hover:bg-[var(--color-border)] hover:text-text-main"
                )}
              >
                <AppIcon
                  name={option === "light" ? "lightmode" : option === "dark" ? "darkmode" : "system"}
                  size={18}
                />
                <span className="text-sm capitalize">{option}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between rounded border border-border bg-[var(--color-bg)] p-3">
            <div>
              <p className="font-medium">Database Location</p>
              <p className="font-mono text-sm text-text-muted">~/.axonrouter/db.sqlite</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleExportDatabase}>
              Download Backup
            </Button>
            <Button
              variant="outline"
              onClick={() => importFileRef.current?.click()}
              disabled={dbLoading}
            >
              Import Backup
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportDatabase}
            />
          </div>
          {dbStatus.message ? (
            <Alert variant={dbStatus.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{dbStatus.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </Card>

      <Card className="p-4">
        <SectionIntro
          icon="shield"
          tone="primary"
          title="Security"
          description="Dashboard access is always protected by password. Update the password here; remote dashboard exposure is configured separately in Endpoint settings."
          eyebrow="Access"
        />
        <form onSubmit={handlePasswordChange} className="flex flex-col gap-4 border-t border-border/50 pt-4">
          {settings.hasPassword ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Current Password</label>
              <FormInput
                type="password"
                placeholder="Enter current password"
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                required
              />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">New Password</label>
              <FormInput
                type="password"
                placeholder="Enter new password"
                value={passwords.new}
                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Confirm New Password</label>
              <FormInput
                type="password"
                placeholder="Confirm new password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                required
              />
            </div>
          </div>
          {passStatus.message ? (
            <Alert variant={passStatus.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{passStatus.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="pt-2">
            <Button type="submit" variant="default">
              {settings.hasPassword ? "Update Password" : "Set Password"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <SectionIntro
          icon="route"
          tone="info"
          title="Routing Strategy"
          description="Use one shared routing configuration for local AxonRouter and all synced cloud workers."
          eyebrow="Routing"
        />
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Round Robin</p>
              <p className="text-sm text-text-muted">Cycle through accounts to distribute load everywhere.</p>
            </div>
            <Switch
              checked={settings.routing?.strategy === "round-robin"}
              onToggle={() =>
                updateFallbackStrategy(
                  settings.routing?.strategy === "round-robin" ? "fill-first" : "round-robin"
                )
              }
              disabled={loading || routingLoading}
            />
          </div>
          {settings.routing?.strategy === "round-robin" ? (
            <div className="flex items-center justify-between border-t border-border/50 pt-2">
              <div>
                <p className="font-medium">Sticky Limit</p>
                <p className="text-sm text-text-muted">Calls per account before switching</p>
              </div>
              <FormInput
                type="number"
                min="1"
                max="10"
                value={settings.routing?.stickyLimit || 3}
                onChange={(e) => updateStickyLimit(e.target.value)}
                disabled={loading || routingLoading}
                className="w-20 text-center"
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border/50 pt-4">
            <div>
              <p className="font-medium">Legacy Combo Strategy Override</p>
              <p className="text-sm text-text-muted">Compatibility fallback only. New combos should define strategy directly in the combo editor.</p>
            </div>
            <Switch
              checked={settings.routing?.comboStrategy === "round-robin"}
              onToggle={() =>
                updateComboStrategy(
                  settings.routing?.comboStrategy === "round-robin" ? "priority" : "round-robin"
                )
              }
              disabled={loading || routingLoading}
            />
          </div>
          <p className="border-t border-border/50 pt-3 text-sm text-text-muted">
            {settings.routing?.strategy === "round-robin"
              ? `Currently distributing requests across all available accounts with ${settings.routing?.stickyLimit || 3} calls per account.`
              : "Currently using accounts in priority order (Fill First)."}
          </p>
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Sticky Sessions</p>
                <p className="text-sm text-text-muted">Keep a client on the same connection across local and cloud routes.</p>
              </div>
              <Switch
                checked={settings.routing?.sticky?.enabled === true}
                onToggle={() => updateCloudSticky(!(settings.routing?.sticky?.enabled === true))}
                disabled={loading || routingLoading}
              />
            </div>
            {settings.routing?.sticky?.enabled === true ? (
              <div className="mt-3">
                <FormInput
                  type="number"
                  min="60"
                  max="3600"
                  step="1"
                  label="Sticky Duration (seconds)"
                  value={stickyDurationInput}
                  onChange={(e) => {
                    setStickyDurationInput(e.target.value);
                    if (routingStatus.message) setRoutingStatus({ type: "", message: "" });
                  }}
                  onBlur={(e) => applyCloudStickyDuration(e.target.value)}
                  disabled={loading || routingLoading}
                  hint="Used by local + cloud routing together."
                  className="w-full"
                />
              </div>
            ) : null}
          </div>
          {routingStatus.message ? (
            <Alert variant={routingStatus.type === "error" ? "destructive" : "default"} className="border-t border-border/50">
              <AlertDescription>{routingStatus.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </Card>

      <Card className="p-4">
        <SectionIntro
          icon="tune"
          tone="neutral"
          title="Advanced"
          description="Outbound proxy and observability controls."
          eyebrow="Options"
        />
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-t border-border/50 pt-4">
            <div>
              <p className="font-medium">Outbound Proxy</p>
              <p className="text-sm text-text-muted">Route provider/OAuth traffic through a proxy.</p>
            </div>
            <Switch
              checked={settings.outboundProxyEnabled === true}
              onToggle={() => updateOutboundProxyEnabled(!(settings.outboundProxyEnabled === true))}
              disabled={loading || proxyLoading}
            />
          </div>
          {settings.outboundProxyEnabled === true ? (
            <form onSubmit={updateOutboundProxy} className="flex flex-col gap-3 border-t border-border/50 pt-2">
              <FormInput
                placeholder="http://127.0.0.1:7897"
                value={proxyForm.outboundProxyUrl}
                onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundProxyUrl: e.target.value }))}
                disabled={loading || proxyLoading}
              />
              <FormInput
                placeholder="localhost,127.0.0.1 (no proxy)"
                value={proxyForm.outboundNoProxy}
                onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundNoProxy: e.target.value }))}
                disabled={loading || proxyLoading}
              />
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={proxyTestLoading || loading || proxyLoading} onClick={testOutboundProxy}>
                  {proxyTestLoading ? <Spinner className="size-4" /> : null}
                  Test
                </Button>
                <Button type="submit" size="sm">Apply</Button>
              </div>
            </form>
          ) : null}
          {proxyStatus.message ? (
            <Alert variant={proxyStatus.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{proxyStatus.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center justify-between border-t border-border/50 pt-4">
            <div>
              <p className="font-medium">Request Details (Usage Tab)</p>
              <p className="text-sm text-text-muted">Record request metadata (model, tokens, status) for the Usage → Request Details view.</p>
            </div>
            <Switch checked={observabilityEnabled} onToggle={updateObservabilityEnabled} disabled={loading} />
          </div>
          <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-4">
            <div>
              <p className="font-medium">Full Request Logs (Translator Tab)</p>
              <p className="text-sm text-text-muted">Log complete request/response payloads to disk for the Translator debug view.</p>
            </div>
            <Switch checked={requestLogsEnabled} onToggle={updateRequestLogsEnabled} disabled={loading} />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionIntro
          icon="gavel"
          tone="warning"
          title="Routing Guardrails"
          description="Set an initial provider allowlist, budget cap, and optional per-API-key override for routing guardrails."
          eyebrow="Policy"
        />
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setGovernanceLoading(true);
            setGovernanceStatus({ type: "", message: "" });
            try {
              const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  governance: {
                    enabled: governanceForm.enabled,
                    allowedProviders: governanceForm.allowedProviders.split(",").map((value) => value.trim()).filter(Boolean),
                    monthlyBudgetCapUsd: Number.parseFloat(governanceForm.monthlyBudgetCapUsd) || 0,
                    apiKeyPolicies: governanceForm.apiKeyPolicyId
                      ? {
                          [governanceForm.apiKeyPolicyId]: {
                            allowedProviders: governanceForm.apiKeyAllowedProviders.split(",").map((value) => value.trim()).filter(Boolean),
                            monthlyBudgetCapUsd: Number.parseFloat(governanceForm.apiKeyMonthlyBudgetCapUsd) || 0,
                          },
                        }
                      : {},
                  },
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Failed to update routing guardrails");
              setSettings((prev) => ({ ...prev, ...data }));
              setGovernanceStatus({ type: "success", message: "Routing guardrails updated" });
            } catch (error) {
              setGovernanceStatus({ type: "error", message: error.message || "Failed to update routing guardrails" });
            } finally {
              setGovernanceLoading(false);
            }
          }}
          className="mb-4 flex flex-col gap-4 rounded border border-border bg-[var(--color-bg-alt)] p-4"
        >
          <div className="flex items-center justify-between gap-3 rounded border border-border bg-[var(--color-bg)] p-3">
            <div>
              <p className="font-medium">Enable routing guardrails</p>
              <p className="text-sm text-text-muted">Turns on provider allowlist and budget cap checks during provider selection.</p>
            </div>
            <Switch checked={governanceForm.enabled} onToggle={() => setGovernanceForm((prev) => ({ ...prev, enabled: !prev.enabled }))} />
          </div>
          <FormInput
            label="Allowed providers"
            value={governanceForm.allowedProviders}
            onChange={(e) => setGovernanceForm((prev) => ({ ...prev, allowedProviders: e.target.value }))}
            placeholder="openai, anthropic, openrouter"
            hint="Comma-separated provider ids."
          />
          <FormInput
            type="number"
            min="0"
            step="0.01"
            label="Monthly budget cap (USD)"
            value={governanceForm.monthlyBudgetCapUsd}
            onChange={(e) => setGovernanceForm((prev) => ({ ...prev, monthlyBudgetCapUsd: e.target.value }))}
          />
          <FormInput
            label="API key policy target (API key id)"
            value={governanceForm.apiKeyPolicyId}
            onChange={(e) => setGovernanceForm((prev) => ({ ...prev, apiKeyPolicyId: e.target.value }))}
            placeholder="optional api key id"
          />
          <FormInput
            label="API key allowed providers"
            value={governanceForm.apiKeyAllowedProviders}
            onChange={(e) => setGovernanceForm((prev) => ({ ...prev, apiKeyAllowedProviders: e.target.value }))}
            placeholder="openai, anthropic"
          />
          <FormInput
            type="number"
            min="0"
            step="0.01"
            label="API key monthly budget cap (USD)"
            value={governanceForm.apiKeyMonthlyBudgetCapUsd}
            onChange={(e) => setGovernanceForm((prev) => ({ ...prev, apiKeyMonthlyBudgetCapUsd: e.target.value }))}
          />
          <div className="rounded border border-border bg-[var(--color-bg)] p-3 text-sm text-text-muted">
            Tenant-specific governance is hidden for now because request tenant identity is not yet wired into runtime enforcement.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="default">Save routing guardrails</Button>
            {governanceStatus.message ? (
              <Alert variant={governanceStatus.type === "error" ? "destructive" : "default"} className="min-w-0 flex-1">
                <AlertDescription>{governanceStatus.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </form>

        <SectionIntro
          icon="speed"
          tone="primary"
          title="Chat Runtime"
          description="Tune /v1 timeout, concurrency, observability mode, and high-throughput account selection from saved settings."
          eyebrow="Performance"
        />
        <form onSubmit={saveChatRuntimeSettings} className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FormInput
              type="number"
              min="1"
              step="1"
              label="Hard upstream timeout (seconds, optional)"
              value={chatRuntimeForm.upstreamTimeoutSeconds}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, upstreamTimeoutSeconds: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="Blank disables hard request timeout. Client disconnects and stream idle timeout still apply."
            />
            <FormInput
              type="number"
              min="1"
              step="1"
              label="Compact hard timeout (seconds, optional)"
              value={chatRuntimeForm.compactUpstreamTimeoutSeconds}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, compactUpstreamTimeoutSeconds: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="Blank disables hard timeout for compact flows."
            />
            <FormInput
              type="number"
              min="1"
              step="1"
              label="Codex non-compact timeout (seconds)"
              value={chatRuntimeForm.codexNonCompactTimeoutSeconds}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, codexNonCompactTimeoutSeconds: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="Default 75. Used for Codex non-compact requests like gpt-5.4 when not in compact mode."
            />
            <FormInput
              type="number"
              min="1"
              step="1"
              label="Codex agentic timeout (seconds)"
              value={chatRuntimeForm.codexAgenticTimeoutSeconds}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, codexAgenticTimeoutSeconds: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="Default 45. Used for Codex non-compact requests with tools or reasoning."
            />
            <FormInput
              type="number"
              min="1"
              step="1"
              label="Stream idle timeout (seconds)"
              value={chatRuntimeForm.streamIdleTimeoutSeconds}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, streamIdleTimeoutSeconds: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="Default 120. Saved to backend in milliseconds."
            />
            <FormInput
              type="number"
              min="1"
              step="1"
              label="Global max in-flight"
              value={chatRuntimeForm.maxInflight}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, maxInflight: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="Default 2000."
            />
            <FormInput
              type="number"
              min="1"
              step="1"
              label="Provider max in-flight"
              value={chatRuntimeForm.providerMaxInflight}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, providerMaxInflight: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="Default 600 per provider."
            />
            <FormInput
              type="number"
              min="1"
              step="1"
              label="Account max in-flight"
              value={chatRuntimeForm.accountMaxInflight}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, accountMaxInflight: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="Default 80 per account."
            />
            <FormInput
              type="number"
              min="0"
              max="1"
              step="0.01"
              label="Observability sample rate"
              value={chatRuntimeForm.observabilitySampleRate}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, observabilitySampleRate: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              hint="0 to 1. Used when mode is sampled."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormSelect
              label="Observability mode"
              value={chatRuntimeForm.observabilityMode}
              onChange={(e) => setChatRuntimeForm((prev) => ({ ...prev, observabilityMode: e.target.value }))}
              disabled={loading || chatRuntimeLoading}
              options={[
                { value: "full", label: "Full" },
                { value: "sampled", label: "Sampled" },
                { value: "minimal", label: "Minimal errors only" },
                { value: "off", label: "Off" },
              ]}
              hint="Controls request log/detail persistence for high traffic."
            />
            <div className="flex items-center justify-between rounded border border-border bg-[var(--color-bg)] p-3">
              <div>
                <p className="font-medium">High-throughput selection</p>
                <p className="text-sm text-text-muted">Use cached provider lists and memory round-robin cursor.</p>
              </div>
              <Switch
                checked={chatRuntimeForm.highThroughputSelection}
                onToggle={(enabled) => setChatRuntimeForm((prev) => ({ ...prev, highThroughputSelection: enabled }))}
                disabled={loading || chatRuntimeLoading}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
            <Button type="submit" variant="default">
              Save chat runtime
            </Button>
            <Button type="button" variant="secondary" onClick={resetChatRuntimeDefaults} disabled={loading || chatRuntimeLoading}>
              Reset to default
            </Button>
          </div>
          {chatRuntimeStatus.message ? (
            <Alert variant={chatRuntimeStatus.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{chatRuntimeStatus.message}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      </Card>

      <Card className="p-4">
        <SectionIntro
          icon="schedule"
          tone="success"
          title="Usage Worker"
          description="Control automatic background usage refresh checks for supported accounts."
          eyebrow="Automation"
        />
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable scheduler</p>
              <p className="text-sm text-text-muted">Automatically refresh usage status in the background.</p>
            </div>
            <Switch checked={usageWorkerForm.enabled} onToggle={updateUsageWorkerEnabled} disabled={loading || usageWorkerLoading} />
          </div>
          <form onSubmit={applyUsageWorkerSettings} className="flex flex-col gap-3 border-t border-border/50 pt-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div className="grid flex-1 gap-3 md:grid-cols-2 md:items-end">
                <FormInput
                  type="number"
                  min="15"
                  step="1"
                  label="Scheduler interval (minutes)"
                  value={usageWorkerForm.cadenceMinutes}
                  onChange={(e) => {
                    setUsageWorkerForm((prev) => ({ ...prev, cadenceMinutes: e.target.value }));
                    if (usageWorkerStatus.message) setUsageWorkerStatus({ type: "", message: "" });
                  }}
                  disabled={loading || usageWorkerLoading}
                  hint="Minimum 15 minutes. Changes are saved via the settings API."
                  className="w-full"
                />
                <FormInput
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  label="Exhausted threshold (%)"
                  value={usageWorkerForm.exhaustedThresholdPercent}
                  onChange={(e) => {
                    setUsageWorkerForm((prev) => ({ ...prev, exhaustedThresholdPercent: e.target.value }));
                    if (usageWorkerStatus.message) setUsageWorkerStatus({ type: "", message: "" });
                  }}
                  disabled={loading || usageWorkerLoading}
                  hint="Global threshold to treat an account as exhausted."
                  className="w-full"
                />
              </div>
              <Button type="submit" variant="default">
                Save usage worker settings
              </Button>
            </div>
            <div className="rounded border border-border/60 bg-[var(--color-bg)] px-3 py-2 text-sm text-text-muted">
              Current cadence: every {Math.max(15, Math.round((settings?.usageWorker?.cadenceMs || 900000) / 60000))} minutes
            </div>
          </form>
          {usageWorkerStatus.message ? (
            <Alert variant={usageWorkerStatus.type === "error" ? "destructive" : "default"} className="border-t border-border/50">
              <AlertDescription>{usageWorkerStatus.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </Card>

      <div className="rounded-[4px] border border-border bg-[var(--color-bg-alt)] px-4 py-4 text-sm text-text-muted">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">System</p>
        <p className="mt-2 font-medium text-text-main">{APP_CONFIG.name} v{APP_CONFIG.version}</p>
      </div>
    </div>
  );
}
