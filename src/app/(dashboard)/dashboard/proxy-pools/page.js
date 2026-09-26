"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useRouter } from "@/lib/ui/navigation.js";
import { Badge, Button, Card, CardSkeleton, Input, Modal, Toggle, ConfirmModal, SegmentedControl } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import ProxyFitnessTab from "./components/ProxyFitnessTab";
import Icon from "@/shared/components/Icon";

function getStatusVariant(status) {
 if (status === "active") return "success";
 if (status === "error" || status === "unhealthy") return "error";
 if (status === "degraded") return "warning";
 return "default";
}

function formatDateTime(value) {
 if (!value) return "Never";
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return "Never";
 return date.toLocaleString();
}
const TAB_COPY = {
  pools: {
    title: "Proxy Pools",
    body: "Manage proxy endpoints, relay deployments, and egress health across your infrastructure.",
  },
  groups: {
    title: "Proxy Groups",
    body: "Route connections across auto-gathered default groups or custom groups with sticky round-robin.",
  },
  fitness: {
    title: "Proxy Fitness",
    body: "Real-time visibility into blocked upstream endpoints, region gates, and egress IP health with smart failover.",
  },
};

function normalizeFormData(data = {}) {
 return {
 name: data.name || "",
 proxyUrl: data.proxyUrl || "",
 noProxy: data.noProxy || "",
 group: data.group || "",
 isActive: data.isActive !== false,
 strictProxy: data.strictProxy === true,
 };
}

function getPaginationItems(currentPage, totalPages) {
 if (totalPages <= 1) return [];
 if (totalPages <= 7) {
 return Array.from({ length: totalPages }, (_, i) => i + 1);
 }

 const items = [];
 items.push(1);

 if (currentPage > 3) {
 items.push("ellipsis-1");
 }

 const start = Math.max(2, currentPage - 1);
 const end = Math.min(totalPages - 1, currentPage + 1);

 let windowStart = start;
 let windowEnd = end;
 if (currentPage <= 3) {
 windowStart = 2;
 windowEnd = 4;
 } else if (currentPage >= totalPages - 2) {
 windowStart = totalPages - 3;
 windowEnd = totalPages - 1;
 }

 for (let p = windowStart; p <= windowEnd; p++) {
 items.push(p);
 }

 if (currentPage < totalPages - 2) {
 items.push("ellipsis-2");
 }

 items.push(totalPages);
 return items;
}

export default function ProxyPoolsPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ProxyPoolsContent />
    </Suspense>
  );
}

function ProxyPoolsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam && ["pools", "groups", "fitness"].includes(tabParam) ? tabParam : "pools";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/proxy-pools?${params.toString()}`, { scroll: false });
  };

  const setActiveTab = (tabOrFn) => {
    const nextTab = typeof tabOrFn === "function" ? tabOrFn(activeTab) : tabOrFn;
    const params = new URLSearchParams(searchParams);
    params.set("tab", nextTab);
    router.push(`/dashboard/proxy-pools?${params.toString()}`, { scroll: false });
  };

  const tabsRef = useRef(null);

  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    const active = strip.querySelector('[data-active="true"]');
    if (!active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = Math.max(0, left - 8);
    }
  }, [activeTab]);
  const [proxyPools, setProxyPools] = useState([]);
 const [loading, setLoading] = useState(true);
 const [showFormModal, setShowFormModal] = useState(false);
 const [showBatchImportModal, setShowBatchImportModal] = useState(false);
 const [showVercelModal, setShowVercelModal] = useState(false);
 const [showCloudflareModal, setShowCloudflareModal] = useState(false);
 const [showCloudflareBulkModal, setShowCloudflareBulkModal] = useState(false);
 const [showDenoModal, setShowDenoModal] = useState(false);
 const [showRelayMenu, setShowRelayMenu] = useState(false);
 const [editingProxyPool, setEditingProxyPool] = useState(null);
 const [formData, setFormData] = useState(normalizeFormData());
 const [batchImportText, setBatchImportText] = useState("");
 const [batchImportGroup, setBatchImportGroup] = useState("");
 const [batchGroupOption, setBatchGroupOption] = useState("none"); // "none" | "existing" | "new"
 const [batchExistingGroupId, setBatchExistingGroupId] = useState("");
 const [batchNewGroupName, setBatchNewGroupName] = useState("");
 const [vercelForm, setVercelForm] = useState({ vercelToken: "", projectName: "vercel-relay" });
 const [cloudflareForm, setCloudflareForm] = useState({ accountId: "", apiToken: "", projectName: "cloudflare-relay" });
 const [cloudflareBulkPoolName, setCloudflareBulkPoolName] = useState("cloudflare-relay");
 const [cloudflareBulkText, setCloudflareBulkText] = useState("");
 const [cloudflareBulkResults, setCloudflareBulkResults] = useState([]);
 const [cloudflareBulkProgress, setCloudflareBulkProgress] = useState({
 total: 0,
 completed: 0,
 success: 0,
 failed: 0,
 currentBatch: 0,
 totalBatches: 0,
 });
 const [denoForm, setDenoForm] = useState({ denoToken: "", orgDomain: "", projectName: "" });
 const [saving, setSaving] = useState(false);
 const [importing, setImporting] = useState(false);
 const [deploying, setDeploying] = useState(false);
 const [bulkCloudflareDeploying, setBulkCloudflareDeploying] = useState(false);
 const [testingId, setTestingId] = useState(null);
 const [selectedIds, setSelectedIds] = useState([]);
 const [searchQuery, setSearchQuery] = useState("");
 const [typeFilter, setTypeFilter] = useState("all");
 const [groupFilter, setGroupFilter] = useState("all");
 const [currentPage, setCurrentPage] = useState(1);
 const [pageSize, setPageSize] = useState(50);
 const [healthChecking, setHealthChecking] = useState(false);
 const [healthProgress, setHealthProgress] = useState({ current: 0, total: 0 });
 const [bulkBusy, setBulkBusy] = useState(false);
 const [confirmState, setConfirmState] = useState(null);
 const [proxyGroups, setProxyGroups] = useState({ defaultGroups: [], customGroups: [] });
 const [loadingGroups, setLoadingGroups] = useState(false);
 const [showGroupModal, setShowGroupModal] = useState(false);
 const [editingGroup, setEditingGroup] = useState(null);
 const [groupForm, setGroupForm] = useState({ name: "", description: "", isSticky: false, stickyLimit: 3, poolIds: [] });
 const [groupPoolSearch, setGroupPoolSearch] = useState("");
 const [savingGroup, setSavingGroup] = useState(false);
 const relayMenuRef = useRef(null);
 const notify = useNotificationStore();

 useEffect(() => {
 const handleClickOutside = (e) => {
 if (relayMenuRef.current && !relayMenuRef.current.contains(e.target)) {
 setShowRelayMenu(false);
 }
 };
 if (showRelayMenu) {
 document.addEventListener("mousedown", handleClickOutside);
 }
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }, [showRelayMenu]);

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
 setLoadingGroups(true);
 try {
 const res = await fetch("/api/proxy-groups", { cache: "no-store" });
 if (res.ok) {
 const data = await res.json();
 setProxyGroups({
 defaultGroups: data.defaultGroups || [],
 customGroups: data.customGroups || [],
 });
 }
 } catch (error) {
 console.log("Error fetching proxy groups:", error);
 } finally {
 setLoadingGroups(false);
 }
 }, []);

 useEffect(() => {
 fetchProxyPools();
 fetchProxyGroups();
 }, [fetchProxyPools, fetchProxyGroups]);

 const openCreateGroupModal = () => {
 setEditingGroup(null);
 setGroupForm({ name: "", description: "", isSticky: false, stickyLimit: 3, poolIds: [] });
 setGroupPoolSearch("");
 setShowGroupModal(true);
 };

 const openEditGroupModal = (group) => {
 setEditingGroup(group);
 setGroupForm({
 name: group.name || "",
 description: group.description || "",
 isSticky: group.isSticky === true,
 stickyLimit: group.stickyLimit || 3,
 poolIds: Array.isArray(group.poolIds) ? [...group.poolIds] : [],
 });
 setGroupPoolSearch("");
 setShowGroupModal(true);
 };

 const closeGroupModal = () => {
 if (savingGroup) return;
 setShowGroupModal(false);
 setEditingGroup(null);
 };

 const handleSaveGroup = async () => {
 if (!groupForm.name.trim()) {
 notify.error("Group name is required");
 return;
 }

 setSavingGroup(true);
 try {
 const isEdit = !!editingGroup;
 const url = isEdit ? `/api/proxy-groups/${editingGroup.id}` : "/api/proxy-groups";
 const method = isEdit ? "PUT" : "POST";
 const res = await fetch(url, {
 method,
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(groupForm),
 });
 const data = await res.json();
 if (res.ok) {
 notify.success(isEdit ? "Proxy group updated" : "Proxy group created");
 setShowGroupModal(false);
 await fetchProxyGroups();
 } else {
 notify.error(data.error || "Failed to save proxy group");
 }
 } catch (error) {
 console.log("Error saving proxy group:", error);
 notify.error("Failed to save proxy group");
 } finally {
 setSavingGroup(false);
 }
 };

 const handleDeleteGroup = (group) => {
 setConfirmState({
 title: "Delete Proxy Group",
 message: `Are you sure you want to delete custom group "${group.name}"?`,
 onConfirm: async () => {
 setConfirmState(null);
 try {
 const res = await fetch(`/api/proxy-groups/${group.id}`, { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 notify.success(`Proxy group "${group.name}" deleted`);
 await fetchProxyGroups();
 } else {
 notify.error(data.error || "Failed to delete proxy group");
 }
 } catch (error) {
 console.log("Error deleting proxy group:", error);
 notify.error("Failed to delete proxy group");
 }
 },
 });
 };

 const resetForm = () => {
 setEditingProxyPool(null);
 setFormData(normalizeFormData());
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

 const handleSave = async () => {
 const payload = {
 name: formData.name.trim(),
 proxyUrl: formData.proxyUrl.trim(),
 noProxy: formData.noProxy.trim(),
 group: formData.group.trim(),
 isActive: formData.isActive === true,
 strictProxy: formData.strictProxy === true,
 };

 if (!payload.name || !payload.proxyUrl) return;

 setSaving(true);
 try {
 const isEdit = !!editingProxyPool;
 const res = await fetch(isEdit ? `/api/proxy-pools/${editingProxyPool.id}` : "/api/proxy-pools", {
 method: isEdit ? "PUT" : "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 });

 if (res.ok) {
 await fetchProxyPools();
 await fetchProxyGroups();
 closeFormModal();
 notify.success(editingProxyPool ? "Proxy pool updated" : "Proxy pool created");
 } else {
 const data = await res.json();
 notify.error(data.error || "Failed to save proxy pool");
 }
 } catch (error) {
 console.log("Error saving proxy pool:", error);
 } finally {
 setSaving(false);
 }
 };

 const handleDelete = async (proxyPool) => {
 setConfirmState({
 title: "Delete Proxy Pool",
 message: `Delete proxy pool "${proxyPool.name}"?`,
 onConfirm: async () => {
 setConfirmState(null);
 try {
 const res = await fetch(`/api/proxy-pools/${proxyPool.id}`, { method: "DELETE" });
 if (res.ok) {
 setProxyPools((prev) => prev.filter((item) => item.id !== proxyPool.id));
 notify.success("Proxy pool deleted");
 return;
 }

 const data = await res.json();
 if (res.status === 409) {
 notify.warning(`Cannot delete: ${data.boundConnectionCount || 0} connection(s) are still using this pool.`);
 } else {
 notify.error(data.error || "Failed to delete proxy pool");
 }
 } catch (error) {
 console.log("Error deleting proxy pool:", error);
 notify.error("Failed to delete proxy pool");
 }
 }
 });
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

 const handleToggleActive = async (pool) => {
 const next = !pool.isActive;
 setProxyPools((prev) => prev.map((p) => p.id === pool.id ? { ...p, isActive: next } : p));
 try {
 const res = await fetch(`/api/proxy-pools/${pool.id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isActive: next }),
 });
 if (!res.ok) {
 setProxyPools((prev) => prev.map((p) => p.id === pool.id ? { ...p, isActive: pool.isActive } : p));
 notify.error("Failed to update active state");
 }
 } catch (error) {
 console.log("Error toggling active:", error);
 setProxyPools((prev) => prev.map((p) => p.id === pool.id ? { ...p, isActive: pool.isActive } : p));
 }
 };

 const poolCustomGroupsMap = useMemo(() => {
 const map = new Map();
 for (const grp of proxyGroups.customGroups || []) {
 for (const poolId of grp.poolIds || []) {
 const list = map.get(poolId) || [];
 list.push(grp);
 map.set(poolId, list);
 }
 }
 return map;
 }, [proxyGroups.customGroups]);

 const filteredProxyPools = useMemo(() => {
 return proxyPools.filter((pool) => {
 // Type filter
 if (typeFilter === "http") {
 if (pool.type && pool.type !== "http") return false;
 } else if (typeFilter === "cloudflare") {
 if (pool.type !== "cloudflare") return false;
 } else if (typeFilter === "relay") {
 if (pool.type !== "cloudflare" && pool.type !== "vercel" && pool.type !== "deno") return false;
 }

 // Proxy Group filter
 if (groupFilter !== "all") {
 if (groupFilter === "ungrouped") {
 const inAnyCustom = poolCustomGroupsMap.has(pool.id);
 const hasGroupStr = Boolean(pool.group && pool.group.trim());
 if (inAnyCustom || hasGroupStr) return false;
 } else if (groupFilter.startsWith("custom:")) {
 const groupId = groupFilter.slice(7);
 const grp = (proxyGroups.customGroups || []).find((g) => g.id === groupId);
 const inPoolIds = Array.isArray(grp?.poolIds) && grp.poolIds.includes(pool.id);
 const matchName = grp && pool.group && pool.group.toLowerCase() === grp.name.toLowerCase();
 if (!inPoolIds && !matchName) return false;
 } else if (groupFilter.startsWith("default:")) {
 const defType = groupFilter.slice(8);
 if (pool.type !== defType) return false;
 }
 }

 // Search query
 if (searchQuery.trim()) {
 const q = searchQuery.toLowerCase().trim();
 const matchName = (pool.name || "").toLowerCase().includes(q);
 const matchUrl = (pool.proxyUrl || "").toLowerCase().includes(q);
 const matchNoProxy = (pool.noProxy || "").toLowerCase().includes(q);
 const matchGroup = (pool.group || "").toLowerCase().includes(q);
 const matchCustomGroup = (poolCustomGroupsMap.get(pool.id) || []).some((g) =>
 g.name.toLowerCase().includes(q)
 );
 return matchName || matchUrl || matchNoProxy || matchGroup || matchCustomGroup;
 }

 return true;
 });
 }, [proxyPools, typeFilter, groupFilter, searchQuery, poolCustomGroupsMap, proxyGroups.customGroups]);

 useEffect(() => {
 setCurrentPage(1);
 }, [searchQuery, typeFilter, groupFilter, pageSize]);

 const totalPages = Math.max(
 1,
 Math.ceil(filteredProxyPools.length / (pageSize === "all" ? filteredProxyPools.length || 1 : pageSize))
 );

 const paginatedProxyPools = useMemo(() => {
 if (pageSize === "all") return filteredProxyPools;
 const start = (currentPage - 1) * pageSize;
 return filteredProxyPools.slice(start, start + pageSize);
 }, [filteredProxyPools, currentPage, pageSize]);

 const disabledCount = useMemo(
 () => proxyPools.filter((pool) => pool.isActive === false).length,
 [proxyPools]
 );

 const pageIds = useMemo(() => paginatedProxyPools.map((p) => p.id), [paginatedProxyPools]);
 const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
 const allFilteredSelected = filteredProxyPools.length > 0 && filteredProxyPools.every((p) => selectedIds.includes(p.id));

 const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

 const toggleSelectPage = () => {
 if (allPageSelected) {
 const pageSet = new Set(pageIds);
 setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
 } else {
 setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
 }
 };

 const selectAllFiltered = () => {
 setSelectedIds((prev) => [...new Set([...prev, ...filteredProxyPools.map((p) => p.id)])]);
 };

 const clearSelection = () => setSelectedIds([]);

 const handleDeleteAllDisabled = () => {
 if (disabledCount === 0) return;
 setConfirmState({
 title: "Delete All Disabled Proxies",
 message: `Delete all ${disabledCount} disabled proxy pool(s)? Proxies bound to active connections will be preserved.`,
 onConfirm: async () => {
 setConfirmState(null);
 setBulkBusy(true);
 try {
 const res = await fetch("/api/proxy-pools?scope=disabled", { method: "DELETE" });
 const data = await res.json();
 if (res.ok) {
 notify.success(`Deleted ${data.count} disabled proxy pool(s)`);
 await fetchProxyPools();
 clearSelection();
 } else {
 notify.error(data.error || "Failed to delete disabled proxy pools");
 }
 } catch (err) {
 console.error("Error deleting disabled proxy pools:", err);
 notify.error("Failed to delete disabled proxy pools");
 } finally {
 setBulkBusy(false);
 }
 },
 });
 };

 const bulkSetActive = async (isActive) => {
 const targets = selectedIds.length > 0 ? selectedIds : proxyPools.map((p) => p.id);
 if (targets.length === 0) return;
 setBulkBusy(true);
 try {
 let ok = 0; let failed = 0;
 for (const id of targets) {
 try {
 const res = await fetch(`/api/proxy-pools/${id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isActive }),
 });
 if (res.ok) ok += 1; else failed += 1;
 } catch { failed += 1; }
 }
 await fetchProxyPools();
 notify.success(`${isActive ? "Activated" : "Deactivated"} ${ok}${failed ? `, failed ${failed}` : ""}`);
 } finally {
 setBulkBusy(false);
 }
 };

 const bulkDelete = async () => {
 if (selectedIds.length === 0) return;
 setConfirmState({
 title: "Delete Proxy Pools",
 message: `Delete ${selectedIds.length} proxy pool(s)?`,
 onConfirm: async () => {
 setConfirmState(null);
 setBulkBusy(true);
 try {
 let ok = 0; let blocked = 0; let failed = 0;
 for (const id of selectedIds) {
 try {
 const res = await fetch(`/api/proxy-pools/${id}`, { method: "DELETE" });
 if (res.ok) ok += 1;
 else if (res.status === 409) blocked += 1;
 else failed += 1;
 } catch { failed += 1; }
 }
 await fetchProxyPools();
 clearSelection();
 notify.success(`Deleted ${ok}${blocked ? `, ${blocked} bound` : ""}${failed ? `, ${failed} failed` : ""}`);
 } finally {
 setBulkBusy(false);
 }
 }
 });
 };

 const handleHealthCheck = async () => {
 const targets = selectedIds.length > 0
 ? proxyPools.filter((p) => selectedIds.includes(p.id))
 : proxyPools;
 if (targets.length === 0) return;
 setHealthChecking(true);
 setHealthProgress({ current: 0, total: targets.length });
 let alive = 0; const deadIds = [];
 let done = 0;
 const CONCURRENCY = 10;
 const queue = [...targets];

 const worker = async () => {
 while (queue.length > 0) {
 const pool = queue.shift();
 if (!pool) break;
 try {
 const res = await fetch(`/api/proxy-pools/${pool.id}/test`, { method: "POST" });
 const data = await res.json();
 if (res.ok && data.ok) alive += 1; else deadIds.push(pool.id);
 } catch {
 deadIds.push(pool.id);
 } finally {
 done += 1;
 setHealthProgress({ current: done, total: targets.length });
 }
 }
 };

 await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
 await fetchProxyPools();
 setHealthChecking(false);
 setHealthProgress({ current: 0, total: 0 });

 if (deadIds.length > 0) {
 setConfirmState({
 title: "Disable Dead Proxies",
 message: `Alive: ${alive}, Dead: ${deadIds.length}.\n\nDisable ${deadIds.length} dead proxies?`,
 onConfirm: async () => {
 setConfirmState(null);
 setBulkBusy(true);
 try {
 for (const id of deadIds) {
 try {
 await fetch(`/api/proxy-pools/${id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ isActive: false }),
 });
 } catch {}
 }
 await fetchProxyPools();
 notify.success(`Disabled ${deadIds.length} dead proxies`);
 } finally {
 setBulkBusy(false);
 }
 }
 });
 } else {
 notify.success(`Health check done. Alive: ${alive}, Dead: ${deadIds.length}`);
 }
 };

 // Cleanup selectedIds when pools change
 useEffect(() => {
 setSelectedIds((prev) => prev.filter((id) => proxyPools.some((p) => p.id === id)));
 }, [proxyPools]);

 const openBatchImportModal = () => {
 setBatchImportText("");
 setBatchGroupOption("none");
 setBatchExistingGroupId("");
 setBatchNewGroupName("");
 setBatchImportGroup("");
 setShowBatchImportModal(true);
 };

 const closeBatchImportModal = () => {
 if (importing) return;
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

 const openCloudflareModal = () => {
 setCloudflareForm({ accountId: "", apiToken: "", projectName: "cloudflare-relay" });
 setShowCloudflareModal(true);
 };

 const closeCloudflareModal = () => {
 if (deploying) return;
 setShowCloudflareModal(false);
 };

 const openCloudflareBulkModal = () => {
 setCloudflareBulkPoolName("cloudflare-relay");
 setCloudflareBulkText("");
 setCloudflareBulkResults([]);
 setCloudflareBulkProgress({ total: 0, completed: 0, success: 0, failed: 0, currentBatch: 0, totalBatches: 0 });
 setShowCloudflareBulkModal(true);
 };

 const closeCloudflareBulkModal = () => {
 if (bulkCloudflareDeploying) return;
 setShowCloudflareBulkModal(false);
 };

 const openDenoModal = () => {
 setDenoForm({ denoToken: "", orgDomain: "", projectName: "" });
 setShowDenoModal(true);
 };

 const closeDenoModal = () => {
 if (deploying) return;
 setShowDenoModal(false);
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
 closeVercelModal();
 notify.success(`Deployed: ${data.deployUrl}`);
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

 const handleCloudflareDeploy = async () => {
 if (!cloudflareForm.accountId.trim() || !cloudflareForm.apiToken.trim()) return;
 setDeploying(true);
 try {
 const res = await fetch("/api/proxy-pools/cloudflare-deploy", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(cloudflareForm),
 });
 const data = await res.json();
 if (res.ok) {
 await fetchProxyPools();
 closeCloudflareModal();
 notify.success(`Deployed: ${data.deployUrl}`);
 } else {
 notify.error(data.error || "Deploy failed");
 }
 } catch (error) {
 console.log("Error deploying Cloudflare relay:", error);
 notify.error("Deploy failed");
 } finally {
 setDeploying(false);
 }
 };

 const handleCloudflareBulkDeploy = async () => {
 const poolBase = cloudflareBulkPoolName.trim()
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-+|-+$/g, "")
 .slice(0, 32) || "cloudflare-relay";

 const entries = cloudflareBulkText
 .split(/\r?\n/)
 .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
 .filter(({ line }) => line.length > 0)
 .map(({ line, lineNumber }, index) => {
 const [label = "", accountId = "", apiToken = "", ...extra] = line.split("|").map((part) => part.trim());
 return {
 lineNumber,
 label,
 accountId,
 apiToken,
 projectName: `${poolBase}-${index + 1}`,
 valid: Boolean(label && accountId && apiToken && !extra.length),
 };
 });

 if (!entries.length) return;

 const maskAccountId = (accountId) => accountId.length > 8 ? `${accountId.slice(0, 4)}…${accountId.slice(-4)}` : "••••";
 setCloudflareBulkResults(entries.map((entry) => ({
 lineNumber: entry.lineNumber,
 label: entry.label || `Line ${entry.lineNumber}`,
 accountId: entry.accountId ? maskAccountId(entry.accountId) : "—",
 projectName: entry.projectName,
 status: entry.valid ? "pending" : "failed",
 error: entry.valid ? "" : "Format harus name/email|accountID|apiToken",
 })));
 setBulkCloudflareDeploying(true);

 const validEntries = entries.map((entry, index) => ({ ...entry, originalIndex: index })).filter((entry) => entry.valid);
 const BATCH_SIZE = 10;
 const totalBatches = Math.ceil(validEntries.length / BATCH_SIZE) || 1;

 let successCount = 0;
 let failedCount = entries.filter((entry) => !entry.valid).length;

 setCloudflareBulkProgress({
 total: entries.length,
 completed: failedCount,
 success: 0,
 failed: failedCount,
 currentBatch: validEntries.length > 0 ? 1 : 0,
 totalBatches,
 });

 try {
 for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
 const batch = validEntries.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
 if (!batch.length) continue;

 setCloudflareBulkProgress((prev) => ({
 ...prev,
 currentBatch: batchIndex + 1,
 }));

 // Mark batch items as running
 const runningIndices = new Set(batch.map((item) => item.originalIndex));
 setCloudflareBulkResults((previous) => previous.map((result, idx) => (
 runningIndices.has(idx) ? { ...result, status: "running" } : result
 )));

 // Run 10 items in parallel
 await Promise.all(
 batch.map(async (entry) => {
 const index = entry.originalIndex;
 try {
 const res = await fetch("/api/proxy-pools/cloudflare-deploy", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ accountId: entry.accountId, apiToken: entry.apiToken, projectName: entry.projectName }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

 successCount += 1;
 setCloudflareBulkResults((previous) => previous.map((result, resultIndex) => (
 resultIndex === index ? { ...result, status: "success", deployUrl: data.deployUrl || "Deployed" } : result
 )));
 setCloudflareBulkProgress((prev) => ({
 ...prev,
 completed: prev.completed + 1,
 success: prev.success + 1,
 }));
 } catch (error) {
 failedCount += 1;
 setCloudflareBulkResults((previous) => previous.map((result, resultIndex) => (
 resultIndex === index ? { ...result, status: "failed", error: error.message || "Deploy failed" } : result
 )));
 setCloudflareBulkProgress((prev) => ({
 ...prev,
 completed: prev.completed + 1,
 failed: prev.failed + 1,
 }));
 }
 })
 );
 }

 await fetchProxyPools();
 if (failedCount) notify.error(`${successCount} deployed, ${failedCount} failed`);
 else notify.success(`${successCount} Cloudflare relays deployed`);
 } catch (error) {
 notify.error(error.message || "Bulk deploy failed");
 } finally {
 setBulkCloudflareDeploying(false);
 }
 };

 const handleDenoDeploy = async () => {
 if (!denoForm.denoToken.trim()) return;
 setDeploying(true);
 try {
 const res = await fetch("/api/proxy-pools/deno-deploy", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(denoForm),
 });
 const data = await res.json();
 if (res.ok) {
 await fetchProxyPools();
 closeDenoModal();
 notify.success(`Deployed: ${data.deployUrl}`);
 } else {
 notify.error(data.error || "Deploy failed");
 }
 } catch (error) {
 console.log("Error deploying Deno relay:", error);
 notify.error("Deploy failed");
 } finally {
 setDeploying(false);
 }
 };

 const parseProxyLine = (line) => {
 const trimmed = line.trim();
 if (!trimmed) return null;

 let parsedUrl = null;
 if (trimmed.includes("://")) {
 parsedUrl = new URL(trimmed);
 } else if (trimmed.includes("@")) {
 parsedUrl = new URL(`http://${trimmed}`);
 } else {
 const parts = trimmed.split(":");
 if (parts.length === 4) {
 const [host, port, username, password] = parts;
 if (!host || !port || !username || !password) {
 throw new Error("Invalid host:port:user:pass format");
 }
 parsedUrl = new URL(`http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`);
 } else if (parts.length === 2) {
 const [host, port] = parts;
 if (host && port && !isNaN(port)) {
 parsedUrl = new URL(`http://${host}:${port}`);
 }
 }
 }

 if (!parsedUrl) {
 throw new Error("Unsupported format (expected user:pass@host:port, host:port:user:pass, or protocol://...)");
 }

 const hostLabel = parsedUrl.port ? `${parsedUrl.hostname}:${parsedUrl.port}` : parsedUrl.hostname;
 let proxyUrl = parsedUrl.toString();
 if (parsedUrl.pathname === "/" && !parsedUrl.search && !parsedUrl.hash) {
 proxyUrl = proxyUrl.slice(0, -1);
 }

 return {
 proxyUrl,
 name: `Imported ${hostLabel}`,
 };
 };

 const handleBatchImport = async () => {
 const lines = batchImportText
 .split(/\r?\n/)
 .map((line) => line.trim())
 .filter(Boolean);

 if (lines.length === 0) {
 notify.warning("Please paste at least one proxy line.");
 return;
 }

 const parsedEntries = [];
 const invalidLines = [];

 lines.forEach((line, index) => {
 try {
 const parsed = parseProxyLine(line);
 if (parsed) {
 parsedEntries.push({
 ...parsed,
 lineNumber: index + 1,
 });
 }
 } catch (error) {
 invalidLines.push(`Line ${index + 1}: ${error.message}`);
 }
 });

 if (invalidLines.length > 0) {
 notify.error(`Invalid proxy format:\n${invalidLines.join("\n")}`);
 return;
 }

 // Determine target group name and linkage
 let targetGroupName = "";
 let targetCustomGroupId = null;
 let shouldCreateCustomGroup = false;

 if (batchGroupOption === "existing") {
 const found = (proxyGroups.customGroups || []).find((g) => g.id === batchExistingGroupId);
 if (!found) {
 notify.error("Please select an existing custom group");
 return;
 }
 targetGroupName = found.name;
 targetCustomGroupId = found.id;
 } else if (batchGroupOption === "new") {
 const trimmed = batchNewGroupName.trim();
 if (!trimmed) {
 notify.error("Please enter a group name");
 return;
 }
 const RESERVED_NAMES = new Set([
 "cloudflare", "cloudflare relay", "http", "vercel", "deno",
 "default-cloudflare", "default-http", "default-vercel", "default-deno",
 ]);
 if (RESERVED_NAMES.has(trimmed.toLowerCase())) {
 notify.error(`"${trimmed}" is a reserved system default group name`);
 return;
 }
 targetGroupName = trimmed;
 const existingGroup = (proxyGroups.customGroups || []).find(
 (g) => g.name.toLowerCase() === trimmed.toLowerCase()
 );
 if (existingGroup) {
 targetCustomGroupId = existingGroup.id;
 } else {
 shouldCreateCustomGroup = true;
 }
 }

 setImporting(true);
 try {
 // Canonical key: URL-normalized (lowercase scheme+host, no trailing
 // slash) so `http://HOST:port` in DB matches `http://host:port` pasted.
 // Raw string compare caused false "Skipped" AND false "Created dupes".
 const normalizeProxyKey = (url, noProxy = "") => {
 let u = String(url || "").trim();
 try {
 const parsed = new URL(u);
 parsed.hostname = parsed.hostname.toLowerCase();
 u = parsed.toString();
 } catch {
 // Non-URL value — compare trimmed raw.
 }
 u = u.replace(/\/+$/, "");
 return `${u}|||${String(noProxy || "").trim()}`;
 };

 const existingByKey = new Map();
 for (const pool of proxyPools) {
 existingByKey.set(normalizeProxyKey(pool.proxyUrl, pool.noProxy), pool);
 }

 let created = 0;
 let skipped = 0;
 let failed = 0;
 const createdPoolIds = [];
 const matchedPoolIds = []; // existing pools hit by import (also linked to group)
 const seenBatchKeys = new Set(); // dupes inside pasted text itself

 for (const entry of parsedEntries) {
 const dedupeKey = normalizeProxyKey(entry.proxyUrl, "");
 const existing = existingByKey.get(dedupeKey);
 if (existing || seenBatchKeys.has(dedupeKey)) {
 skipped += 1;
 if (existing?.id) matchedPoolIds.push(existing.id);
 continue;
 }

 const res = await fetch("/api/proxy-pools", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 name: entry.name,
 proxyUrl: entry.proxyUrl,
 noProxy: "",
 group: targetGroupName,
 isActive: true,
 }),
 });

 if (res.ok) {
 created += 1;
 seenBatchKeys.add(dedupeKey);
 try {
 const data = await res.json();
 if (data?.proxyPool?.id) {
 createdPoolIds.push(data.proxyPool.id);
 existingByKey.set(dedupeKey, data.proxyPool);
 }
 } catch {}
 } else {
 failed += 1;
 }
 }

 // Link newly created pools (+ matched existing pools on "existing group"
 // imports) to custom group if requested. Without this, imports into an
 // existing group created orphan pools not linked to the group.
 const linkPoolIds = [...new Set([...createdPoolIds, ...(targetCustomGroupId ? matchedPoolIds : [])])];
 if (linkPoolIds.length > 0) {
 if (targetCustomGroupId) {
 const targetGroup = (proxyGroups.customGroups || []).find((g) => g.id === targetCustomGroupId);
 const currentPoolIds = Array.isArray(targetGroup?.poolIds) ? targetGroup.poolIds : [];
 const updatedPoolIds = [...new Set([...currentPoolIds, ...linkPoolIds])];
 try {
 await fetch(`/api/proxy-groups/${targetCustomGroupId}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ poolIds: updatedPoolIds }),
 });
 } catch (err) {
 console.log("Failed to update custom group with new pools:", err);
 }
 } else if (shouldCreateCustomGroup && targetGroupName) {
 try {
 await fetch("/api/proxy-groups", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 name: targetGroupName,
 description: `Created during batch import (${linkPoolIds.length} proxies)`,
 poolIds: linkPoolIds,
 isSticky: false,
 stickyLimit: 3,
 }),
 });
 } catch (err) {
 console.log("Failed to create custom group for batch import:", err);
 }
 }
 }

 await fetchProxyPools();
 await fetchProxyGroups();
 setShowBatchImportModal(false);
 notify.success(`Batch import completed: Created ${created}, Skipped ${skipped}, Failed ${failed}`);
 } catch (error) {
 console.log("Error batch importing proxies:", error);
 notify.error("Batch import failed");
 } finally {
 setImporting(false);
 }
 };

 const activeCount = useMemo(
 () => proxyPools.filter((pool) => pool.isActive === true).length,
 [proxyPools]
 );



 if (loading) {
 return (
 <div className="flex w-full flex-col gap-3">
 <CardSkeleton />
 <CardSkeleton />
 </div>
 );
 }

  const copy = TAB_COPY[activeTab] || TAB_COPY.pools;
  const totalGroups = (proxyGroups.defaultGroups?.length || 4) + (proxyGroups.customGroups?.length || 0);
  const TABS = [
    { value: "pools", label: `Proxy Pools${proxyPools.length ? ` (${proxyPools.length})` : ""}`, icon: "lan" },
    { value: "groups", label: `Proxy Groups${totalGroups ? ` (${totalGroups})` : ""}`, icon: "folder_special" },
    { value: "fitness", label: "Proxy Fitness", icon: "network_check" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Top Header Card */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-base font-semibold tracking-tight text-text-main">{copy.title}</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{copy.body}</p>
        </div>

        {activeTab === "pools" ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={relayMenuRef}>
              <Button
                size="sm"
                variant="secondary"
                icon="rocket_launch"
                onClick={() => setShowRelayMenu(!showRelayMenu)}
              >
                Deploy Relay
                <Icon name={showRelayMenu ? "expand_less" : "expand_more"} size={18} className="ml-1" />
              </Button>

              {showRelayMenu && (
                <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-sm border border-border bg-surface shadow-lg sm:left-auto sm:right-0">
                  <button
                    onClick={() => {
                      openCloudflareModal();
                      setShowRelayMenu(false);
                    }}
                    className="flex w-full min-h-11 sm:min-h-9 items-center gap-2 rounded-sm px-3 text-sm text-text-main hover:bg-surface-2"
                  >
                    <Icon className="text-warning" name="cloud" size={18} />
                    Cloudflare Relay
                  </button>
                  <button
                    onClick={() => {
                      openCloudflareBulkModal();
                      setShowRelayMenu(false);
                    }}
                    className="flex w-full min-h-11 sm:min-h-9 items-center gap-2 rounded-sm px-3 text-sm text-text-main hover:bg-surface-2"
                  >
                    <Icon className="text-warning" name="playlist_add" size={18} />
                    CF Bulk
                  </button>
                  <button
                    onClick={() => {
                      openVercelModal();
                      setShowRelayMenu(false);
                    }}
                    className="flex w-full min-h-11 sm:min-h-9 items-center gap-2 rounded-sm px-3 text-sm text-text-main hover:bg-surface-2"
                  >
                    <Icon className="text-primary" name="cloud_upload" size={18} />
                    Vercel Relay
                  </button>
                  <button
                    onClick={() => {
                      openDenoModal();
                      setShowRelayMenu(false);
                    }}
                    className="flex w-full min-h-11 sm:min-h-9 items-center gap-2 rounded-sm px-3 text-sm text-text-main hover:bg-surface-2"
                  >
                    <Icon className="text-success" name="terminal" size={18} />
                    Deno Relay
                  </button>
                </div>
              )}
            </div>

            <Button size="sm" variant="secondary" icon="upload" onClick={openBatchImportModal}>
              Batch Import
            </Button>
            <Button size="sm" icon="add" onClick={openCreateModal}>
              Add Proxy Pool
            </Button>
          </div>
        ) : activeTab === "groups" ? (
          <div className="flex items-center gap-2">
            <Button size="sm" icon="add" onClick={openCreateGroupModal}>
              Add Custom Group
            </Button>
          </div>
        ) : null}
      </div>

      {/* Sticky Tab Bar */}
      <div className="-mx-3 flex items-center gap-2 border-b border-border bg-bg px-3 py-2 sm:mx-0 sm:rounded-lg sm:border sm:px-3">
        <div
          ref={tabsRef}
          className="tab-scroll-fade w-full min-w-0 overflow-x-auto no-scrollbar"
        >
          <SegmentedControl
            options={TABS}
            value={activeTab}
            onChange={handleTabChange}
            size="touch"
            snap
            className="w-full min-w-max sm:w-auto"
          />
        </div>
      </div>

      {activeTab === "pools" ? (
        <Card>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {paginatedProxyPools.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer font-medium min-h-11 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectPage}
                    className="size-4 rounded-sm border-border"
                  />
                  {allPageSelected ? "Unselect page" : "Select page"}
                </label>
              )}
              {selectedIds.length > 0 && !allFilteredSelected && filteredProxyPools.length > paginatedProxyPools.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="min-h-11 sm:min-h-0 text-xs font-medium text-primary hover:underline flex items-center"
                >
                  Select all {filteredProxyPools.length}
                </button>
              )}
              <Badge variant="default">Total: {proxyPools.length}</Badge>
              {filteredProxyPools.length !== proxyPools.length && (
                <Badge variant="default">Filtered: {filteredProxyPools.length}</Badge>
              )}
              <Badge variant="success">Active: {activeCount}</Badge>
              {disabledCount > 0 && (
                <Badge variant="error">Disabled: {disabledCount}</Badge>
              )}
              {disabledCount > 0 && (
                <Button
                  size="sm"
                  variant="danger"
                  icon="delete_sweep"
                  onClick={handleDeleteAllDisabled}
                  disabled={bulkBusy || healthChecking}
                  title="Delete all disabled proxy pools not in use"
                >
                  Delete Disabled ({disabledCount})
                </Button>
              )}
            </div>

            {/* Search & Type Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1 sm:w-56 sm:flex-none">
                <Icon name="search" size={18} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search proxies..."
                  className="w-full min-h-11 sm:min-h-9 rounded-sm border border-border bg-surface py-1.5 pl-8 pr-8 text-xs text-text-main focus:border-primary focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-0 top-1/2 -translate-y-1/2 size-11 sm:size-8 flex items-center justify-center text-text-muted hover:text-text-main"
                  >
                    <Icon name="close" size={18} />
                  </button>
                )}
              </div>

              {/* Proxy Group Filter */}
              <div className="flex items-center gap-1">
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="min-h-11 sm:min-h-9 rounded-sm border border-border bg-surface py-1.5 px-2.5 text-xs text-text-main focus:border-primary focus:outline-none font-medium"
                  title="Filter by Proxy Group"
                >
                  <option value="all">All Groups</option>
                  <option value="ungrouped">Ungrouped (No Group)</option>
                  {(proxyGroups.customGroups || []).length > 0 && (
                    <optgroup label="Custom Groups">
                      {(proxyGroups.customGroups || []).map((g) => (
                        <option key={g.id} value={`custom:${g.id}`}>
                          {g.name} ({g.poolCount || g.poolIds?.length || 0})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(proxyGroups.defaultGroups || []).length > 0 && (
                    <optgroup label="Default Groups">
                      {(proxyGroups.defaultGroups || []).map((g) => (
                        <option key={g.id} value={`default:${g.type}`}>
                          {g.name} ({g.poolCount || 0})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {groupFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setGroupFilter("all")}
                    className="size-11 sm:size-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-main hover:bg-surface-2"
                    title="Clear group filter"
                  >
                    <Icon name="cancel" size={18} />
                  </button>
                )}
              </div>

              <SegmentedControl
                options={[
                  { value: "all", label: "All" },
                  { value: "http", label: "HTTP" },
                  { value: "relay", label: "Relay" },
                  { value: "cloudflare", label: "Cloudflare" },
                ]}
                value={typeFilter}
                onChange={setTypeFilter}
                size="touch"
                snap
                aria-label="Filter by proxy type"
              />
            </div>
          </div>

 {(selectedIds.length > 0 || healthChecking) && (
 <div className="mb-3 flex flex-wrap items-center gap-2 rounded-sm border border-primary/30 bg-primary/10 px-3 py-2">
 <Icon className="text-primary" name="checklist" size={18} />
 <span className="text-xs font-medium text-primary">
 {selectedIds.length > 0 ? `${selectedIds.length} selected` : "All pools"}
 </span>
 <div className="ml-auto flex flex-wrap items-center gap-2">
 <Button
 size="sm"
 icon={healthChecking ? "progress_activity" : "health_and_safety"}
 onClick={handleHealthCheck}
 disabled={healthChecking || bulkBusy || proxyPools.length === 0}
 >
 {healthChecking ? `Checking ${healthProgress.current}/${healthProgress.total}` : "Health Check"}
 </Button>
 {selectedIds.length > 0 && (
 <>
 <Button size="sm" variant="secondary" icon="toggle_on" onClick={() => bulkSetActive(true)} disabled={bulkBusy || healthChecking}>
 Activate
 </Button>
 <Button size="sm" variant="secondary" icon="toggle_off" onClick={() => bulkSetActive(false)} disabled={bulkBusy || healthChecking}>
 Deactivate
 </Button>
 <Button size="sm" variant="secondary" icon="delete" onClick={bulkDelete} disabled={bulkBusy || healthChecking}>
 Delete
 </Button>
 <Button size="sm" variant="ghost" onClick={clearSelection} disabled={bulkBusy || healthChecking}>
 Clear
 </Button>
 </>
 )}
 </div>
 </div>
 )}

 {proxyPools.length === 0 ? (
 <div className="text-center py-3">
 <p className="text-text-main font-medium mb-1">No proxy pool entries yet</p>
 <p className="text-sm text-text-muted mb-3">
 Create a proxy pool entry, then assign it to connections.
 </p>
 <Button icon="add" onClick={openCreateModal}>Add Proxy Pool</Button>
 </div>
 ) : filteredProxyPools.length === 0 ? (
 <div className="text-center py-3">
 <p className="text-text-main font-medium mb-1">No proxies match filter</p>
 <p className="text-sm text-text-muted mb-3">
 Try adjusting your search query, group, or type filter.
 </p>
 <Button variant="secondary" size="sm" onClick={() => { setSearchQuery(""); setTypeFilter("all"); setGroupFilter("all"); }}>
 Reset Filter
 </Button>
 </div>
 ) : (
 <>
 <div className="flex flex-col divide-y divide-border">
 {paginatedProxyPools.map((pool) => (
 <div key={pool.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-start gap-3 min-w-0 flex-1">
 <input
 type="checkbox"
 checked={selectedIds.includes(pool.id)}
 onChange={() => toggleSelect(pool.id)}
 className="mt-1 size-4 shrink-0 rounded-sm border-border"
 />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 flex-wrap">
 <p className="min-w-0 max-w-full truncate text-sm font-medium sm:max-w-[18rem]">{pool.name}</p>
 <Badge variant={getStatusVariant(pool.testStatus)} size="sm" dot>
 {pool.testStatus || "unknown"}
 </Badge>
 <Badge variant={pool.isActive ? "success" : "default"} size="sm">
 {pool.isActive ? "active" : "inactive"}
 </Badge>
 {pool.type === "vercel" && (
 <Badge variant="default" size="sm">vercel relay</Badge>
 )}
 {pool.type === "cloudflare" && (
 <Badge variant="default" size="sm">cloudflare relay</Badge>
 )}
 {pool.type === "deno" && (
 <Badge variant="default" size="sm">deno relay</Badge>
 )}
 {(() => {
 const customList = poolCustomGroupsMap.get(pool.id) || [];
 const seenNames = new Set();
 const groupsToShow = [];
 for (const g of customList) {
 if (!seenNames.has(g.name)) {
 seenNames.add(g.name);
 groupsToShow.push({ name: g.name, filterId: `custom:${g.id}` });
 }
 }
 if (pool.group && !seenNames.has(pool.group)) {
 groupsToShow.push({ name: pool.group, filterId: null });
 }
 if (groupsToShow.length === 0) return null;
 return (
 <div className="flex flex-wrap gap-1 items-center">
 {groupsToShow.map((g, idx) => (
 <button
 key={idx}
 type="button"
 onClick={() => g.filterId && setGroupFilter(g.filterId)}
 className={`inline-flex items-center rounded-sm bg-primary/10 px-2 py-1 text-xs font-medium text-primary ${
 g.filterId ? "hover:bg-primary/10 cursor-pointer" : ""
 }`}
 title={g.filterId ? `Filter by group: ${g.name}` : undefined}
 >
 grp: {g.name}
 </button>
 ))}
 </div>
 );
 })()}
 <Badge variant="default" size="sm">
 {pool.boundConnectionCount || 0} bound
 </Badge>
 </div>
 <p className="text-xs text-text-muted truncate mt-1">{pool.proxyUrl}</p>
 {pool.noProxy ? (
 <p className="text-xs text-text-muted truncate">No proxy: {pool.noProxy}</p>
 ) : null}
 <p className="text-[11px] text-text-muted mt-1">
 Last tested: {formatDateTime(pool.lastTestedAt)}
 {pool.lastError ? ` · ${pool.lastError}` : ""}
 </p>
 </div>
 </div>

 <div className="flex items-center justify-end gap-1">
 <Toggle
 size="sm"
 checked={pool.isActive === true}
 onChange={() => handleToggleActive(pool)}
 title={pool.isActive ? "Disable" : "Enable"}
 />
                  <button
                    onClick={() => handleTest(pool.id)}
                    className="size-11 sm:size-8 flex items-center justify-center shrink-0 rounded-sm text-text-muted hover:bg-surface-2 hover:text-primary"
                    title="Test proxy"
                    disabled={testingId === pool.id}
                  >
                    <Icon
                      name={testingId === pool.id ? "progress_activity" : "science"}
                      size={18}
                      style={testingId === pool.id ? { animation: "spin 1s linear infinite" } : undefined}
                    />
                  </button>
                  <button
                    onClick={() => openEditModal(pool)}
                    className="size-11 sm:size-8 flex items-center justify-center shrink-0 rounded-sm text-text-muted hover:bg-surface-2 hover:text-text-main"
                    title="Edit"
                  >
                    <Icon name="edit" size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(pool)}
                    className="size-11 sm:size-8 flex items-center justify-center shrink-0 rounded-sm text-danger hover:bg-danger/10"
                    title="Delete"
                  >
                    <Icon name="delete" size={18} />
                  </button>
 </div>
 </div>
 ))}
 </div>

 {filteredProxyPools.length > 0 && (
 <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border pt-3 text-xs text-text-muted ">
 <div className="flex items-center gap-3">
 <span>
 Showing{" "}
 <span className="font-medium text-text-main">
 {pageSize === "all" ? 1 : (currentPage - 1) * pageSize + 1}
 </span>
 -
 <span className="font-medium text-text-main">
 {pageSize === "all"
 ? filteredProxyPools.length
 : Math.min(currentPage * pageSize, filteredProxyPools.length)}
 </span>{" "}
 of <span className="font-medium text-text-main">{filteredProxyPools.length}</span> proxies
 {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
 </span>
 <div className="flex items-center gap-1.5">
 <span className="text-text-muted">Per page:</span>
 <select
 value={pageSize}
 onChange={(e) => {
 const val = e.target.value === "all" ? "all" : Number(e.target.value);
 setPageSize(val);
 }}
                      className="min-h-11 sm:min-h-8 rounded-sm border border-border bg-surface px-2 py-1 text-xs text-text-main focus:border-primary focus:outline-none"
                    >
 <option value={25}>25</option>
 <option value={50}>50</option>
 <option value={100}>100</option>
 <option value={200}>200</option>
 <option value="all">All</option>
 </select>
 </div>
 </div>

 {totalPages > 1 && (
 <div className="flex flex-wrap items-center gap-1">
 <button
 type="button"
 onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
 disabled={currentPage <= 1}
                      className="inline-flex min-h-11 sm:min-h-8 sm:h-8 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-xs font-medium text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
 title="Previous Page"
 >
 <Icon name="chevron_left" size={18} />
 <span>Prev</span>
 </button>

 {getPaginationItems(currentPage, totalPages).map((item, idx) => {
 if (typeof item === "string") {
 return (
 <span key={`ellipsis-${idx}`} className="px-1 text-text-muted select-none">
 …
 </span>
 );
 }
 const isCurrent = item === currentPage;
 return (
 <button
 key={item}
 type="button"
 onClick={() => setCurrentPage(item)}
                        className={`min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 sm:h-8 rounded-sm text-xs font-medium px-1.5 flex items-center justify-center ${
 isCurrent
 ? "bg-primary text-white "
 : "border border-border bg-surface text-text-main hover:bg-surface-2"
 }`}
 >
 {item}
 </button>
 );
 })}

 <button
 type="button"
 onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
 disabled={currentPage >= totalPages}
                      className="inline-flex min-h-11 sm:min-h-8 sm:h-8 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-xs font-medium text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
 title="Next Page"
 >
 <span>Next</span>
 <Icon name="chevron_right" size={18} />
 </button>
 </div>
 )}
 </div>
 )}
 </>
 )}
 </Card>
      ) : activeTab === "groups" ? (
 <div className="flex flex-col gap-3">
 {/* Default Automatic Groups */}
 <div className="flex flex-col gap-3">
 <div>
 <h2 className="text-sm font-semibold text-text-main flex items-center gap-2">
 <Icon className="text-primary" name="auto_awesome" size={18} />
 <span>Default Groups (Automatic by Type)</span>
 </h2>
 <p className="text-xs text-text-muted">
 Active proxy pools are grouped automatically by relay/protocol type with per-request round-robin rotation.
 </p>
 </div>

 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
 {(proxyGroups.defaultGroups || []).map((grp) => {
 const icon = grp.type === "cloudflare" ? "cloud" : grp.type === "vercel" ? "cloud_upload" : grp.type === "deno" ? "terminal" : "lan";
 const color = grp.type === "cloudflare" ? "text-warning bg-warning/10" : grp.type === "vercel" ? "text-primary bg-primary/10" : grp.type === "deno" ? "text-success bg-success/10" : "text-primary bg-primary/10";
 return (
 <Card key={grp.id} className="flex flex-col justify-between p-3">
 <div>
 <div className="flex items-center justify-between gap-2 mb-2">
 <div className={`flex size-8 items-center justify-center rounded-sm ${color}`}>
          <Icon name={icon} size={18} />
 </div>
 {grp.isSticky ? (
 <Badge variant="success">Sticky ({grp.stickyLimit}x)</Badge>
 ) : (
 <Badge variant="default">Round-Robin</Badge>
 )}
 </div>
 <h3 className="font-medium text-sm text-text-main">{grp.name}</h3>
 <p className="mt-1 text-xs text-text-muted">{grp.description}</p>
 </div>
 <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs h-8">
 <div>
 <span className="text-text-muted">Active Pools: </span>
 <span className="font-medium text-text-main font-mono">
 {grp.activeCount} / {grp.poolCount}
 </span>
 </div>
 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={() => {
 setGroupFilter(`default:${grp.type}`);
 setActiveTab("pools");
 }}
                    className="min-h-11 sm:min-h-8 px-2 rounded-sm text-xs text-text-muted hover:text-text-main flex items-center gap-1 font-medium hover:bg-surface-2"
                    title="View all pools in this group"
                  >
                    <Icon name="visibility" size={18} />
                    <span>View ({grp.poolCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditGroupModal(grp)}
                    className="min-h-11 sm:min-h-8 px-2 rounded-sm text-xs text-primary hover:underline flex items-center gap-1 font-medium hover:bg-primary/10"
                  >
                    <Icon name="tune" size={18} />
                    <span>Configure</span>
                  </button>
 </div>
 </div>
 </Card>
 );
 })}
 </div>
 </div>

 {/* Custom Groups */}
 <Card>
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
 <div>
 <h2 className="text-sm font-semibold text-text-main flex items-center gap-2">
 <Icon className="text-primary" name="folder_special" size={18} />
 <span>Custom Groups</span>
 </h2>
 <p className="text-xs text-text-muted">
 Custom groups allow bundling specific proxies with configurable sticky session limits.
 </p>
 </div>
 <Button size="sm" icon="add" onClick={openCreateGroupModal}>Add Custom Group</Button>
 </div>

 {loadingGroups ? (
 <div className="py-3 text-center text-sm text-text-muted">Loading proxy groups...</div>
 ) : (proxyGroups.customGroups || []).length === 0 ? (
 <div className="py-3 text-center">
 <Icon className="text-text-muted/50 mb-2" name="folder_off" size={18} />
 <p className="font-medium text-sm text-text-main">No custom proxy groups yet</p>
 <p className="text-xs text-text-muted mt-1 mb-3 max-w-sm mx-auto">
 Create a custom group to bundle selected proxies and choose between strict round-robin or sticky sessions.
 </p>
 <Button size="sm" icon="add" onClick={openCreateGroupModal}>Create Custom Group</Button>
 </div>
 ) : (
 <div className="flex flex-col divide-y divide-border">
 {proxyGroups.customGroups.map((grp) => {
 const poolNames = (grp.poolIds || [])
 .map((id) => proxyPools.find((p) => p.id === id)?.name)
 .filter(Boolean);

 return (
 <div key={grp.id} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-2 mb-1">
 <span className="font-semibold text-sm text-text-main">{grp.name}</span>
 {grp.isSticky ? (
 <Badge variant="success">Sticky ({grp.stickyLimit} reqs / proxy)</Badge>
 ) : (
 <Badge variant="default">Round-Robin (Every req)</Badge>
 )}
 <span className="text-xs text-text-muted font-mono">
 {grp.activeCount} active / {grp.poolCount} total
 </span>
 </div>
 {grp.description && (
 <p className="text-xs text-text-muted mb-2">{grp.description}</p>
 )}
 {poolNames.length > 0 && (
 <div className="flex flex-wrap gap-1 mt-1.5">
 {poolNames.slice(0, 8).map((name) => (
 <span key={name} className="inline-flex items-center rounded-sm bg-surface px-2 py-1 text-[11px] text-text-muted">
 {name}
 </span>
 ))}
 {poolNames.length > 8 && (
 <button
 type="button"
 onClick={() => {
 setGroupFilter(`custom:${grp.id}`);
 setActiveTab("pools");
 }}
 className="inline-flex items-center rounded-sm bg-primary/10 hover:bg-primary/10 px-2 py-1 text-[11px] text-primary font-medium cursor-pointer"
 >
 +{poolNames.length - 8} more (view all)
 </button>
 )}
 </div>
 )}
 </div>

 <div className="flex items-center gap-1 self-end sm:self-center">
 <Button
 size="sm"
 variant="secondary"
 icon="visibility"
 onClick={() => {
 setGroupFilter(`custom:${grp.id}`);
 setActiveTab("pools");
 }}
 title={`View proxies in ${grp.name}`}
 >
 View Proxies ({grp.poolCount})
 </Button>
 <Button size="sm" variant="ghost" icon="edit" onClick={() => openEditGroupModal(grp)}>
 Edit
 </Button>
 <Button size="sm" variant="ghost" icon="delete" onClick={() => handleDeleteGroup(grp)} className="text-danger hover:text-danger">
 Delete
 </Button>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </Card>
 </div>
      ) : (
        <ProxyFitnessTab />
 )}

 <Modal
 isOpen={showBatchImportModal}
 title="Batch Import Proxies"
 onClose={closeBatchImportModal}
 >
 <div className="flex flex-col gap-3">
 {/* Group Assignment Option */}
 <div className="flex flex-col gap-2">
 <label className="text-xs font-medium text-text-muted">Group Option</label>
 <div className="grid grid-cols-3 gap-1.5 size-8 rounded-sm bg-surface-2">
 <button
 type="button"
 onClick={() => setBatchGroupOption("none")}
 className={`py-1 px-2 text-xs font-medium rounded-sm ${
 batchGroupOption === "none"
 ? "bg-surface text-text-main "
 : "text-text-muted hover:text-text-main"
 }`}
 >
 No Group
 </button>
 <button
 type="button"
 onClick={() => setBatchGroupOption("existing")}
 disabled={(proxyGroups.customGroups || []).length === 0}
 className={`py-1 px-2 text-xs font-medium rounded-sm ${
 batchGroupOption === "existing"
 ? "bg-surface text-text-main "
 : "text-text-muted hover:text-text-main disabled:opacity-40 disabled:cursor-not-allowed"
 }`}
 title={(proxyGroups.customGroups || []).length === 0 ? "No custom groups created yet" : undefined}
 >
 Existing Group {(proxyGroups.customGroups || []).length > 0 ? `(${(proxyGroups.customGroups || []).length})` : ""}
 </button>
 <button
 type="button"
 onClick={() => setBatchGroupOption("new")}
 className={`py-1 px-2 text-xs font-medium rounded-sm ${
 batchGroupOption === "new"
 ? "bg-surface text-text-main "
 : "text-text-muted hover:text-text-main"
 }`}
 >
 New Group
 </button>
 </div>

 {batchGroupOption === "existing" && (
 <div className="mt-1">
 <select
 value={batchExistingGroupId}
 onChange={(e) => setBatchExistingGroupId(e.target.value)}
 className="w-full py-2 px-3 text-xs text-text-main bg-surface border border-border rounded-sm focus:border-primary focus:outline-none"
 >
 <option value="">-- Select custom group --</option>
 {(proxyGroups.customGroups || []).map((g) => (
 <option key={g.id} value={g.id}>
 {g.name} ({g.poolCount || g.poolIds?.length || 0} pools)
 </option>
 ))}
 </select>
 <p className="mt-1 text-[11px] text-text-muted">
 Imported proxies will be automatically added to this custom group.
 </p>
 </div>
 )}

 {batchGroupOption === "new" && (
 <div className="mt-1">
 <input
 type="text"
 value={batchNewGroupName}
 onChange={(e) => setBatchNewGroupName(e.target.value)}
 placeholder="Enter new group name (e.g. residential-sg, fast-us)"
 className="w-full py-2 px-3 text-xs text-text-main bg-surface border border-border rounded-sm focus:border-primary focus:outline-none"
 />
 <p className="mt-1 text-[11px] text-text-muted">
 A new custom proxy group will be created with all imported proxies.
 </p>
 </div>
 )}
 </div>

 <div>
 <label className="font-medium mb-1 block text-xs text-text-muted">Paste Proxy List (One per line)</label>
 <textarea
 value={batchImportText}
 onChange={(e) => setBatchImportText(e.target.value)}
 placeholder={"user:pass@host:port\nhttp://user:pass@127.0.0.1:7897\nhost:port:user:pass\nhost:port"}
 className="w-full min-h-[180px] h-8 px-3 text-sm text-text-main bg-surface border border-border rounded-sm focus:border-primary/30 focus:outline-none"
 />
 <p className="text-xs text-text-muted mt-1">
 Supported formats: user:pass@host:port, protocol://user:pass@host:port, host:port:user:pass, host:port
 </p>
 </div>

 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 <Button
 fullWidth
 onClick={handleBatchImport}
 disabled={
 !batchImportText.trim() ||
 importing ||
 (batchGroupOption === "existing" && !batchExistingGroupId) ||
 (batchGroupOption === "new" && !batchNewGroupName.trim())
 }
 >
 {importing ? "Importing..." : "Import"}
 </Button>
 <Button fullWidth variant="ghost" onClick={closeBatchImportModal} disabled={importing}>
 Cancel
 </Button>
 </div>
 </div>
 </Modal>

 <Modal
 isOpen={showVercelModal}
 title="Deploy Vercel Relay"
 onClose={closeVercelModal}
 >
 <div className="flex flex-col gap-3">
 <div className="rounded-sm bg-primary/10 border border-primary/30 p-3 flex flex-col gap-1.5">
 <p className="text-sm text-text-main font-medium">What is Vercel Relay?</p>
 <p className="text-xs text-text-muted">
 Deploys an edge relay function to Vercel. All AI provider requests will be forwarded through Vercel&apos;s edge network, masking your real IP from providers.
 </p>
 <ul className="text-xs text-text-muted list-disc pl-3 space-y-3">
 <li>Your IP is replaced by Vercel&apos;s dynamic edge IPs (hundreds of IPs across 20+ global regions)</li>
 <li>Vercel serves millions of apps — providers can&apos;t block Vercel IPs without affecting legitimate traffic</li>
 <li>Free tier: 100GB bandwidth/month, 500K edge invocations</li>
 <li>Deploy multiple relays on different accounts for more IP diversity</li>
 </ul>
 </div>
 <Input
 label="Vercel API Token"
 value={vercelForm.vercelToken}
 onChange={(e) => setVercelForm((prev) => ({ ...prev, vercelToken: e.target.value }))}
 placeholder="your-vercel-api-token"
 hint={<>Token is used once for deployment and not stored. <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Get token →</a></>}
 type="password"
 />
 <Input
 label="Project Name"
 value={vercelForm.projectName}
 onChange={(e) => setVercelForm((prev) => ({ ...prev, projectName: e.target.value }))}
 placeholder="my-relay"
 hint="Unique name for your Vercel project. Leave empty for auto-generated name."
 />
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 <Button
 fullWidth
 onClick={handleVercelDeploy}
 disabled={!vercelForm.vercelToken.trim() || deploying}
 >
 {deploying ? "Deploying... (may take ~1 min)" : "Deploy"}
 </Button>
 <Button fullWidth variant="ghost" onClick={closeVercelModal} disabled={deploying}>
 Cancel
 </Button>
 </div>
 </div>
 </Modal>

 <Modal
 isOpen={showCloudflareModal}
 title="Deploy Cloudflare Relay"
 onClose={closeCloudflareModal}
 >
 <div className="flex flex-col gap-3">
 <div className="rounded-sm bg-warning/10 border border-warning/30 p-3 flex flex-col gap-1.5">
 <p className="text-sm text-text-main font-medium">What is Cloudflare Relay?</p>
 <p className="text-xs text-text-muted">
 Deploys a Cloudflare Worker as a proxy relay. All AI provider requests will be forwarded through Cloudflare&apos;s global edge network.
 </p>
 <ul className="text-xs text-text-muted list-disc pl-3 space-y-3">
 <li>High performance global routing and IP masking via Cloudflare Workers</li>
 <li>Free tier: 100,000 requests per day</li>
 <li>Requires Cloudflare Account ID and a Workers API Token (Edit Workers permission)</li>
 </ul>
 <div className="mt-2 pt-2 border-t border-warning/30 text-xs text-text-muted">
 <p className="font-medium text-text-main mb-1">How to generate your API Token:</p>
 <ol className="list-decimal pl-3 space-y-3">
 <li>Go to <b>My Profile</b> → <b>API Tokens</b> → <b>Create Token</b></li>
 <li>Scroll down to <b>Custom Token</b> and click <b>Get started</b></li>
 <li>Under <b>Permissions</b>: Account | Workers Scripts | Edit</li>
 <li>Under <b>Account Resources</b>: Include | Account | <i>Your Account Name</i></li>
 <li>Click <b>Continue to summary</b> → <b>Create Token</b></li>
 </ol>
 </div>
 </div>
 <Input
 label="Account ID"
 value={cloudflareForm.accountId}
 onChange={(e) => setCloudflareForm((prev) => ({ ...prev, accountId: e.target.value }))}
 placeholder="your-cloudflare-account-id"
 hint={<>Found on the right side of the Cloudflare dashboard overview page.</>}
 />
 <Input
 label="API Token"
 value={cloudflareForm.apiToken}
 onChange={(e) => setCloudflareForm((prev) => ({ ...prev, apiToken: e.target.value }))}
 placeholder="your-cloudflare-api-token"
 hint={<>Requires &quot;Workers Scripts: Edit&quot; permission. <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Get token →</a></>}
 type="password"
 />
 <Input
 label="Worker Name"
 value={cloudflareForm.projectName}
 onChange={(e) => setCloudflareForm((prev) => ({ ...prev, projectName: e.target.value }))}
 placeholder="my-relay"
 hint="Unique name for your Cloudflare Worker. Leave empty for auto-generated name."
 />
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 <Button
 fullWidth
 onClick={handleCloudflareDeploy}
 disabled={!cloudflareForm.accountId.trim() || !cloudflareForm.apiToken.trim() || deploying}
 >
 {deploying ? "Deploying..." : "Deploy Worker"}
 </Button>
 <Button fullWidth variant="ghost" onClick={closeCloudflareModal} disabled={deploying}>
 Cancel
 </Button>
 </div>
 </div>
 </Modal>

 <Modal
 isOpen={showCloudflareBulkModal}
 title="CF Bulk"
 onClose={closeCloudflareBulkModal}
 >
 <div className="flex flex-col gap-3">
 <div className="rounded-sm border border-warning/30 bg-warning/10 p-3">
 <p className="text-sm font-medium text-text-main">One account per line (Batch of 10 concurrent)</p>
 <p className="mt-1 text-xs text-text-muted">Format: name/email|accountID|apiToken. Nama worker/subdomain otomatis memakai Pool Name + urutan batch (bukan nama/email akun).</p>
 </div>
 <Input
 label="Pool Name / Worker Prefix"
 value={cloudflareBulkPoolName}
 onChange={(e) => setCloudflareBulkPoolName(e.target.value)}
 disabled={bulkCloudflareDeploying}
 placeholder="e.g. cloudflare-relay, cf-indo, cf-pool"
 hint="Prefix untuk nama pool dan subdomain worker Cloudflare (contoh: cloudflare-relay-1, cloudflare-relay-2)."
 />
 <textarea
 value={cloudflareBulkText}
 onChange={(e) => setCloudflareBulkText(e.target.value)}
 disabled={bulkCloudflareDeploying}
 placeholder={"email@example.com|account-id|api-token\nteam-account|account-id|api-token"}
 spellCheck={false}
 className="min-h-[200px] w-full resize-y rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs text-text-main outline-none focus:border-primary disabled:opacity-50"
 />

 {cloudflareBulkProgress.total > 0 && (
 <div className="rounded-sm border border-border bg-surface p-3 flex flex-col gap-2">
 <div className="flex items-center justify-between text-xs font-medium">
 <span className="text-text-main flex items-center gap-1.5">
 {bulkCloudflareDeploying && (
 <span className="inline-block size-2 rounded-full bg-primary animate-pulse" />
 )}
 {bulkCloudflareDeploying
 ? `Deploying Batch ${cloudflareBulkProgress.currentBatch} of ${cloudflareBulkProgress.totalBatches}...`
 : "Deployment Complete"}
 </span>
 <span className="font-mono text-text-muted">
 {cloudflareBulkProgress.completed} / {cloudflareBulkProgress.total} ({Math.round((cloudflareBulkProgress.completed / cloudflareBulkProgress.total) * 100) || 0}%)
 </span>
 </div>

 {/* Progress bar */}
 <div className="flex h-2 w-full overflow-hidden rounded-sm bg-surface-3">
 <div
 className="bg-success"
 style={{ width: `${(cloudflareBulkProgress.success / cloudflareBulkProgress.total) * 100}%` }}
 title={`${cloudflareBulkProgress.success} succeeded`}
 />
 <div
 className="bg-danger"
 style={{ width: `${(cloudflareBulkProgress.failed / cloudflareBulkProgress.total) * 100}%` }}
 title={`${cloudflareBulkProgress.failed} failed`}
 />
 </div>

 <div className="flex items-center justify-between text-[11px] text-text-muted pt-0.5">
 <div className="flex items-center gap-3">
 <span className="flex items-center gap-1 text-success">
 <span className="size-1.5 rounded-full bg-success" />
 {cloudflareBulkProgress.success} Success
 </span>
 <span className="flex items-center gap-1 text-danger">
 <span className="size-1.5 rounded-full bg-danger" />
 {cloudflareBulkProgress.failed} Failed
 </span>
 </div>
 <span>Concurrency: 10/batch</span>
 </div>
 </div>
 )}

 {cloudflareBulkResults.length > 0 && (
 <div className="max-h-64 overflow-auto rounded-sm border border-border">
 <div className="divide-y divide-border">
 {cloudflareBulkResults.map((result) => (
 <div key={result.lineNumber} className="flex items-start gap-3 px-3 h-8 text-xs">
 <span className="w-8 shrink-0 text-text-muted">#{result.lineNumber}</span>
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <span className="font-medium text-text-main">{result.label}</span>
 <Badge
 variant={
 result.status === "success"
 ? "success"
 : result.status === "failed"
 ? "error"
 : result.status === "running"
 ? "default"
 : "default"
 }
 >
 {result.status}
 </Badge>
 </div>
 <p className="mt-0.5 font-mono text-text-muted">{result.accountId} · {result.projectName}</p>
 {result.deployUrl && <p className="mt-0.5 break-all text-success">{result.deployUrl}</p>}
 {result.error && <p className="mt-0.5 break-words text-danger">{result.error}</p>}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 <Button fullWidth onClick={handleCloudflareBulkDeploy} disabled={!cloudflareBulkText.trim() || bulkCloudflareDeploying}>
 {bulkCloudflareDeploying ? `Deploying (${cloudflareBulkProgress.completed}/${cloudflareBulkProgress.total})...` : "Deploy All"}
 </Button>
 <Button fullWidth variant="ghost" onClick={closeCloudflareBulkModal} disabled={bulkCloudflareDeploying}>
 Close
 </Button>
 </div>
 </div>
 </Modal>

 <Modal
 isOpen={showDenoModal}
 title="Deploy Deno Relay"
 onClose={closeDenoModal}
 >
 <div className="flex flex-col gap-3">
 <div className="rounded-sm bg-surface border border-border p-3 flex flex-col gap-1.5">
 <p className="text-sm text-text-main font-medium">What is Deno Relay?</p>
 <p className="text-xs text-text-muted">
 Deploys a relay worker to Deno Deploy&apos;s global edge network. All AI provider requests are forwarded through Deno&apos;s edge, masking your real IP.
 </p>
 <ul className="text-xs text-text-muted list-disc pl-3 space-y-3">
 <li>Deno Deploy v2 runs on a high-performance global edge network</li>
 <li>Free tier: 1M requests & 100GiB outbound traffic per month</li>
 <li>No per-request CPU time limits (unlike Vercel/Cloudflare)</li>
 <li>Support up to 20 active apps & 50 custom domains</li>
 <li>Deploy multiple relays for maximum IP diversity</li>
 </ul>
 <div className="mt-2 pt-2 border-t border-border text-xs text-text-muted">
 <p className="font-medium text-text-main mb-1">How to generate API token:</p>
 <ol className="list-decimal pl-3 space-y-3">
 <li>Go to <b>console.deno.com</b></li>
 <li>Select your <b>Organization</b> → <b>Settings</b> → <b>Organization Tokens</b></li>
 <li>Create a <b>Organization Token</b> (prefix <b>ddo_</b>)</li>
 </ol>
 </div>
 </div>
 <Input
 label="Deno Deploy API Token"
 value={denoForm.denoToken}
 onChange={(e) => setDenoForm((prev) => ({ ...prev, denoToken: e.target.value }))}
 placeholder="ddo_xxxxxxxxxxxxxxxx"
 hint={<>Token is used once for deployment, not stored. Found in Organization Settings.</>}
 type="password"
 />
 <Input
 label="Organization Domain"
 value={denoForm.orgDomain}
 onChange={(e) => setDenoForm((prev) => ({ ...prev, orgDomain: e.target.value }))}
 placeholder="your-org.deno.net"
 hint="Organization's default domain. Your relay URL will be in the format: https://my-relay.your-org.deno.net"
 />
 <Input
 label="App Name"
 value={denoForm.projectName}
 onChange={(e) => setDenoForm((prev) => ({ ...prev, projectName: e.target.value }))}
 placeholder="deno-relay"
 hint="Unique app name. Leave empty for auto-generated name."
 />
 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 <Button
 fullWidth
 onClick={handleDenoDeploy}
 disabled={!denoForm.denoToken.trim() || !denoForm.orgDomain.trim() || deploying}
 >
 {deploying ? "Deploying..." : "Deploy Relay"}
 </Button>
 <Button fullWidth variant="ghost" onClick={closeDenoModal} disabled={deploying}>
 Cancel
 </Button>
 </div>
 </div>
 </Modal>

 <Modal
 isOpen={showFormModal}
 title={editingProxyPool ? "Edit Proxy Pool" : "Add Proxy Pool"}
 onClose={closeFormModal}
 >
 <div className="flex flex-col gap-3">
 <Input
 label="Name"
 value={formData.name}
 onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
 placeholder="Office Proxy"
 />
 <Input
 label="Proxy URL"
 value={formData.proxyUrl}
 onChange={(e) => setFormData((prev) => ({ ...prev, proxyUrl: e.target.value }))}
 placeholder="http://127.0.0.1:7897"
 />
 <Input
 label="No Proxy"
 value={formData.noProxy}
 onChange={(e) => setFormData((prev) => ({ ...prev, noProxy: e.target.value }))}
 placeholder="localhost,127.0.0.1,.internal"
 hint="Comma-separated hosts/domains to bypass proxy"
 />
 <Input
 label="Proxy Group"
 value={formData.group}
 onChange={(e) => setFormData((prev) => ({ ...prev, group: e.target.value }))}
 placeholder="e.g. indo, us, residential, gemini-pool"
 hint="Assign this proxy to a group. Accounts can route through all proxies in a group."
 />

 <div className="flex flex-col gap-3 rounded-sm border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="font-medium text-sm">Active</p>
 <p className="text-xs text-text-muted">Inactive pools are ignored by runtime resolution.</p>
 </div>
 <Toggle
 checked={formData.isActive === true}
 onChange={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
 disabled={saving}
 />
 </div>

 <div className="flex flex-col gap-3 rounded-sm border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="font-medium text-sm">Strict Proxy</p>
 <p className="text-xs text-text-muted">Fail request if proxy is unreachable instead of falling back to direct.</p>
 </div>
 <Toggle
 checked={formData.strictProxy === true}
 onChange={() => setFormData((prev) => ({ ...prev, strictProxy: !prev.strictProxy }))}
 disabled={saving}
 />
 </div>

 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
 <Button
 fullWidth
 onClick={handleSave}
 disabled={!formData.name.trim() || !formData.proxyUrl.trim() || saving}
 >
 {saving ? "Saving..." : "Save"}
 </Button>
 <Button fullWidth variant="ghost" onClick={closeFormModal} disabled={saving}>
 Cancel
 </Button>
 </div>
 </div>
 </Modal>

 {/* Modal Create/Edit Custom Group */}
 <Modal
 isOpen={showGroupModal}
 title={editingGroup?.isDefault ? `Configure ${editingGroup.name}` : (editingGroup ? "Edit Custom Proxy Group" : "Create Custom Proxy Group")}
 onClose={closeGroupModal}
 >
 <div className="flex flex-col gap-3">
 <Input
 label="Group Name"
 value={groupForm.name}
 onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
 placeholder="e.g. US-Fast, Residential-East"
 hint={editingGroup?.isDefault ? "Default system group name (cannot be changed)." : "Unique name for this proxy group."}
 disabled={editingGroup?.isDefault}
 />
 {!editingGroup?.isDefault && (
 <Input
 label="Description"
 value={groupForm.description}
 onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
 placeholder="Optional group description"
 />
 )}

 <div className="flex flex-col gap-3 rounded-sm border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="font-medium text-sm text-text-main">Sticky Proxy Session</p>
 <p className="text-xs text-text-muted">
 Keep consecutive requests from the same account on the same proxy before rotating to the next.
 </p>
 </div>
 <Toggle
 checked={groupForm.isSticky === true}
 onChange={() => setGroupForm((prev) => ({ ...prev, isSticky: !prev.isSticky }))}
 disabled={savingGroup}
 />
 </div>

 {groupForm.isSticky && (
 <Input
 label="Sticky Request Limit"
 type="number"
 min="1"
 max="100"
 value={groupForm.stickyLimit}
 onChange={(e) => setGroupForm((prev) => ({ ...prev, stickyLimit: e.target.value }))}
 hint="Number of consecutive requests to send through the same proxy before rotating (default: 3)."
 />
 )}

 {editingGroup?.isDefault ? (
 <div className="rounded-sm bg-surface border border-border p-3 text-xs text-text-muted">
 <p className="font-medium text-text-main mb-1">Automatic Membership</p>
 <p>
 All active proxy pools with type <span className="font-mono font-medium">{editingGroup.type}</span> are automatically included in this group.
 </p>
 </div>
 ) : (
 <div>
 <div className="flex items-center justify-between mb-1.5">
 <label className="block text-xs font-medium text-text-muted">
 Assign Proxies ({groupForm.poolIds.length} selected)
 </label>
 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={() => {
 const activePoolIds = proxyPools.filter((p) => p.isActive === true).map((p) => p.id);
 setGroupForm((prev) => ({ ...prev, poolIds: activePoolIds }));
 }}
 className="text-xs text-primary hover:underline"
 >
 Select All Active
 </button>
 <span className="text-xs text-text-muted">|</span>
 <button
 type="button"
 onClick={() => setGroupForm((prev) => ({ ...prev, poolIds: [] }))}
 className="text-xs text-text-muted hover:underline"
 >
 Clear
 </button>
 </div>
 </div>

 <div className="mb-2">
 <input
 type="text"
 value={groupPoolSearch}
 onChange={(e) => setGroupPoolSearch(e.target.value)}
 placeholder="Filter proxy pools..."
 className="w-full rounded-sm border border-border bg-surface py-2 px-3 text-xs text-text-main focus:border-primary focus:outline-none"
 />
 </div>

 <div className="max-h-56 overflow-y-auto rounded-sm border border-border divide-y divide-border">
 {proxyPools
 .filter((pool) => {
 if (!groupPoolSearch.trim()) return true;
 const q = groupPoolSearch.toLowerCase();
 return (pool.name || "").toLowerCase().includes(q) || (pool.proxyUrl || "").toLowerCase().includes(q) || (pool.type || "").toLowerCase().includes(q);
 })
 .map((pool) => {
 const checked = groupForm.poolIds.includes(pool.id);
 return (
 <label
 key={pool.id}
 className={`flex items-center gap-2 px-3 h-8 text-xs cursor-pointer hover:bg-surface-2 ${
 checked ? "bg-primary/10" : ""
 }`}
 >
 <input
 type="checkbox"
 checked={checked}
 onChange={() => {
 setGroupForm((prev) => ({
 ...prev,
 poolIds: checked
 ? prev.poolIds.filter((id) => id !== pool.id)
 : [...prev.poolIds, pool.id],
 }));
 }}
 className="size-4 rounded-sm border-border text-primary"
 />
 <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
 <span className="truncate font-medium text-text-main">{pool.name}</span>
 <div className="flex items-center gap-1.5 shrink-0">
 <span className="text-[11px] font-mono px-1.5 py-1 rounded-sm bg-surface text-text-muted">
 {pool.type || "http"}
 </span>
 {!pool.isActive && (
 <span className="text-[11px] text-danger font-medium">(inactive)</span>
 )}
 </div>
 </div>
 </label>
 );
 })}
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 mt-2">
 <Button
 fullWidth
 onClick={handleSaveGroup}
 disabled={!groupForm.name.trim() || savingGroup}
 >
 {savingGroup ? "Saving..." : "Save Group"}
 </Button>
 <Button fullWidth variant="ghost" onClick={closeGroupModal} disabled={savingGroup}>
 Cancel
 </Button>
 </div>
 </div>
 </Modal>

 {/* Confirm Modal */}
 <ConfirmModal
 isOpen={!!confirmState}
 onClose={() => setConfirmState(null)}
 onConfirm={confirmState?.onConfirm}
 title={confirmState?.title || "Confirm"}
 message={confirmState?.message}
 variant="danger"
 />
 </div>
 );
}
