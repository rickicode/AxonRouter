"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlQueryControls } from "@/shared/hooks";
import { fetchJson, queryKeys } from "@/shared/query";

const DEFAULT_BASE_URL = "https://api.morphllm.com";
const PERIOD_OPTIONS = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];
const REQUEST_LOG_PAGE_SIZE = 10;
const API_KEYS_PAGE_SIZE = 10;
const REQUEST_LOG_AUTO_REFRESH_MS = 5000;
const EMAIL_BREAKDOWN_PAGE_SIZE = 8;
const MORPH_TEST_ALL_CONCURRENCY = 5;
const EMPTY_MORPH_KEY = {
  email: "",
  key: "",
  status: "inactive",
  isExhausted: false,
  lastCheckedAt: null,
  lastError: "",
  nextRetryAt: null,
};

const DEFAULT_MORPH_SETTINGS = {
  baseUrl: DEFAULT_BASE_URL,
  apiKeys: [],
  roundRobinEnabled: false,
  fastApplyModel: "morph-v3-fast",
};

const EMPTY_USAGE_STATS = {
  totalRequests: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCredits: 0,
  totalRequestsLifetime: 0,
  byCapability: {},
  byModel: {},
  byApiKey: {},
  byEntrypoint: {},
  recentRequests: [],
};

type MorphUsageData = {
  usageStats: typeof EMPTY_USAGE_STATS;
  requestLogs: any[];
};

type SettingsQueryData = {
  morph?: any;
  settings?: {
    morph?: any;
  };
  [key: string]: any;
};

const MORPH_ROUTE_EXAMPLES = [
  {
    path: "/morphllm/v1/chat/completions",
    method: "POST",
    target: "Morph native chat facade",
  },
  {
    path: "/morphllm/v1/compact",
    method: "POST",
    target: "Morph compact",
  },
  {
    path: "/morphllm/v1/models",
    method: "GET",
    target: "Morph model discovery",
  },
];

function getMorphKeySortPriority(entry) {
  if (entry?.status === "inactive") return 0;
  if (entry?.status === "cooldown") return 1;
  if (entry?.status === "exhausted") return 2;
  if (entry?.status === "unknown") return 3;
  if (entry?.status === "active") return 4;
  return 5;
}

function sortMorphApiKeysForDisplay(apiKeys = []) {
  return [...apiKeys].sort((left, right) => {
    const priorityDiff = getMorphKeySortPriority(left) - getMorphKeySortPriority(right);
    if (priorityDiff !== 0) return priorityDiff;
    return String(left?.email || "").localeCompare(String(right?.email || ""));
  });
}

function normalizeMorphSettings(settings: any = {}) {
  const apiKeys = Array.isArray(settings.apiKeys)
    ? settings.apiKeys
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
          const email = typeof entry.email === "string" ? entry.email.trim().toLowerCase() : "";
          const key = typeof entry.key === "string" ? entry.key : "";
          if (!email || !key.trim()) return null;
          return {
            ...EMPTY_MORPH_KEY,
            ...entry,
            email,
            key,
          };
        })
        .filter(Boolean)
    : [];

  return {
    baseUrl:
      typeof settings.baseUrl === "string" && settings.baseUrl.trim().length > 0
        ? settings.baseUrl
        : DEFAULT_BASE_URL,
    apiKeys,
    roundRobinEnabled: Boolean(settings.roundRobinEnabled),
    fastApplyModel:
      typeof settings.fastApplyModel === "string" && settings.fastApplyModel.trim().length > 0
        ? settings.fastApplyModel.trim()
        : "morph-v3-fast",
  };
}

function buildValidationMessage(apiKeys) {
  if (apiKeys.length === 0) {
    return "Add at least one Morph API key.";
  }

  return "";
}

function normalizeForCompare(value) {
  return {
    baseUrl: value.baseUrl.trim(),
    apiKeys: value.apiKeys.map((entry) => ({
      email: entry.email,
      key: entry.key.trim(),
      status: entry.status || "inactive",
      isExhausted: entry.isExhausted === true,
      lastCheckedAt: entry.lastCheckedAt || null,
      lastError: entry.lastError || "",
    })),
    roundRobinEnabled: Boolean(value.roundRobinEnabled),
    fastApplyModel: typeof value.fastApplyModel === "string" && value.fastApplyModel.trim().length > 0
      ? value.fastApplyModel.trim()
      : "morph-v3-fast",
  };
}

function parseBulkMorphApiKeys(text) {
  const byEmail = new Map();
  const lines = String(text || "").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [rawEmail, ...rest] = trimmed.split("|");
    const email = (rawEmail || "").trim().toLowerCase();
    const key = rest.join("|").trim();
    if (!email || !key) {
      throw new Error("Each line must use the format email|apikey");
    }

    byEmail.set(email, {
      ...EMPTY_MORPH_KEY,
      email,
      key,
    });
  }

  return Array.from(byEmail.values());
}

function mergeMorphApiKeys(currentKeys, importedKeys) {
  const merged = new Map(currentKeys.map((entry) => [entry.email, entry]));
  for (const entry of importedKeys) {
    const existing = merged.get(entry.email);
    merged.set(entry.email, {
      ...EMPTY_MORPH_KEY,
      ...((existing as any) || {}),
      ...entry,
      status: "inactive",
      isExhausted: false,
      lastCheckedAt: null,
      lastError: "",
    });
  }
  return Array.from(merged.values());
}

