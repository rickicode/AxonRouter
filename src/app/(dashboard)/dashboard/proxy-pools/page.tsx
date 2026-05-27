"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useNotificationStore } from "@/store/notificationStore";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { translate } from "@/i18n/runtime";

const POOLS_PAGE_SIZE = 20;
const BINDINGS_PAGE_SIZE = 30;

type ProviderConnection = {
  id: string;
  provider?: string;
  name?: string;
  email?: string;
  displayName?: string;
  isActive?: boolean;
  authType?: string;
  providerSpecificData?: {
    proxyPoolId?: string | null;
    proxyGroupId?: string | null;
    [key: string]: unknown;
  } | null;
};

type ProxyPoolRecord = {
  defaultProviderIds?: string[];
  defaultProviderCount?: number;
};

type ProxyGroup = {
  id: string;
  name: string;
  mode: "roundrobin" | "sticky";
  stickyLimit: number;
  strictProxy: boolean;
  proxyPoolIds: string[];
  isActive: boolean;
  boundConnectionCount?: number;
  defaultProviderCount?: number;
  defaultProviderIds?: string[];
  createdAt?: string;
  updatedAt?: string;
};

function getConnectionLabel(connection: ProviderConnection) {
  return connection.email || connection.displayName || connection.name || connection.id;
}

function getProviderLabel(providerId?: string) {
  if (!providerId) return "Unknown provider";
  return (AI_PROVIDERS as Record<string, any>)[providerId]?.name || providerId;
}

function getBoundConnections(proxyPoolId: string, connections: ProviderConnection[]) {
  return connections.filter((connection) => connection.providerSpecificData?.proxyPoolId === proxyPoolId);
}

function getStatusVariant(status) {
  if (status === "active" || status === "online") return "default";
  if (status === "error" || status === "offline") return "destructive";
  return "secondary";
}

function getPoolHealthLabel(status) {
  if (status === "active" || status === "online") return "online";
  if (status === "error" || status === "offline") return "offline";
  return "unknown";
}

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function detectProxyPoolType(proxyUrl: string): "http" | "relay" {
  try {
    const u = new URL(proxyUrl.trim());
    if (
      u.hostname.endsWith("workers.dev") ||
      u.hostname.endsWith("vercel.app") ||
      u.hostname.endsWith("now.sh")
    ) {
      return "relay";
    }
  } catch {
    // Keep default type when URL is incomplete/invalid during typing.
  }
  return "http";
}

function normalizeFormData(data: any = {}) {
  return {
    name: data.name || "",
    proxyUrl: data.proxyUrl || "",
    noProxy: data.noProxy || "",
    isActive: data.isActive !== false,
    strictProxy: data.strictProxy === true,
    type: data.type || detectProxyPoolType(data.proxyUrl || ""),
  };
}

function formatProxyPoolInUseMessage(data: any = {}, action: "delete" | "deactivate" = "delete") {
  const connectionCount = data.boundConnectionCount || 0;
  const providerDefaultCount = data.providerDefaultCount || 0;
  const providerList = Array.isArray(data.providerDefaultProviderIds) && data.providerDefaultProviderIds.length > 0
    ? ` ${translate("Provider defaults")}: ${data.providerDefaultProviderIds.join(", ")}.`
    : "";

  if (action === "deactivate") {
    return `${translate("Cannot deactivate")}: ${connectionCount} ${translate("connection override(s)")} ${translate("and")} ${providerDefaultCount} ${translate("provider default(s)")} ${translate("are still using this pool")}.${providerList}`;
  }

  return `${translate("Cannot delete")}: ${connectionCount} ${translate("connection override(s)")} ${translate("and")} ${providerDefaultCount} ${translate("provider default(s)")} ${translate("are still using this pool")}.${providerList}`;
}

function formatCascadeResultMessage(cascade: any = {}, action: "delete" | "deactivate" = "delete") {
  const parts: string[] = [];
  const clearedConnections = cascade.clearedConnections || 0;
  const clearedProviderDefaults = cascade.clearedProviderDefaults || 0;

  if (clearedConnections > 0) {
    parts.push(`${clearedConnections} ${translate("account override(s) cleared")}`);
  }
  if (clearedProviderDefaults > 0) {
    const providerNames = Array.isArray(cascade.clearedProviderIds) && cascade.clearedProviderIds.length > 0
      ? ` (${cascade.clearedProviderIds.join(", ")})`
      : "";
    parts.push(`${clearedProviderDefaults} ${translate("provider default(s) removed")}${providerNames}`);
  }

  if (parts.length === 0) return "";
  const verb = action === "delete" ? translate("Deleted") : translate("Deactivated");
  return `${verb}. ${translate("Cleaned up")}: ${parts.join(", ")}.`;
}