function formatMorphKeyStatus(entry) {
  if (entry.status === "active") return "Active";
  if (entry.status === "cooldown") return "Cooldown";
  if (entry.status === "exhausted") return "Exhausted";
  if (entry.status === "inactive") return "Invalid";
  if (entry.status === "unknown") return "Unverified";
  return "Inactive";
}

function getMorphKeyStatusTone(entry) {
  if (entry.status === "active") return "text-[var(--color-success)]";
  if (entry.status === "cooldown") return "text-[var(--color-warning)]";
  if (entry.status === "exhausted") return "text-[var(--color-warning)]";
  if (entry.status === "inactive") return "text-[var(--color-danger)]";
  if (entry.status === "unknown") return "text-[var(--color-info)]";
  return "text-[var(--color-text-muted)]";
}

function fmtNumber(value) {
  const v = Number(value || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function fmtCredits(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatStatus(status) {
  return status === "ok" ? "OK" : "FAILED";
}

function formatLocalDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function formatCapabilityLabel(value) {
  if (!value) return "All capabilities";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sortUsageEntries(entries = []) {
  return [...entries].sort(([, left], [, right]) => {
    const requestDiff = (right?.requests || 0) - (left?.requests || 0);
    if (requestDiff !== 0) return requestDiff;
    return String(left?.capability || left?.model || left?.email || left?.apiKeyLabel || left?.entrypoint || "").localeCompare(
      String(right?.capability || right?.model || right?.email || right?.apiKeyLabel || right?.entrypoint || "")
    );
  });
}

function UsageMetricCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon?: string }) {
  return (
    <Card className="relative overflow-hidden border-border/60 p-4 transition-colors hover:border-border">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-text-muted)]">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-text-main)]">{value}</p>
        </div>
        {icon && <AppIcon name={icon} size={18} className="text-[var(--color-primary)]/60" />}
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">{hint}</p>
    </Card>
  );
}

function buildMorphBrowserBaseUrl() {
  if (typeof window === "undefined") {
    return "/morphllm";
  }

  return `${window.location.origin}/morphllm`;
}