function PaginationControls({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: (number | "ellipsis")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("ellipsis");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("ellipsis");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1 pt-3">
      <Button variant="ghost" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="h-8 px-2 text-xs">‹</Button>
      {pages.map((page, idx) =>
        page === "ellipsis" ? (
          <span key={`e${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
        ) : (
          <Button key={page} variant={page === currentPage ? "default" : "ghost"} size="sm" onClick={() => onPageChange(page)} className="h-8 min-w-[32px] px-2 text-xs">{page}</Button>
        )
      )}
      <Button variant="ghost" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="h-8 px-2 text-xs">›</Button>
    </div>
  );
}

export default function ProxyPoolsPage() {
  const [proxyPools, setProxyPools] = useState<any[]>([]);
  const [providerConnections, setProviderConnections] = useState<ProviderConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showBatchImportModal, setShowBatchImportModal] = useState(false);
  const [showVercelModal, setShowVercelModal] = useState(false);
  const [editingProxyPool, setEditingProxyPool] = useState(null);
  const [formData, setFormData] = useState(normalizeFormData());
  const [formError, setFormError] = useState("");
  const [batchImportText, setBatchImportText] = useState("");
  const [vercelForm, setVercelForm] = useState({ vercelToken: "", projectName: "vercel-relay" });
  const [deploying, setDeploying] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testingBatchImport, setTestingBatchImport] = useState(false);
  const notify = useNotificationStore();
  const inv = useInvalidate();

  // Tab state
  const [activeTab, setActiveTab] = useState("pools");

  // Proxy Groups state
  const [proxyGroups, setProxyGroups] = useState<ProxyGroup[]>([]);
  const [showGroupFormModal, setShowGroupFormModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProxyGroup | null>(null);
  const [groupFormData, setGroupFormData] = useState({
    name: "",
    mode: "roundrobin" as "roundrobin" | "sticky",
    stickyLimit: 1,
    strictProxy: false,
    isActive: true,
    proxyPoolIds: [] as string[],
  });
  const [groupFormError, setGroupFormError] = useState("");
  const [showRemoveAllDialog, setShowRemoveAllDialog] = useState(false);
  const [removeAllGroupId, setRemoveAllGroupId] = useState<string | null>(null);

  // Pagination, search & filter state
  const [poolsPage, setPoolsPage] = useState(1);
  const [poolsSearch, setPoolsSearch] = useState("");
  const [poolsStatusFilter, setPoolsStatusFilter] = useState("all");
  const [bindingsPage, setBindingsPage] = useState(1);
  const [bindingsSearch, setBindingsSearch] = useState("");

  const handlePoolsSearchChange = (value: string) => { setPoolsSearch(value); setPoolsPage(1); };
  const handlePoolsStatusFilterChange = (value: string) => { setPoolsStatusFilter(value); setPoolsPage(1); };
  const handleBindingsSearchChange = (value: string) => { setBindingsSearch(value); setBindingsPage(1); };

  const fetchProviderConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/providers", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProviderConnections(data.connections || []);
      }
    } catch (error) {
      console.log("Error fetching provider connections:", error);
    }
  }, []);

  const fetchProxyPools = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy-pools?includeUsage=true", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setProxyPools(data.proxyPools || []);
      }
    } catch (error) {
      console.log("Error fetching proxy pools:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProxyGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy-groups?includeUsage=true", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setProxyGroups(data.proxyGroups || []);
      }
    } catch (error) {
      console.log("Error fetching proxy groups:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [proxyRes, providersRes, groupsRes] = await Promise.all([
          fetch("/api/proxy-pools?includeUsage=true", { cache: "no-store" }),
          fetch("/api/providers", { cache: "no-store" }),
          fetch("/api/proxy-groups?includeUsage=true", { cache: "no-store" }),
        ]);
        const [proxyData, providersData, groupsData] = await Promise.all([
          proxyRes.json().catch(() => ({})),
          providersRes.json().catch(() => ({})),
          groupsRes.json().catch(() => ({})),
        ]);
        if (!cancelled && proxyRes.ok) {
          setProxyPools(proxyData.proxyPools || []);
        }
        if (!cancelled && providersRes.ok) {
          setProviderConnections(providersData.connections || []);
        }
        if (!cancelled && groupsRes.ok) {
          setProxyGroups(groupsData.proxyGroups || []);
        }
      } catch (error) {
        console.log("Error bootstrapping proxy pools:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const resetForm = () => {
    setEditingProxyPool(null);
    setFormData(normalizeFormData());
    setFormError("");
  };

  const openCreateModal = () => {
    resetForm();
    setShowFormModal(true);
  };

  const openEditModal = (proxyPool) => {
    setEditingProxyPool(proxyPool);
    setFormData(normalizeFormData(proxyPool));
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    setShowFormModal(false);
    resetForm();
  };

  const savePoolMutation = useMutation({
    retry: false,
    mutationFn: async (payload: { name: string; proxyUrl: string; noProxy: string; isActive: boolean; strictProxy: boolean }) => {
      const isEdit = !!editingProxyPool;
      const res = await fetch(isEdit ? `/api/proxy-pools/${editingProxyPool.id}` : "/api/proxy-pools", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save proxy pool");
      }
      const data = await res.json();
      return { isEdit, cascade: data.cascade };
    },
    onSuccess: ({ isEdit, cascade }) => {
      setFormError("");
      fetchProxyPools();
      closeFormModal();
      const cascadeMsg = formatCascadeResultMessage(cascade, "deactivate");
      notify.success(isEdit ? `Proxy pool updated${cascadeMsg ? `. ${cascadeMsg}` : ""}` : "Proxy pool created");
      inv.proxyPools();
      if (cascade && (cascade.clearedConnections > 0 || cascade.clearedProviderDefaults > 0)) {
        inv.providers();
      }
    },
    onError: (error: Error) => {
      setFormError(error.message);
      notify.error(error.message);
    },
  });

  const handleSave = (event) => {
    event?.preventDefault();
    const proxyUrl = formData.proxyUrl.trim();
    const payload = {
      name: formData.name.trim(),
      proxyUrl,
      noProxy: formData.noProxy.trim(),
      isActive: formData.isActive === true,
      strictProxy: formData.strictProxy === true,
      type: formData.type || detectProxyPoolType(proxyUrl),
    };
    if (!payload.name || !payload.proxyUrl) return;
    savePoolMutation.mutate(payload);
  };

  const deletePoolMutation = useMutation({
    retry: false,
    mutationFn: async (proxyPool: any) => {
      const res = await fetch(`/api/proxy-pools/${proxyPool.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete proxy pool");
      }
      const data = await res.json();
      return { proxyPool, cascade: data.cascade };
    },
    onSuccess: ({ proxyPool, cascade }) => {
      setProxyPools((prev) => prev.filter((item) => item.id !== proxyPool.id));
      const cascadeMsg = formatCascadeResultMessage(cascade, "delete");
      notify.success(`Proxy pool deleted${cascadeMsg ? `. ${cascadeMsg}` : ""}`);
      inv.proxyPools();
      if (cascade && (cascade.clearedConnections > 0 || cascade.clearedProviderDefaults > 0)) {
        inv.providers();
      }
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });

  const handleDelete = (proxyPool) => {
    const deleting = confirm(`Delete proxy pool \"${proxyPool.name}\"?`);
    if (!deleting) return;
    deletePoolMutation.mutate(proxyPool);
  };

  const handleTest = async (proxyPoolId) => {
    setTestingId(proxyPoolId);
    try {
      const res = await fetch(`/api/proxy-pools/${proxyPoolId}/test`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        notify.error(data.error || "Failed to test proxy");
        return;
      }

      await fetchProxyPools();
      notify.success(data.ok ? "Proxy test passed" : "Proxy test failed");
    } catch (error) {
      console.log("Error testing proxy pool:", error);
      notify.error("Failed to test proxy");
    } finally {
      setTestingId(null);
    }
  };

  const openBatchImportModal = () => {
    setBatchImportText("");
    setShowBatchImportModal(true);
  };

  // --- Proxy Group Handlers ---
  const resetGroupForm = () => {
    setEditingGroup(null);
    setGroupFormData({ name: "", mode: "roundrobin", stickyLimit: 1, strictProxy: false, isActive: true, proxyPoolIds: [] });
    setGroupFormError("");
  };

  const openCreateGroupModal = () => {
    resetGroupForm();
    setShowGroupFormModal(true);
  };

  const openEditGroupModal = (group: ProxyGroup) => {
    setEditingGroup(group);
    setGroupFormData({
      name: group.name,
      mode: group.mode,
      stickyLimit: group.stickyLimit,
      strictProxy: group.strictProxy,
      isActive: group.isActive,
      proxyPoolIds: group.proxyPoolIds || [],
    });
    setShowGroupFormModal(true);
  };

  const closeGroupFormModal = () => {
    setShowGroupFormModal(false);
    resetGroupForm();
  };

  const saveGroupMutation = useMutation({
    retry: false,
    mutationFn: async (payload: { name: string; mode: string; stickyLimit: number; strictProxy: boolean; isActive: boolean; proxyPoolIds: string[] }) => {
      const isEdit = !!editingGroup;
      const res = await fetch(isEdit ? `/api/proxy-groups/${editingGroup!.id}` : "/api/proxy-groups", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save proxy group");
      }
      return { isEdit };
    },
    onSuccess: ({ isEdit }) => {
      setGroupFormError("");
      fetchProxyGroups();
      closeGroupFormModal();
      notify.success(isEdit ? translate("Proxy group updated") : translate("Proxy group created"));
      inv.proxyGroups();
    },
    onError: (error: Error) => {
      setGroupFormError(error.message);
      notify.error(error.message);
    },
  });

  const handleSaveGroup = (event?: React.FormEvent) => {
    event?.preventDefault();
    const payload = {
      name: groupFormData.name.trim(),
      mode: groupFormData.mode,
      stickyLimit: groupFormData.stickyLimit,
      strictProxy: groupFormData.strictProxy,
      isActive: groupFormData.isActive,
      proxyPoolIds: groupFormData.proxyPoolIds,
    };
    if (!payload.name) return;
    saveGroupMutation.mutate(payload);
  };

  const deleteGroupMutation = useMutation({
    retry: false,
    mutationFn: async (group: ProxyGroup) => {
      const res = await fetch(`/api/proxy-groups/${group.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete proxy group");
      }
      return { group };
    },
    onSuccess: ({ group }) => {
      setProxyGroups((prev) => prev.filter((g) => g.id !== group.id));
      notify.success(translate("Proxy group deleted"));
      inv.proxyGroups();
      inv.providers();
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });

  const handleDeleteGroup = (group: ProxyGroup) => {
    const confirmed = confirm(`${translate("Delete proxy group")} "${group.name}"?`);
    if (!confirmed) return;
    deleteGroupMutation.mutate(group);
  };

  const removeAllMutation = useMutation({
    retry: false,
    mutationFn: async (groupId: string) => {
      const res = await fetch(`/api/proxy-groups/${groupId}/remove-all`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove proxy assignments");
      }
      const data = await res.json();
      return data;
    },
    onSuccess: (data) => {
      setShowRemoveAllDialog(false);
      setRemoveAllGroupId(null);
      notify.success(`${translate("Removed")} ${data.clearedConnections || 0} ${translate("connection(s)")} ${translate("and")} ${data.clearedProviderDefaults || 0} ${translate("provider default(s)")}`);
      fetchProxyGroups();
      fetchProviderConnections();
      inv.proxyGroups();
      inv.providers();
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });

  const handleRemoveAll = () => {
    if (!removeAllGroupId) return;
    removeAllMutation.mutate(removeAllGroupId);
  };

  const togglePoolInGroup = (poolId: string) => {
    setGroupFormData((prev) => {
      const ids = prev.proxyPoolIds.includes(poolId)
        ? prev.proxyPoolIds.filter((id) => id !== poolId)
        : [...prev.proxyPoolIds, poolId];
      return { ...prev, proxyPoolIds: ids };
    });
  };

  const closeBatchImportModal = () => {
    if (batchImportMutation.isPending) return;
    setShowBatchImportModal(false);
  };

  const openVercelModal = () => {
    setVercelForm({ vercelToken: "", projectName: "vercel-relay" });
    setShowVercelModal(true);
  };

  const closeVercelModal = () => {
    if (deploying) return;
    setShowVercelModal(false);
  };

  const handleVercelDeploy = async () => {
    if (!vercelForm.vercelToken.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/proxy-pools/vercel-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vercelForm),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchProxyPools();
        setShowVercelModal(false);
        if (data.relayTest?.ok) {
          notify.success(`Relay deployed and tested. Bind it to a provider connection: ${data.deployUrl}`);
        } else {
          notify.warning(`Relay deployed but test failed. Check the pool before binding: ${data.deployUrl}`);
        }
      } else {
        notify.error(data.error || "Deploy failed");
      }
    } catch (error) {
      console.log("Error deploying Vercel relay:", error);
      notify.error("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const parseProxyLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    if (trimmed.includes("://")) {
      const parsed = new URL(trimmed);
      const hostLabel = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
      return {
        proxyUrl: parsed.toString(),
        name: `Imported ${hostLabel}`,
      };
    }

    const parts = trimmed.split(":");
    if (parts.length === 4) {
      const [host, port, username, password] = parts;
      if (!host || !port || !username || !password) {
        throw new Error("Invalid host:port:user:pass format");
      }

      const proxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
      const parsed = new URL(proxyUrl);
      return {
        proxyUrl: parsed.toString(),
        name: `Imported ${host}:${port}`,
      };
    }

    throw new Error("Unsupported format");
  };

  const batchImportMutation = useMutation({
    retry: false,
    mutationFn: async (parsedEntries: { name: string; proxyUrl: string }[]) => {
      const existingKeys = new Set(
        proxyPools.map((pool) => `${(pool.proxyUrl || "").trim()}|||${(pool.noProxy || "").trim()}`)
      );

      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (const entry of parsedEntries) {
        const dedupeKey = `${entry.proxyUrl}|||`;
        if (existingKeys.has(dedupeKey)) {
          skipped += 1;
          continue;
        }

        const res = await fetch("/api/proxy-pools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: entry.name,
            proxyUrl: entry.proxyUrl,
            noProxy: "",
            isActive: true,
          }),
        });

        if (res.ok) {
          created += 1;
          existingKeys.add(dedupeKey);
        } else {
          failed += 1;
        }
      }

      return { created, skipped, failed };
    },
    onSuccess: ({ created, skipped, failed }) => {
      fetchProxyPools();
      setShowBatchImportModal(false);
      notify.success(`Batch import completed: Created ${created}, Skipped ${skipped}, Failed ${failed}`);
      inv.proxyPools();
    },
    onError: () => {
      notify.error("Batch import failed");
    },
  });

  const parseBatchImportEntries = () => {
    const lines = batchImportText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsedEntries: { name: string; proxyUrl: string }[] = [];
    const invalidLines: string[] = [];

    lines.forEach((line, index) => {
      try {
        const parsed = parseProxyLine(line);
        if (parsed) {
          parsedEntries.push(parsed);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        invalidLines.push(`Line ${index + 1}: ${message}`);
      }
    });

    return { lines, parsedEntries, invalidLines };
  };

  const handleBatchImport = () => {
    const { lines, parsedEntries, invalidLines } = parseBatchImportEntries();

    if (lines.length === 0) {
      notify.warning("Please paste at least one proxy line.");
      return;
    }

    if (invalidLines.length > 0) {
      notify.error(`Invalid proxy format:\n${invalidLines.join("\n")}`);
      return;
    }

    batchImportMutation.mutate(parsedEntries);
  };

  const handleTestBatchImport = async () => {
    const { lines, parsedEntries, invalidLines } = parseBatchImportEntries();

    if (lines.length === 0) {
      notify.warning("Please paste at least one proxy line.");
      return;
    }

    if (invalidLines.length > 0) {
      notify.error(`Invalid proxy format:\n${invalidLines.join("\n")}`);
      return;
    }

    setTestingBatchImport(true);
    try {
      let passed = 0;
      let failed = 0;

      for (const entry of parsedEntries) {
        const res = await fetch("/api/settings/proxy-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proxyUrl: entry.proxyUrl }),
        });

        if (res.ok) {
          passed += 1;
        } else {
          failed += 1;
        }
      }

      if (failed === 0) {
        notify.success(parsedEntries.length === 1 ? "Proxy test passed" : `Proxy tests passed: ${passed}/${parsedEntries.length}`);
      } else {
        notify.warning(`Proxy tests completed: Passed ${passed}, Failed ${failed}`);
      }
    } catch (error) {
      console.log("Error testing proxy import:", error);
      notify.error("Failed to test proxies");
    } finally {
      setTestingBatchImport(false);
    }
  };

  const updateProviderProxyMutation = useMutation({
    retry: false,
    mutationFn: async ({ connectionId, proxyPoolId, proxyGroupId }: { connectionId: string; proxyPoolId?: string | null; proxyGroupId?: string | null }) => {
      const body: Record<string, unknown> = {};
      if (proxyGroupId !== undefined) {
        body.proxyGroupId = proxyGroupId;
        body.proxyPoolId = null;
      } else {
        body.proxyPoolId = proxyPoolId;
        body.proxyGroupId = null;
      }
      const res = await fetch(`/api/providers/${connectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update provider proxy binding");
      }

      return { connectionId, proxyPoolId: proxyPoolId ?? null, proxyGroupId: proxyGroupId ?? null };
    },
    onSuccess: ({ connectionId, proxyPoolId, proxyGroupId }) => {
      setProviderConnections((prev) => prev.map((connection) => (
        connection.id === connectionId
          ? {
              ...connection,
              providerSpecificData: {
                ...(connection.providerSpecificData || {}),
                proxyPoolId: proxyPoolId || undefined,
                proxyGroupId: proxyGroupId || undefined,
              },
            }
          : connection
      )));
      void fetchProxyPools();
      void fetchProviderConnections();
      void fetchProxyGroups();
      inv.providers();
      inv.proxyPools();
      inv.proxyGroups();
      notify.success(proxyPoolId || proxyGroupId ? translate("Provider proxy binding updated") : translate("Provider unbound from proxy"));
    },
    onError: (error: Error) => {
      notify.error(error.message);
    },
  });

  const handleProviderProxyChange = (connectionId: string, value: string) => {
    const connection = providerConnections.find((c) => c.id === connectionId);
    const currentPoolId = connection?.providerSpecificData?.proxyPoolId;
    const currentGroupId = connection?.providerSpecificData?.proxyGroupId;
    const hasCustomAssignment = !!(currentPoolId || currentGroupId);

    if (hasCustomAssignment && value !== "__none__") {
      const confirmed = confirm(translate("This account has a custom proxy assignment. Changing will override it. Continue?"));
      if (!confirmed) return;
    }

    if (value === "__none__") {
      updateProviderProxyMutation.mutate({ connectionId, proxyPoolId: null, proxyGroupId: null });
    } else if (value.startsWith("group::")) {
      const groupId = value.replace("group::", "");
      updateProviderProxyMutation.mutate({ connectionId, proxyGroupId: groupId });
    } else {
      updateProviderProxyMutation.mutate({ connectionId, proxyPoolId: value });
    }
  };

  const activeProxyPools = useMemo(() => proxyPools.filter((pool) => pool.isActive === true), [proxyPools]);
  const activeProxyGroups = useMemo(() => proxyGroups.filter((g) => g.isActive === true), [proxyGroups]);

  const getProviderDefaultLabels = useCallback((pool: ProxyPoolRecord) => {
    return (pool.defaultProviderIds || []).map((providerId) => getProviderLabel(providerId));
  }, []);

  const providerConnectionsForBinding = useMemo(
    () => providerConnections.filter((connection) => connection.id && connection.provider !== "morph-fast"),
    [providerConnections]
  );

  const activeCount = useMemo(() => proxyPools.filter((pool) => pool.isActive).length, [proxyPools]);

  // Filtered & paginated proxy pools
  const filteredPools = useMemo(() => {
    let result = proxyPools;
    if (poolsSearch.trim()) {
      const q = poolsSearch.toLowerCase();
      result = result.filter((pool) =>
        (pool.name || "").toLowerCase().includes(q) ||
        (pool.proxyUrl || "").toLowerCase().includes(q) ||
        (pool.noProxy || "").toLowerCase().includes(q)
      );
    }
    if (poolsStatusFilter === "active") result = result.filter((pool) => pool.isActive === true);
    else if (poolsStatusFilter === "inactive") result = result.filter((pool) => pool.isActive !== true);
    else if (poolsStatusFilter === "error") result = result.filter((pool) => pool.testStatus === "error");
    else if (poolsStatusFilter === "bound") result = result.filter((pool) => (pool.boundConnectionCount || 0) > 0 || (pool.defaultProviderCount || 0) > 0);
    return result;
  }, [proxyPools, poolsSearch, poolsStatusFilter]);

  const paginatedPools = useMemo(() => {
    const start = (poolsPage - 1) * POOLS_PAGE_SIZE;
    return filteredPools.slice(start, start + POOLS_PAGE_SIZE);
  }, [filteredPools, poolsPage]);

  const poolsTotalPages = Math.max(1, Math.ceil(filteredPools.length / POOLS_PAGE_SIZE));

  // Filtered & paginated bindings
  const filteredBindings = useMemo(() => {
    if (!bindingsSearch.trim()) return providerConnectionsForBinding;
    const q = bindingsSearch.toLowerCase();
    return providerConnectionsForBinding.filter((connection) =>
      getConnectionLabel(connection).toLowerCase().includes(q) ||
      getProviderLabel(connection.provider).toLowerCase().includes(q) ||
      (connection.id || "").toLowerCase().includes(q)
    );
  }, [providerConnectionsForBinding, bindingsSearch]);

  const paginatedBindings = useMemo(() => {
    const start = (bindingsPage - 1) * BINDINGS_PAGE_SIZE;
    return filteredBindings.slice(start, start + BINDINGS_PAGE_SIZE);
  }, [filteredBindings, bindingsPage]);

  const bindingsTotalPages = Math.max(1, Math.ceil(filteredBindings.length / BINDINGS_PAGE_SIZE));

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-80" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{translate("Proxy Pools")}</h1>
          <p className="text-sm text-text-muted mt-1">
            {translate("Manage reusable proxies, provider defaults, and per-connection overrides.")}
          </p>
        </div>

        {activeTab === "pools" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={openVercelModal}>
              <AppIcon name="cloud_upload" data-icon="inline-start" />
              {translate("Vercel Relay")}
            </Button>
            <Button variant="secondary" onClick={openBatchImportModal}>
              <AppIcon name="upload" data-icon="inline-start" />
              {translate("Batch Import")}
            </Button>
            <Button onClick={openCreateModal}>
              <AppIcon name="add" data-icon="inline-start" />
              {translate("Add Proxy Pool")}
            </Button>
          </div>
        )}
        {activeTab === "groups" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openCreateGroupModal}>
              <AppIcon name="add" data-icon="inline-start" />
              {translate("Add Group")}
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pools">{translate("Proxy Pools")}</TabsTrigger>
          <TabsTrigger value="groups">{translate("Round-Robin Groups")}</TabsTrigger>
        </TabsList>

        <TabsContent value="pools">
      <Card>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{translate("Total")}: {proxyPools.length}</Badge>
              <Badge>{translate("Enabled")}: {activeCount}</Badge>
              {filteredPools.length !== proxyPools.length && (
                <Badge variant="secondary">{translate("Showing")}: {filteredPools.length}</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={poolsSearch}
                onChange={(e) => handlePoolsSearchChange(e.target.value)}
                placeholder={translate("Search pools...")}
                className="h-8 w-full sm:w-[200px]"
              />
              <Select value={poolsStatusFilter} onValueChange={handlePoolsStatusFilterChange}>
                <SelectTrigger className="h-8 w-full sm:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{translate("All statuses")}</SelectItem>
                  <SelectItem value="active">{translate("Enabled")}</SelectItem>
                  <SelectItem value="inactive">{translate("Disabled")}</SelectItem>
                  <SelectItem value="error">{translate("Error")}</SelectItem>
                  <SelectItem value="bound">{translate("In use")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {proxyPools.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AppIcon name="hub" />
                </EmptyMedia>
                <EmptyTitle>{translate("No proxy pool entries yet")}</EmptyTitle>
                <EmptyDescription>{translate("Create a proxy pool entry, then assign it to connections.")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filteredPools.length === 0 ? (
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon"><AppIcon name="search" /></EmptyMedia>
                <EmptyTitle>{translate("No matching pools")}</EmptyTitle>
                <EmptyDescription>{translate("Try adjusting your search or filter.")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {paginatedPools.map((pool) => (
                <div key={pool.id} className="group flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{pool.name}</p>
                      <Badge variant={getStatusVariant(pool.testStatus)}>
                        <span className="size-1.5 rounded-[4px] bg-current" aria-hidden="true" />
                        {translate(getPoolHealthLabel(pool.testStatus))}
                      </Badge>
                      <Badge variant={pool.isActive ? "default" : "secondary"}>
                        {pool.isActive ? translate("enabled") : translate("disabled")}
                      </Badge>
                      {pool.type === "http" && (
                        <Badge variant="outline">{translate("http proxy")}</Badge>
                      )}
                      {pool.type === "relay" && (
                        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          {translate("relay")}
                        </Badge>
                      )}
                      <Badge variant="secondary">
                        {pool.boundConnectionCount || 0} {translate("account override")}
                      </Badge>
                      {(pool.defaultProviderCount || 0) > 0 && (
                        <Badge variant="secondary">
                          {pool.defaultProviderCount || 0} {translate("provider default")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{pool.proxyUrl}</p>
                    {getBoundConnections(pool.id, providerConnections).length > 0 ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {translate("Account overrides")} ({getBoundConnections(pool.id, providerConnections).length}): {getBoundConnections(pool.id, providerConnections).slice(0, 3).map((connection) => `${getProviderLabel(connection.provider)} / ${getConnectionLabel(connection)}`).join(", ")}{getBoundConnections(pool.id, providerConnections).length > 3 ? ` +${getBoundConnections(pool.id, providerConnections).length - 3} ${translate("more")}` : ""}
                      </p>
                    ) : null}
                    {(pool.defaultProviderCount || 0) > 0 ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {translate("Provider defaults")}: {getProviderDefaultLabels(pool).join(", ")}
                      </p>
                    ) : null}
                    {pool.noProxy ? (
                      <p className="truncate text-xs text-muted-foreground">{translate("No proxy")}: {pool.noProxy}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {translate("Last tested")}: {formatDateTime(pool.lastTestedAt)}
                      {pool.lastError ? ` · ${pool.lastError}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      onClick={() => handleTest(pool.id)}
                      variant="ghost"
                      size="sm"
                      className="rounded-[4px] text-muted-foreground hover:text-primary"
                      title={translate("Test proxy")}
                      aria-label={translate("Test proxy")}
                      disabled={testingId === pool.id}
                    >
                      {testingId === pool.id ? <Spinner data-icon="inline-start" /> : <AppIcon name="science" data-icon="inline-start" />}
                    </Button>
                    <Button
                      onClick={() => openEditModal(pool)}
                      variant="ghost"
                      size="sm"
                      className="rounded-[4px] text-muted-foreground hover:text-primary"
                      title={translate("Edit")}
                      aria-label={translate("Edit")}
                    >
                      <AppIcon name="edit" data-icon="inline-start" />
                    </Button>
                    <Button
                      onClick={() => handleDelete(pool)}
                      variant="ghost"
                      size="sm"
                      className="rounded-[4px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title={translate("Delete")}
                      aria-label={translate("Delete")}
                    >
                      <AppIcon name="delete" data-icon="inline-start" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <PaginationControls currentPage={poolsPage} totalPages={poolsTotalPages} onPageChange={setPoolsPage} />
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="groups">
          <Card>
            <CardContent>
              {proxyGroups.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><AppIcon name="hub" /></EmptyMedia>
                    <EmptyTitle>{translate("No proxy groups yet")}</EmptyTitle>
                    <EmptyDescription>{translate("Create a round-robin or sticky proxy group to rotate proxies automatically.")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col divide-y divide-border/60">
                  {proxyGroups.map((group) => (
                    <div key={group.id} className="group flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{group.name}</p>
                          <Badge variant={group.mode === "roundrobin" ? "default" : "secondary"}>
                            {group.mode}
                          </Badge>
                          {group.mode === "sticky" && (
                            <Badge variant="outline">{translate("limit")}: {group.stickyLimit}</Badge>
                          )}
                          <Badge variant={group.isActive ? "default" : "secondary"}>
                            {group.isActive ? translate("active") : translate("inactive")}
                          </Badge>
                          <Badge variant="secondary">
                            {group.proxyPoolIds?.length || 0} {translate("pool(s)")}
                          </Badge>
                          {(group.boundConnectionCount || 0) > 0 && (
                            <Badge variant="secondary">
                              {group.boundConnectionCount} {translate("bound")}
                            </Badge>
                          )}
                          {(group.defaultProviderCount || 0) > 0 && (
                            <Badge variant="secondary">
                              {group.defaultProviderCount} {translate("provider default")}
                            </Badge>
                          )}
                          {group.strictProxy && (
                            <Badge variant="destructive">{translate("strict")}</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {translate("Pools")}: {group.proxyPoolIds?.length > 0
                            ? group.proxyPoolIds.map((pid) => {
                                const pool = proxyPools.find((p) => p.id === pid);
                                return pool?.name || pid.slice(0, 8);
                              }).join(", ")
                            : translate("none")}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          onClick={() => {
                            setRemoveAllGroupId(group.id);
                            setShowRemoveAllDialog(true);
                          }}
                          variant="ghost"
                          size="sm"
                          className="rounded-[4px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title={translate("Remove all assignments")}
                          aria-label={translate("Remove all assignments")}
                          disabled={(group.boundConnectionCount || 0) === 0 && (group.defaultProviderCount || 0) === 0}
                        >
                          <AppIcon name="link_off" data-icon="inline-start" />
                        </Button>
                        <Button
                          onClick={() => openEditGroupModal(group)}
                          variant="ghost"
                          size="sm"
                          className="rounded-[4px] text-muted-foreground hover:text-primary"
                          title={translate("Edit")}
                          aria-label={translate("Edit")}
                        >
                          <AppIcon name="edit" data-icon="inline-start" />
                        </Button>
                        <Button
                          onClick={() => handleDeleteGroup(group)}
                          variant="ghost"
                          size="sm"
                          className="rounded-[4px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title={translate("Delete")}
                          aria-label={translate("Delete")}
                        >
                          <AppIcon name="delete" data-icon="inline-start" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">{translate("Provider Proxy Bindings")}</h2>
              <p className="text-sm text-muted-foreground">
                {translate("Assign per-connection proxy overrides here. Provider defaults are configured from each provider page.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{filteredBindings.length} {translate("connections")}</Badge>
              <Input
                value={bindingsSearch}
                onChange={(e) => handleBindingsSearchChange(e.target.value)}
                placeholder={translate("Search connections...")}
                className="h-8 w-full sm:w-[200px]"
              />
            </div>
          </div>

          {providerConnectionsForBinding.length === 0 ? (
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon"><AppIcon name="provider" /></EmptyMedia>
                <EmptyTitle>{translate("No provider connections yet")}</EmptyTitle>
                <EmptyDescription>{translate("Add a provider connection before binding a proxy pool.")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filteredBindings.length === 0 ? (
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon"><AppIcon name="search" /></EmptyMedia>
                <EmptyTitle>{translate("No matching connections")}</EmptyTitle>
                <EmptyDescription>{translate("Try adjusting your search.")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {paginatedBindings.map((connection) => {
                const poolId = connection.providerSpecificData?.proxyPoolId;
                const groupId = connection.providerSpecificData?.proxyGroupId;
                const selectedValue = groupId ? `group::${groupId}` : poolId || "__none__";
                const selectedPool = poolId ? proxyPools.find((pool) => pool.id === poolId) : null;
                const selectedGroup = groupId ? proxyGroups.find((g) => g.id === groupId) : null;
                const isUpdating = updateProviderProxyMutation.isPending && updateProviderProxyMutation.variables?.connectionId === connection.id;

                const overrideLabel = selectedGroup
                  ? `${translate("Override")}: ${selectedGroup.name} (${translate("group")})`
                  : selectedPool
                    ? `${translate("Override")}: ${selectedPool.name}`
                    : translate("No per-account override");

                return (
                  <div key={connection.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{getConnectionLabel(connection)}</p>
                        <Badge variant="secondary">{getProviderLabel(connection.provider)}</Badge>
                        <Badge variant={connection.isActive === false ? "secondary" : "default"}>
                          {connection.isActive === false ? translate("disabled") : translate("enabled")}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {overrideLabel}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:min-w-[260px]">
                      {isUpdating ? <Spinner data-icon="inline-start" /> : null}
                      <Select
                        value={selectedValue}
                        onValueChange={(value) => handleProviderProxyChange(connection.id, value)}
                        disabled={isUpdating}
                      >
                        <SelectTrigger className="w-full sm:w-[260px]">
                          <SelectValue placeholder={translate("Select proxy pool")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="__none__">{translate("Use provider default / none")}</SelectItem>
                          </SelectGroup>
                          {activeProxyGroups.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>{translate("Round-Robin Groups")}</SelectLabel>
                              {activeProxyGroups.map((group) => (
                                <SelectItem key={`group::${group.id}`} value={`group::${group.id}`}>
                                  {group.name} ({group.mode})
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          <SelectGroup>
                            <SelectLabel>{translate("Individual Pools")}</SelectLabel>
                            {activeProxyPools.map((pool) => (
                              <SelectItem key={pool.id} value={pool.id}>{pool.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <PaginationControls currentPage={bindingsPage} totalPages={bindingsTotalPages} onPageChange={setBindingsPage} />
        </CardContent>
      </Card>

      <Dialog open={showBatchImportModal} onOpenChange={(open) => { if (!open) closeBatchImportModal(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("Batch Import Proxies")}</DialogTitle>
            <DialogDescription>{translate("Paste one proxy per line and import them into reusable pools.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void handleBatchImport(); }} className="flex flex-col gap-4">
            <Field>
              <FieldLabel>{translate("Paste Proxy List (One per line)")}</FieldLabel>
              <Textarea
                value={batchImportText}
                onChange={(e) => setBatchImportText(e.target.value)}
                placeholder={"http://user:pass@127.0.0.1:7897\n127.0.0.1:7897:user:pass"}
                className="min-h-[180px] rounded-[4px] bg-input/80 font-mono text-sm"
              />
              <FieldDescription>
                Supported formats: protocol://user:pass@host:port, host:port:user:pass
              </FieldDescription>
            </Field>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="w-full"
                variant="secondary"
                onClick={() => void handleTestBatchImport()}
                disabled={!batchImportText.trim() || batchImportMutation.isPending || testingBatchImport}
              >
                {testingBatchImport ? <Spinner data-icon="inline-start" /> : <AppIcon name="science" data-icon="inline-start" />}
                {testingBatchImport ? translate("Testing") : translate("Test Proxy")}
              </Button>
              <Button type="submit" className="w-full" disabled={!batchImportText.trim() || batchImportMutation.isPending || testingBatchImport}>
                {batchImportMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                {batchImportMutation.isPending ? translate("Importing") : translate("Import")}
              </Button>
              <Button type="button" className="w-full" variant="ghost" onClick={closeBatchImportModal} disabled={batchImportMutation.isPending || testingBatchImport}>
                {translate("Cancel")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showVercelModal} onOpenChange={(open) => { if (!open) closeVercelModal(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("Deploy Vercel Relay")}</DialogTitle>
            <DialogDescription>{translate("Deploy an edge relay function to Vercel without storing your token.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void handleVercelDeploy(); }} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 rounded-[4px] border border-primary/10 bg-primary/10 p-3">
              <p className="text-sm font-medium text-foreground">{translate("What is Vercel Relay?")}</p>
              <p className="text-xs text-muted-foreground">
                Deploys an edge relay function to Vercel. All AI provider requests will be forwarded through Vercel&apos;s edge network, masking your real IP from providers.
              </p>
              <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs text-muted-foreground">
                <li>{translate("Your IP is replaced by Vercel's dynamic edge IPs (hundreds of IPs across 20+ global regions)")}</li>
                <li>{translate("Vercel serves millions of apps — providers can't block Vercel IPs without affecting legitimate traffic")}</li>
                <li>{translate("Free tier: 100GB bandwidth/month, 500K edge invocations")}</li>
                <li>{translate("Deploy multiple relays on different accounts for more IP diversity")}</li>
              </ul>
            </div>
            <FieldGroup>
              <Field>
                <FieldLabel>{translate("Vercel API Token")}</FieldLabel>
                <Input
                  value={vercelForm.vercelToken}
                  onChange={(e) => setVercelForm((prev) => ({ ...prev, vercelToken: e.target.value }))}
                  placeholder={translate("your-vercel-api-token")}
                  type="password"
                />
                <FieldDescription>
                  {translate("Token is used once for deployment and not stored.")} <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{translate("Get token →")}</a>
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{translate("Project Name")}</FieldLabel>
                <Input
                  value={vercelForm.projectName}
                  onChange={(e) => setVercelForm((prev) => ({ ...prev, projectName: e.target.value }))}
                  placeholder={translate("my-relay")}
                />
                <FieldDescription>{translate("Unique name for your Vercel project. Leave empty for auto-generated name.")}</FieldDescription>
              </Field>
            </FieldGroup>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="w-full"
                disabled={!vercelForm.vercelToken.trim() || deploying}
              >
                {deploying ? <Spinner data-icon="inline-start" /> : null}
                {deploying ? translate("Deploying") : translate("Deploy")}
              </Button>
              <Button type="button" className="w-full" variant="ghost" onClick={closeVercelModal} disabled={deploying}>
                {translate("Cancel")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showFormModal} onOpenChange={(open) => { if (!open) closeFormModal(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProxyPool ? translate("Edit Proxy Pool") : translate("Add Proxy Pool")}</DialogTitle>
            <DialogDescription>{translate("Configure a reusable proxy endpoint for provider connections.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {formError ? (
              <div className="rounded-[4px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            ) : null}
            <FieldGroup>
              <Field>
                <FieldLabel>{translate("Name")}</FieldLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={translate("Office Proxy")}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{translate("Proxy Type")}</FieldLabel>
                <Select
                  value={formData.type || "http"}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">{translate("HTTP Proxy")}</SelectItem>
                    <SelectItem value="relay">{translate("Relay")}</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {translate("HTTP proxy uses CONNECT/ProxyAgent. Relay modes use x-relay-target and x-relay-path headers.")}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{translate("Proxy URL")}</FieldLabel>
                <Input
                  value={formData.proxyUrl}
                  onChange={(e) => setFormData((prev) => ({
                    ...prev,
                    proxyUrl: e.target.value,
                    type: prev.type || detectProxyPoolType(e.target.value),
                  }))}
                  placeholder={formData.type === "http" ? translate("http://127.0.0.1:7897") : translate("https://your-relay-host.example.com")}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{translate("No Proxy")}</FieldLabel>
                <Input
                  value={formData.noProxy}
                  onChange={(e) => setFormData((prev) => ({ ...prev, noProxy: e.target.value }))}
                  placeholder={translate("localhost,127.0.0.1,.internal")}
                />
                <FieldDescription>{translate("Comma-separated hosts/domains to bypass proxy")}</FieldDescription>
              </Field>
            </FieldGroup>

            <div className="flex items-center justify-between rounded-[4px] border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">{translate("Enabled")}</p>
                <p className="text-xs text-muted-foreground">{translate("Disabled pools are ignored by runtime resolution.")}</p>
              </div>
              <Switch
                checked={formData.isActive === true}
                onToggle={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                disabled={savePoolMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between rounded-[4px] border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">{translate("Strict Proxy")}</p>
                <p className="text-xs text-muted-foreground">{translate("Fail request if proxy is unreachable instead of falling back to direct.")}</p>
              </div>
              <Switch
                checked={formData.strictProxy === true}
                onToggle={() => setFormData((prev) => ({ ...prev, strictProxy: !prev.strictProxy }))}
                disabled={savePoolMutation.isPending}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="w-full"
                disabled={!formData.name.trim() || !formData.proxyUrl.trim() || savePoolMutation.isPending}
              >
                {savePoolMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                {savePoolMutation.isPending ? translate("Saving") : translate("Save")}
              </Button>
              <Button type="button" className="w-full" variant="ghost" onClick={closeFormModal} disabled={savePoolMutation.isPending}>
                {translate("Cancel")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Group Form Dialog */}
      <Dialog open={showGroupFormModal} onOpenChange={(open) => { if (!open) closeGroupFormModal(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? translate("Edit Proxy Group") : translate("Add Proxy Group")}</DialogTitle>
            <DialogDescription>{translate("Configure a round-robin or sticky proxy group.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveGroup} className="flex flex-col gap-4">
            {groupFormError ? (
              <div className="rounded-[4px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {groupFormError}
              </div>
            ) : null}
            <FieldGroup>
              <Field>
                <FieldLabel>{translate("Name")}</FieldLabel>
                <Input
                  value={groupFormData.name}
                  onChange={(e) => setGroupFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={translate("My Proxy Group")}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{translate("Mode")}</FieldLabel>
                <Select
                  value={groupFormData.mode}
                  onValueChange={(value) => setGroupFormData((prev) => ({ ...prev, mode: value as "roundrobin" | "sticky" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="roundrobin">{translate("Round-Robin")}</SelectItem>
                    <SelectItem value="sticky">{translate("Sticky")}</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {translate("Round-robin rotates on each request. Sticky reuses the same proxy for N requests.")}
                </FieldDescription>
              </Field>
              {groupFormData.mode === "sticky" && (
                <Field>
                  <FieldLabel>{translate("Sticky Limit")}</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={groupFormData.stickyLimit}
                    onChange={(e) => setGroupFormData((prev) => ({ ...prev, stickyLimit: Math.max(1, parseInt(e.target.value) || 1) }))}
                  />
                  <FieldDescription>{translate("Number of requests before rotating to the next proxy.")}</FieldDescription>
                </Field>
              )}
            </FieldGroup>

            <div className="flex items-center justify-between rounded-[4px] border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">{translate("Active")}</p>
                <p className="text-xs text-muted-foreground">{translate("Inactive groups are ignored during resolution.")}</p>
              </div>
              <Switch
                checked={groupFormData.isActive}
                onToggle={() => setGroupFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                disabled={saveGroupMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between rounded-[4px] border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">{translate("Strict Proxy")}</p>
                <p className="text-xs text-muted-foreground">{translate("Fail request if all proxies in the group are unreachable.")}</p>
              </div>
              <Switch
                checked={groupFormData.strictProxy}
                onToggle={() => setGroupFormData((prev) => ({ ...prev, strictProxy: !prev.strictProxy }))}
                disabled={saveGroupMutation.isPending}
              />
            </div>

            <div className="rounded-[4px] border border-border/50 p-3">
              <p className="mb-2 text-sm font-medium">{translate("Pool Members")}</p>
              <p className="mb-3 text-xs text-muted-foreground">{translate("Select which proxy pools belong to this group.")}</p>
              {proxyPools.length === 0 ? (
                <p className="text-xs text-muted-foreground">{translate("No proxy pools available. Create pools first.")}</p>
              ) : (
                <div className="flex max-h-[200px] flex-col gap-2 overflow-y-auto">
                  {proxyPools.map((pool) => (
                    <label key={pool.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-secondary/50">
                      <Checkbox
                        checked={groupFormData.proxyPoolIds.includes(pool.id)}
                        onCheckedChange={() => togglePoolInGroup(pool.id)}
                      />
                      <span className="text-sm">{pool.name}</span>
                      {!pool.isActive && <Badge variant="secondary" className="text-[10px]">{translate("disabled")}</Badge>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="w-full"
                disabled={!groupFormData.name.trim() || saveGroupMutation.isPending}
              >
                {saveGroupMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                {saveGroupMutation.isPending ? translate("Saving") : translate("Save")}
              </Button>
              <Button type="button" className="w-full" variant="ghost" onClick={closeGroupFormModal} disabled={saveGroupMutation.isPending}>
                {translate("Cancel")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove All Proxy Assignments Dialog */}
      <Dialog open={showRemoveAllDialog} onOpenChange={(open) => { if (!open) { setShowRemoveAllDialog(false); setRemoveAllGroupId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("Remove All Proxy Assignments")}</DialogTitle>
            <DialogDescription>
              {translate("This will remove this group assignment from all connections and provider defaults. This action cannot be undone.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleRemoveAll}
              disabled={removeAllMutation.isPending}
            >
              {removeAllMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              {translate("Remove All")}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => { setShowRemoveAllDialog(false); setRemoveAllGroupId(null); }}
              disabled={removeAllMutation.isPending}
            >
              {translate("Cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