export default function MorphPageClient() {
  const { getQueryValue, updateQueryParams } = useUrlQueryControls({
    fallbackPath: "/app/morph",
  });
  const tabFromUrl = getQueryValue("tab", "");
  const activeTab = tabFromUrl === "usage" ? "usage" : "settings";
  const queryClient = useQueryClient();
  const morphSettingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: ({ signal }) => fetchJson<SettingsQueryData>("/api/settings", { signal }),
  });
  const [savingMorphSettings, setSavingMorphSettings] = useState(false);
  const [morphFeedback, setMorphFeedback] = useState({ type: "", message: "" });
  const [validationMessage, setValidationMessage] = useState("");
  const [usagePeriod, setUsagePeriod] = useState("7d");
  const morphUsageQuery = useQuery({
    queryKey: queryKeys.morphUsage(usagePeriod),
    queryFn: async ({ signal }) => {
      const [statsData, requestsData] = await Promise.all([
        fetchJson(`/api/morph/usage/stats?period=${usagePeriod}`, { signal }),
        fetchJson("/api/morph/usage/requests?limit=200", { signal }),
      ]);
      return {
        usageStats: { ...EMPTY_USAGE_STATS, ...(statsData as Partial<typeof EMPTY_USAGE_STATS>) },
        requestLogs: Array.isArray(requestsData) ? requestsData : [],
      };
    },
    enabled: activeTab === "usage",
    initialData: {
      usageStats: EMPTY_USAGE_STATS,
      requestLogs: [],
    },
  });
  const usageStats = morphUsageQuery.data?.usageStats || EMPTY_USAGE_STATS;
  const usageLoading = morphUsageQuery.isPending;
  const usageLoadError = morphUsageQuery.error?.message || "";
  const keyRequestCounts = useQuery({
    queryKey: ["morph-key-request-counts"],
    queryFn: async ({ signal }) => {
      const stats: any = await fetchJson("/api/morph/usage/stats?period=all", { signal });
      const map: Record<string, number> = {};
      for (const [key, value] of Object.entries(stats?.byApiKey || {})) {
        map[(value as any).apiKeyLabel || key] = (value as any).requests || 0;
      }
      return map;
    },
    enabled: activeTab === "settings",
    staleTime: 60_000,
  });
  const keyRequests = keyRequestCounts.data || {};
  const requestLogs = useMemo(() => morphUsageQuery.data?.requestLogs || [], [morphUsageQuery.data]);
  const [requestCapabilityFilter, setRequestCapabilityFilter] = useState("all");
  const [requestPage, setRequestPage] = useState(1);
  const [requestAutoRefresh, setRequestAutoRefresh] = useState(true);
  const [emailBreakdownSearch, setEmailBreakdownSearch] = useState("");
  const [emailBreakdownPage, setEmailBreakdownPage] = useState(1);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportValue, setBulkImportValue] = useState("");
  const [bulkImportSaving, setBulkImportSaving] = useState(false);
  const [testingKeyEmail, setTestingKeyEmail] = useState("");
  const [testAllProgress, setTestAllProgress] = useState({ current: 0, total: 0 });
  const [shouldFocusInvalidKey, setShouldFocusInvalidKey] = useState(false);
  const [highlightedInvalidKeyEmail, setHighlightedInvalidKeyEmail] = useState("");
  const [apiKeysPage, setApiKeysPage] = useState(1);
  const [apiKeysSearch, setApiKeysSearch] = useState("");
  const invalidKeyRef = useRef(null);
  const [browserMorphBaseUrl, setBrowserMorphBaseUrl] = useState("/morphllm");
  const morphUsageRefresh = morphUsageQuery.refetch;
  const loadMorphUsage = () => void morphUsageRefresh();

  const settingsPayload = morphSettingsQuery.data?.morph || morphSettingsQuery.data?.settings?.morph;
  const loadingMorphSettings = morphSettingsQuery.isPending && !morphSettingsQuery.data;
  const savedMorphSettings = useMemo(
    () => normalizeMorphSettings(settingsPayload || DEFAULT_MORPH_SETTINGS),
    [settingsPayload]
  );
  const savedMorphSettingsSnapshot = useMemo(
    () => JSON.stringify(normalizeForCompare(savedMorphSettings)),
    [savedMorphSettings]
  );
  const [draftMorphSettings, setDraftMorphSettings] = useState(null);
  const draftMorphSettingsSnapshot = useMemo(
    () => (draftMorphSettings ? JSON.stringify(normalizeForCompare(draftMorphSettings)) : null),
    [draftMorphSettings]
  );
  const hasDraftChanges = draftMorphSettingsSnapshot !== null && draftMorphSettingsSnapshot !== savedMorphSettingsSnapshot;
  const morphSettings = hasDraftChanges ? draftMorphSettings : savedMorphSettings;
  const sortedMorphApiKeys = useMemo(() => sortMorphApiKeysForDisplay(morphSettings.apiKeys), [morphSettings.apiKeys]);

  // Search + Pagination for API keys
  const filteredMorphApiKeys = useMemo(() => {
    if (!apiKeysSearch.trim()) return sortedMorphApiKeys;
    const q = apiKeysSearch.trim().toLowerCase();
    return sortedMorphApiKeys.filter((entry) =>
      (entry.email || "").toLowerCase().includes(q) ||
      (entry.key || "").toLowerCase().includes(q)
    );
  }, [sortedMorphApiKeys, apiKeysSearch]);
  const invalidMorphApiKeysCount = sortedMorphApiKeys.filter((entry) => entry.status === "inactive").length;
  const totalApiKeysPages = Math.max(1, Math.ceil(filteredMorphApiKeys.length / API_KEYS_PAGE_SIZE));
  const currentApiKeysPage = Math.min(Math.max(1, apiKeysPage), totalApiKeysPages);
  const paginatedApiKeys = filteredMorphApiKeys.slice(
    (currentApiKeysPage - 1) * API_KEYS_PAGE_SIZE,
    currentApiKeysPage * API_KEYS_PAGE_SIZE
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateMorphBaseUrl = () => setBrowserMorphBaseUrl(buildMorphBrowserBaseUrl());
    const timeoutId = window.setTimeout(updateMorphBaseUrl, 0);
    window.addEventListener("popstate", updateMorphBaseUrl);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("popstate", updateMorphBaseUrl);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "usage" || !requestAutoRefresh) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      if (!document.hidden) void morphUsageRefresh();
    }, REQUEST_LOG_AUTO_REFRESH_MS);

    return () => clearInterval(intervalId);
  }, [activeTab, requestAutoRefresh, usagePeriod, morphUsageRefresh]);

  useEffect(() => {
    if (!shouldFocusInvalidKey || testingKeyEmail === "__all__") {
      return undefined;
    }

    const firstInvalidKey = sortedMorphApiKeys.find((entry) => entry.status === "inactive");
    if (!firstInvalidKey || !invalidKeyRef.current) {
      return undefined;
    }

    invalidKeyRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedInvalidKeyEmail(firstInvalidKey.email);
    setShouldFocusInvalidKey(false);

    const timeoutId = setTimeout(() => {
      setHighlightedInvalidKeyEmail((current) => (current === firstInvalidKey.email ? "" : current));
    }, 2500);

    return () => clearTimeout(timeoutId);
  }, [shouldFocusInvalidKey, testingKeyEmail, sortedMorphApiKeys]);

  const persistMorphSettings = async (nextSettings) => {
    const nextValidationMessage = buildValidationMessage(nextSettings.apiKeys);

    if (nextValidationMessage) {
      setValidationMessage(nextValidationMessage);
      setMorphFeedback({ type: "", message: "" });
      return false;
    }

    if (JSON.stringify(normalizeForCompare(nextSettings)) === savedMorphSettingsSnapshot) {
      setValidationMessage("");
      return true;
    }

    setSavingMorphSettings(true);
    setMorphFeedback({ type: "info", message: "Saving Morph settings..." });

    try {
      await saveMorphSettingsMutation.mutateAsync(nextSettings);
      return true;
    } catch (error) {
      setMorphFeedback({ type: "error", message: error.message || "Failed to save Morph settings" });
      return false;
    } finally {
      setSavingMorphSettings(false);
    }
  };

  const saveMorphSettingsMutation = useMutation({
    retry: false,
    mutationFn: async (nextSettings: any) => {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          morph: {
            baseUrl: nextSettings.baseUrl.trim(),
            apiKeys: nextSettings.apiKeys.map((entry) => ({
              email: entry.email.trim().toLowerCase(),
              key: entry.key,
              status: entry.status || "inactive",
              isExhausted: entry.isExhausted === true,
              lastCheckedAt: entry.lastCheckedAt || null,
              lastError: entry.lastError || "",
            })),
            roundRobinEnabled: nextSettings.roundRobinEnabled,
            fastApplyModel: nextSettings.fastApplyModel,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to save Morph settings");
      }

      return { data, nextSettings };
    },
    onSuccess: async ({ data, nextSettings }) => {
      const normalized = normalizeMorphSettings(data.settings?.morph || data.morph || nextSettings);
      setDraftMorphSettings(null);
      queryClient.setQueryData<SettingsQueryData>(queryKeys.settings(), (current) => ({
        ...((current || {}) as SettingsQueryData),
        ...(data || {}),
        morph: normalized,
      }));
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
      setValidationMessage("");
      setMorphFeedback({ type: "success", message: "Morph settings saved." });
    },
  });

  const testMorphKeyMutation = useMutation({
    retry: false,
    mutationFn: async (email: string) => {
      const response = await fetch("/api/morph/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `${email} is not active`);
      }
      return email;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
    },
  });

  const handleAddApiKey = () => {
    setBulkImportValue("");
    setBulkImportOpen(true);
  };

  const handleSaveBulkImport = async () => {
    setBulkImportSaving(true);
    try {
      const importedKeys = parseBulkMorphApiKeys(bulkImportValue);
      if (importedKeys.length === 0) {
        throw new Error("Add at least one email|apikey row.");
      }

      const nextSettings = {
        ...morphSettings,
        apiKeys: mergeMorphApiKeys(morphSettings.apiKeys, importedKeys),
      };

      setDraftMorphSettings(nextSettings);
      setValidationMessage("");
      const saved = await persistMorphSettings(nextSettings);
      if (saved) {
        setBulkImportOpen(false);
        setBulkImportValue("");
      }
    } catch (error) {
      setMorphFeedback({ type: "error", message: error.message || "Failed to import Morph API keys" });
    } finally {
      setBulkImportSaving(false);
    }
  };

  const handleRemoveApiKey = async (index) => {
    const nextApiKeys = morphSettings.apiKeys.filter((_, keyIndex) => keyIndex !== index);
    const nextSettings = {
      ...morphSettings,
      apiKeys: nextApiKeys,
    };

    setDraftMorphSettings(nextSettings);
    setValidationMessage("");
    await persistMorphSettings(nextSettings);
  };

  const handleDeleteInvalidApiKeys = async () => {
    const nextApiKeys = morphSettings.apiKeys.filter((entry) => entry.status !== "inactive");
    const removedCount = morphSettings.apiKeys.length - nextApiKeys.length;
    if (removedCount <= 0) {
      setMorphFeedback({ type: "info", message: "No invalid Morph API keys to delete." });
      return;
    }

    const nextSettings = {
      ...morphSettings,
      apiKeys: nextApiKeys,
    };

    setDraftMorphSettings(nextSettings);
    setValidationMessage("");
    const saved = await persistMorphSettings(nextSettings);
    if (saved) {
      setApiKeysPage(1);
      setHighlightedInvalidKeyEmail("");
      setShouldFocusInvalidKey(false);
      setMorphFeedback({ type: "success", message: `Deleted ${removedCount} invalid Morph API key(s).` });
    }
  };

  const handleTestApiKey = async (email) => {
    setTestingKeyEmail(email);
    setMorphFeedback({ type: "info", message: `Testing ${email}...` });
    try {
      const testedEmail = await testMorphKeyMutation.mutateAsync(email);
      setMorphFeedback({ type: "success", message: `${testedEmail} is active.` });
    } catch (error) {
      setMorphFeedback({ type: "error", message: error.message || `Failed to test ${email}` });
    } finally {
      setTestingKeyEmail("");
    }
  };

  const handleTestAllApiKeys = async () => {
    if (morphSettings.apiKeys.length === 0) return;

    const total = morphSettings.apiKeys.length;
    setTestingKeyEmail("__all__");
    setTestAllProgress({ current: 0, total });
    setMorphFeedback({ type: "info", message: `Testing 0 of ${total} Morph key(s)...` });

    let successCount = 0;
    let failureCount = 0;
    let completedCount = 0;

    const testSingleKey = async (apiKey) => {
      try {
        await testMorphKeyMutation.mutateAsync(apiKey.email);
        successCount += 1;
      } catch {
        failureCount += 1;
      } finally {
        completedCount += 1;
        setMorphFeedback({ type: "info", message: `Testing ${completedCount} of ${total} Morph key(s)...` });
        setTestAllProgress({ current: completedCount, total });
      }
    };

    for (let index = 0; index < morphSettings.apiKeys.length; index += MORPH_TEST_ALL_CONCURRENCY) {
      const batch = morphSettings.apiKeys.slice(index, index + MORPH_TEST_ALL_CONCURRENCY);
      await Promise.all(batch.map((apiKey) => testSingleKey(apiKey)));
    }

    setTestingKeyEmail("");
    setTestAllProgress({ current: 0, total: 0 });
    setShouldFocusInvalidKey(failureCount > 0);

    if (failureCount === 0) {
      setMorphFeedback({ type: "success", message: `All ${successCount} Morph key(s) are active.` });
      return;
    }

    if (successCount === 0) {
      setMorphFeedback({ type: "error", message: `All ${failureCount} Morph key(s) failed testing.` });
      return;
    }

    setMorphFeedback({
      type: "info",
      message: `${successCount} Morph key(s) active, ${failureCount} failed.`,
    });
  };

  const handleRoundRobinChange = async (checked) => {
    const nextSettings = {
      ...morphSettings,
      roundRobinEnabled: checked,
    };

    setDraftMorphSettings(nextSettings);
    setValidationMessage("");
    await persistMorphSettings(nextSettings);
  };

  const handleFastApplyModelChange = async (value) => {
    const nextSettings = {
      ...morphSettings,
      fastApplyModel: value,
    };

    setDraftMorphSettings(nextSettings);
    setValidationMessage("");
    await persistMorphSettings(nextSettings);
  };

  const capabilityFilterOptions = useMemo(() => {
    const capabilityKeys = Object.keys(usageStats.byCapability || {});
    return ["all", ...capabilityKeys];
  }, [usageStats.byCapability]);

  const filteredRequestLogs = useMemo(() => {
    if (requestCapabilityFilter === "all") {
      return requestLogs;
    }

    return requestLogs.filter((entry) => entry.capability === requestCapabilityFilter);
  }, [requestCapabilityFilter, requestLogs]);

  const latestEntrypointByApiKey = useMemo(() => {
    const map = new Map();
    for (const entry of requestLogs) {
      const key = entry.apiKeyLabel || "Unknown email";
      if (!map.has(key) && entry.entrypoint) {
        map.set(key, entry.entrypoint);
      }
    }
    return map;
  }, [requestLogs]);

  const sortedEmailUsageEntries = useMemo(() => {
    return sortUsageEntries(Object.entries(usageStats.byApiKey || {}));
  }, [usageStats.byApiKey]);

  const filteredEmailUsageEntries = useMemo(() => {
    const search = emailBreakdownSearch.trim().toLowerCase();
    if (!search) {
      return sortedEmailUsageEntries;
    }

    return sortedEmailUsageEntries.filter(([key, value]) => {
      const label = String(value?.apiKeyLabel || key || "").toLowerCase();
      const searchValues = [
        label,
        String(value?.inputTokens ?? "").toLowerCase(),
        String(value?.outputTokens ?? "").toLowerCase(),
        String(value?.requests ?? "").toLowerCase(),
        String(value?.credits ?? "").toLowerCase(),
        fmtNumber(value?.inputTokens).toLowerCase(),
        fmtNumber(value?.outputTokens).toLowerCase(),
        fmtNumber(value?.requests).toLowerCase(),
        fmtCredits(value?.credits).toLowerCase(),
      ];
      return searchValues.some((entry) => entry.includes(search));
    });
  }, [emailBreakdownSearch, sortedEmailUsageEntries]);

  const totalEmailBreakdownPages = Math.max(1, Math.ceil(filteredEmailUsageEntries.length / EMAIL_BREAKDOWN_PAGE_SIZE));
  const currentEmailBreakdownPage = Math.min(emailBreakdownPage, totalEmailBreakdownPages);

  const paginatedEmailUsageEntries = useMemo(() => {
    const startIndex = (currentEmailBreakdownPage - 1) * EMAIL_BREAKDOWN_PAGE_SIZE;
    return filteredEmailUsageEntries.slice(startIndex, startIndex + EMAIL_BREAKDOWN_PAGE_SIZE);
  }, [currentEmailBreakdownPage, filteredEmailUsageEntries]);

  const handleEmailBreakdownSearchChange = (value) => {
    setEmailBreakdownSearch(value);
    setEmailBreakdownPage(1);
  };

  const totalRequestPages = Math.max(1, Math.ceil(filteredRequestLogs.length / REQUEST_LOG_PAGE_SIZE));
  const currentRequestPage = Math.min(requestPage, totalRequestPages);

  const paginatedRequestLogs = useMemo(() => {
    const startIndex = (currentRequestPage - 1) * REQUEST_LOG_PAGE_SIZE;
    return filteredRequestLogs.slice(startIndex, startIndex + REQUEST_LOG_PAGE_SIZE);
  }, [currentRequestPage, filteredRequestLogs]);

  const handleRequestCapabilityFilterChange = (value) => {
    setRequestCapabilityFilter(value);
    setRequestPage(1);
  };

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    updateQueryParams({ tab: value === "usage" ? "usage" : null });
  };

  const feedbackToneClassName =
    morphFeedback.type === "error"
      ? "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-text-main)]"
      : morphFeedback.type === "success"
        ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-text-main)]"
        : "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-text-main)]";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text-main)]">Morph</h1>
          <p className="max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">
            Manage the single Morph configuration surface for key rotation, native `/morphllm/*` access, and shared fast-model routing into `/v1/*` and `/v1/messages`.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "settings" ? (
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-4 rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-4 py-4">
              <div className="flex items-center gap-2">
                <AppIcon name="route" size={18} className="text-[var(--color-accent)]" />
                <p className="text-sm font-medium text-[var(--color-text-main)]">Connection Info</p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-[var(--color-text-main)]">Base URL</p>
                  <p className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 font-mono text-sm text-[var(--color-text-main)]">
                    {browserMorphBaseUrl}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-[var(--color-text-main)]">Available endpoints</p>
                  <div className="grid gap-2">
                    {MORPH_ROUTE_EXAMPLES.map((route) => (
                      <div
                        key={route.path}
                        className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-4 py-2"
                      >
                        <span className="font-mono text-sm text-[var(--color-text-main)]">{route.path}</span>
                        <span className="text-xs uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                          {route.method}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <CardContent className="flex flex-col gap-6 border-t border-[var(--color-border)] p-6">

            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-main)]">Morph settings</h2>
              <p className="text-sm leading-6 text-[var(--color-text-muted)]">
                Bulk import Morph keys with <code>email|apikey</code>, validate them immediately, and keep invalid or exhausted keys out of rotation automatically.
              </p>
            </div>

            {morphFeedback.message ? (
              <div className={`rounded border px-4 py-3 text-sm ${feedbackToneClassName}`}>{morphFeedback.message}</div>
            ) : null}

            <div className="flex flex-col gap-4 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium text-[var(--color-text-main)]">API keys</h3>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Duplicate emails replace older keys automatically.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleTestAllApiKeys}
                    disabled={loadingMorphSettings || savingMorphSettings || morphSettings.apiKeys.length === 0}
                  >
                    {testingKeyEmail === "__all__" && testAllProgress.total > 0
                      ? `Testing ${testAllProgress.current} / ${testAllProgress.total}`
                      : "Test all"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleDeleteInvalidApiKeys}
                    disabled={loadingMorphSettings || savingMorphSettings || testingKeyEmail === "__all__" || invalidMorphApiKeysCount === 0}
                  >
                    <AppIcon name="delete" size={14} />
                    Delete invalid{invalidMorphApiKeysCount > 0 ? ` (${invalidMorphApiKeysCount})` : ""}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddApiKey}
                    disabled={loadingMorphSettings || savingMorphSettings}
                  >
                    Add key
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {sortedMorphApiKeys.length > 3 && (
                  <input
                    type="text"
                    placeholder="Search email or API key..."
                    value={apiKeysSearch}
                    onChange={(e) => { setApiKeysSearch(e.target.value); setApiKeysPage(1); }}
                    className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                  />
                )}
                {paginatedApiKeys.length === 0 ? (
                  <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-8 text-center">
                    <p className="text-sm text-[var(--color-text-muted)]">{apiKeysSearch ? "No keys match your search." : "No API keys added yet."}</p>
                    {!apiKeysSearch && <p className="mt-1 text-xs text-[var(--color-text-muted)]">Click &quot;Add key&quot; to import your first Morph API key.</p>}
                  </div>
                ) : (
                  paginatedApiKeys.map((apiKey) => {
                    const actualIndex = morphSettings.apiKeys.findIndex((entry) => entry.email === apiKey.email);
                    return (
                      <div
                        key={apiKey.email || `morph-api-key-${actualIndex}`}
                        ref={apiKey.status === "inactive" ? invalidKeyRef : null}
                        className={`rounded border bg-[var(--color-bg)] px-4 py-3 transition-all duration-300 ${highlightedInvalidKeyEmail === apiKey.email ? "border-[var(--color-danger)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_16%,transparent)]" : "border-[var(--color-border)]"}`}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm text-[var(--color-text-main)]">{apiKey.email}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">
                                {apiKey.lastCheckedAt ? `Last checked ${formatLocalDateTime(apiKey.lastCheckedAt)}` : "Checking key status..."}
                                {apiKey.status === "cooldown" && apiKey.nextRetryAt ? ` · Retry after ${formatLocalDateTime(apiKey.nextRetryAt)}` : ""}
                                {keyRequests[apiKey.email] != null && ` · ${fmtNumber(keyRequests[apiKey.email])} req`}
                              </p>
                            </div>
                            <span className={`text-xs font-medium uppercase tracking-[0.08em] ${getMorphKeyStatusTone(apiKey)}`}>
                              {formatMorphKeyStatus(apiKey)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                              {apiKey.key.length > 10 ? `${apiKey.key.slice(0, 6)}...${apiKey.key.slice(-4)}` : apiKey.key}
                            </div>
                            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                
                                onClick={() => handleTestApiKey(apiKey.email)}
                                
                                disabled={loadingMorphSettings || savingMorphSettings || testingKeyEmail === "__all__"}
                              >
                                Test
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                
                                onClick={() => handleRemoveApiKey(actualIndex)}
                                disabled={loadingMorphSettings || savingMorphSettings || testingKeyEmail === apiKey.email || testingKeyEmail === "__all__"}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                          {apiKey.lastError ? (
                            <p className="text-xs text-[var(--color-warning)]">{apiKey.lastError}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Pagination */}
                {filteredMorphApiKeys.length > API_KEYS_PAGE_SIZE && (
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Showing {((currentApiKeysPage - 1) * API_KEYS_PAGE_SIZE) + 1}-{Math.min(currentApiKeysPage * API_KEYS_PAGE_SIZE, filteredMorphApiKeys.length)} of {filteredMorphApiKeys.length} keys{apiKeysSearch ? ` (filtered)` : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Previous API keys page"
                        title="Previous page"
                        onClick={() => setApiKeysPage((p) => Math.max(1, p - 1))}
                        disabled={currentApiKeysPage <= 1 || loadingMorphSettings || savingMorphSettings}
                      >
                        <AppIcon name="chevronleft" size={16} />
                      </Button>
                      <span className="text-sm text-[var(--color-text-muted)]">
                        Page {currentApiKeysPage} of {totalApiKeysPages}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Next API keys page"
                        title="Next page"
                        onClick={() => setApiKeysPage((p) => Math.min(totalApiKeysPages, p + 1))}
                        disabled={currentApiKeysPage >= totalApiKeysPages || loadingMorphSettings || savingMorphSettings}
                      >
                        <AppIcon name="chevronright" size={16} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-4 py-3">
              <input
                type="checkbox"
                checked={morphSettings.roundRobinEnabled}
                onChange={(event) => handleRoundRobinChange(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[var(--color-text-main)]">Round-robin keys</span>
                <span className="text-sm leading-6 text-[var(--color-text-muted)]">
                  When round-robin is off, the first active email stays primary and later emails are failover-only.
                </span>
              </span>
            </label>

            <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-4 py-3">
              <label className="flex flex-col gap-2 text-sm font-medium text-[var(--color-text-main)]">
                <span>Fast Apply model</span>
                <select
                  value={morphSettings.fastApplyModel}
                  onChange={(event) => void handleFastApplyModelChange(event.target.value)}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm text-[var(--color-text-main)] outline-none transition-colors focus:border-[var(--color-primary)]"
                >
                  <option value="morph-v3-fast">morph-v3-fast</option>
                  <option value="morph-v3-large">morph-v3-large</option>
                  <option value="auto">auto</option>
                </select>
              </label>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                Choose which Morph Apply model should power internal fast-apply interception for edit and existing-file write mutations.
              </p>
            </div>

            {validationMessage ? (
              <div className="rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-text-main)]">
                {validationMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-main)]">Morph usage</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Combined Morph Core <code className="rounded bg-[var(--color-bg-alt)] px-1 py-0.5 text-xs">/morphllm/*</code> and Fast Models <code className="rounded bg-[var(--color-bg-alt)] px-1 py-0.5 text-xs">/v1/*</code> traffic.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={usagePeriod} onValueChange={setUsagePeriod}>
                <TabsList>
                  {PERIOD_OPTIONS.map((option) => <TabsTrigger key={option.value} value={option.value}>{option.label}</TabsTrigger>)}
                </TabsList>
              </Tabs>
              <Button type="button" variant="secondary" className="h-11 w-9 px-0" onClick={loadMorphUsage} title="Refresh usage data">
                <AppIcon name="refresh" size={14} />
              </Button>
            </div>
          </div>

          {usageLoading && usageStats.totalRequests === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-4 py-8 text-sm text-[var(--color-text-muted)]">
              <AppIcon name="loader" size={16} className="animate-spin" />
              Loading usage data...
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <UsageMetricCard label="Requests" value={fmtNumber(usageStats.totalRequests)} hint={`In the last ${usagePeriod}`} icon="info" />
              <UsageMetricCard label="Input tokens" value={fmtNumber(usageStats.totalInputTokens)} hint="Total ingress tokens" icon="arrowdownward" />
              <UsageMetricCard label="Output tokens" value={fmtNumber(usageStats.totalOutputTokens)} hint="Total egress tokens" icon="arrowupward" />
              <UsageMetricCard label="Credits" value={fmtCredits(usageStats.totalCredits)} hint="Official Morph pricing" icon="bolt" />
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="border-border/60 p-0">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
                <AppIcon name="layers" size={15} className="text-[var(--color-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">By capability</h3>
                <span className="ml-auto text-xs text-[var(--color-text-muted)]">{Object.keys(usageStats.byCapability || {}).length}</span>
              </div>
              <div className="overflow-x-auto">
                {Object.keys(usageStats.byCapability || {}).length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No data yet</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]/60 text-xs text-[var(--color-text-muted)]">
                        <th className="px-4 py-2 font-medium">Capability</th>
                        <th className="px-4 py-2 text-right font-medium">Req</th>
                        <th className="px-4 py-2 text-right font-medium">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortUsageEntries(Object.entries(usageStats.byCapability || {})).map(([key, value]) => (
                        <tr key={key} className="border-b border-[var(--color-border)]/40 last:border-0">
                          <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-main)]">{value.capability || key}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtNumber(value.requests)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtCredits(value.credits)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            <Card className="border-border/60 p-0">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
                <AppIcon name="psychology" size={15} className="text-[var(--color-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">By model</h3>
                <span className="ml-auto text-xs text-[var(--color-text-muted)]">{Object.keys(usageStats.byModel || {}).length}</span>
              </div>
              <div className="overflow-x-auto">
                {Object.keys(usageStats.byModel || {}).length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No data yet</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]/60 text-xs text-[var(--color-text-muted)]">
                        <th className="px-4 py-2 font-medium">Model</th>
                        <th className="px-4 py-2 text-right font-medium">In</th>
                        <th className="px-4 py-2 text-right font-medium">Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortUsageEntries(Object.entries(usageStats.byModel || {})).map(([key, value]) => (
                        <tr key={key} className="border-b border-[var(--color-border)]/40 last:border-0">
                          <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-main)]">{value.model || key}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtNumber(value.inputTokens)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtNumber(value.outputTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            <Card className="border-border/60 p-0">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
                <AppIcon name="route" size={15} className="text-[var(--color-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">By entrypoint</h3>
                <span className="ml-auto text-xs text-[var(--color-text-muted)]">{Object.keys(usageStats.byEntrypoint || {}).length}</span>
              </div>
              <div className="overflow-x-auto">
                {Object.keys(usageStats.byEntrypoint || {}).length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No data yet</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]/60 text-xs text-[var(--color-text-muted)]">
                        <th className="px-4 py-2 font-medium">Entrypoint</th>
                        <th className="px-4 py-2 text-right font-medium">Req</th>
                        <th className="px-4 py-2 text-right font-medium">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortUsageEntries(Object.entries(usageStats.byEntrypoint || {})).map(([key, value]) => (
                        <tr key={key} className="border-b border-[var(--color-border)]/40 last:border-0">
                          <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-main)]">{value.entrypoint || key}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtNumber(value.requests)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtCredits(value.credits)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          </div>

          <Card className="border-border/60 p-0">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <AppIcon name="face" size={15} className="text-[var(--color-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">By email</h3>
                <span className="text-xs text-[var(--color-text-muted)]">({fmtNumber(filteredEmailUsageEntries.length)})</span>
              </div>
              <div className="relative w-full sm:max-w-[260px]">
                <AppIcon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  value={emailBreakdownSearch}
                  onChange={(event) => handleEmailBreakdownSearchChange(event.target.value)}
                  placeholder="Search..."
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 pl-8 pr-3 text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredEmailUsageEntries.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{emailBreakdownSearch ? "No results match your search." : "No email usage data yet."}</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]/60 text-xs text-[var(--color-text-muted)]">
                      <th className="px-4 py-2 font-medium">Email</th>
                      <th className="px-4 py-2 text-right font-medium">In</th>
                      <th className="px-4 py-2 text-right font-medium">Out</th>
                      <th className="px-4 py-2 text-right font-medium">Req</th>
                      <th className="px-4 py-2 text-right font-medium">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEmailUsageEntries.map(([key, value]) => (
                      <tr key={key} className="border-b border-[var(--color-border)]/40 last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="block truncate font-mono text-xs text-[var(--color-text-main)]">{value.apiKeyLabel || key}</span>
                          <span className="block truncate font-mono text-[11px] text-[var(--color-text-muted)]">{latestEntrypointByApiKey.get(value.apiKeyLabel || key) || ""}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtNumber(value.inputTokens)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtNumber(value.outputTokens)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtNumber(value.requests)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-muted)]">{fmtCredits(value.credits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {totalEmailBreakdownPages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2.5">
                <span className="text-xs text-[var(--color-text-muted)]">Page {currentEmailBreakdownPage}/{totalEmailBreakdownPages}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setEmailBreakdownPage((c) => Math.max(1, c - 1))} disabled={currentEmailBreakdownPage === 1}>
                    <AppIcon name="chevronleft" size={14} />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setEmailBreakdownPage((c) => Math.min(totalEmailBreakdownPages, c + 1))} disabled={currentEmailBreakdownPage === totalEmailBreakdownPages}>
                    <AppIcon name="chevronright" size={14} />
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="border-border/60 p-0">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <AppIcon name="scrolltext" size={15} className="text-[var(--color-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Request logs</h3>
                <span className="rounded bg-[var(--color-bg-alt)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--color-text-muted)]">
                  {fmtNumber(usageStats.totalRequestsLifetime)} lifetime
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <input
                    type="checkbox"
                    checked={requestAutoRefresh}
                    onChange={(event) => setRequestAutoRefresh(event.target.checked)}
                    className="size-3.5 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                  />
                  Auto-refresh
                </label>
                <select
                  value={requestCapabilityFilter}
                  onChange={(event) => handleRequestCapabilityFilterChange(event.target.value)}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-primary)]"
                >
                  {capabilityFilterOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All" : formatCapabilityLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              {usageLoading && filteredRequestLogs.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[var(--color-text-muted)]">
                  <AppIcon name="loader" size={14} className="animate-spin" />
                  Loading...
                </div>
              ) : usageLoadError && filteredRequestLogs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-danger)]">{usageLoadError}</div>
              ) : filteredRequestLogs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No requests recorded yet.</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]/60 bg-[var(--color-bg-alt)]/50 text-xs text-[var(--color-text-muted)]">
                      <th className="px-4 py-2 font-medium">Time</th>
                      <th className="px-4 py-2 font-medium">Capability</th>
                      <th className="px-4 py-2 font-medium">Email</th>
                      <th className="px-4 py-2 font-medium">Model</th>
                      <th className="px-4 py-2 text-right font-medium">Tokens</th>
                      <th className="px-4 py-2 text-right font-medium">Credits</th>
                      <th className="px-4 py-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRequestLogs.map((entry, index) => (
                      <tr key={`${entry.timestamp}-${entry.capability}-${index}`} className="border-b border-[var(--color-border)]/40 last:border-0 transition-colors hover:bg-[var(--color-bg-alt)]/30">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-[var(--color-text-muted)]">{formatLocalDateTime(entry.timestamp)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-main)]">{entry.capability}</td>
                        <td className="px-4 py-2.5">
                          <span className="block truncate font-mono text-xs text-[var(--color-text-main)]">{entry.apiKeyLabel || "—"}</span>
                          <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{entry.entrypoint || ""}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-main)]">{entry.model || entry.requestedModel || "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="block text-xs tabular-nums text-[var(--color-text-muted)]">{fmtNumber(entry.inputTokens)}↓ {fmtNumber(entry.outputTokens)}↑</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--color-text-muted)]">{fmtCredits(entry.credits)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block size-2 rounded-full ${entry.status === "ok" ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"}`} title={formatStatus(entry.status)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {totalRequestPages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2.5">
                <span className="text-xs text-[var(--color-text-muted)]">Page {currentRequestPage}/{totalRequestPages} · {fmtNumber(filteredRequestLogs.length)} total</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setRequestPage((c) => Math.max(1, c - 1))} disabled={currentRequestPage === 1}>
                    <AppIcon name="chevronleft" size={14} />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setRequestPage((c) => Math.min(totalRequestPages, c + 1))} disabled={currentRequestPage === totalRequestPages}>
                    <AppIcon name="chevronright" size={14} />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <Dialog open={bulkImportOpen} onOpenChange={(open) => { if (!bulkImportSaving) setBulkImportOpen(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk import Morph API keys</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Add one key per line using `email|apikey`. If the email already exists, the new key replaces the old one automatically.
            </p>
            <textarea
              value={bulkImportValue}
              onChange={(event) => setBulkImportValue(event.target.value)}
              placeholder={"user@example.com|mk-live-123\nteam@example.com|mk-live-456"}
              className="min-h-[220px] w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-3 text-sm text-[var(--color-text-main)] outline-none transition-colors focus:border-[var(--color-primary)]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setBulkImportOpen(false)} disabled={bulkImportSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveBulkImport} disabled={bulkImportSaving}>
              Save keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
