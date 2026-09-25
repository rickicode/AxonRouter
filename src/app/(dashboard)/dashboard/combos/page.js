"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "@/lib/ui/navigation.js";
import dynamic from "@/lib/ui/dynamic.jsx";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  Card,
  Button,
  Modal,
  Input,
  CardSkeleton,
  ModelSelectModal,
  ConfirmModal,
  CapacityBadges,
  Select,
  SegmentedControl,
} from "@/shared/components";

const ComboAnalyticsTab = dynamic(() => import("./components/ComboAnalyticsTab"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});
import SmartRoutingSection from "./components/SmartRoutingSection";
import ModalityAdaptersTab from "./components/ModalityAdaptersTab";
import StrategyGuideModal from "./components/StrategyGuideModal";

import { useNotificationStore } from "@/store/notificationStore";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { getComboBadge, isBuiltinCombo } from "@/shared/utils/comboBadge";
import Icon from "@/shared/components/Icon";

// Validate combo name: only a-z, A-Z, 0-9, -, _, ., /
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-/]+$/;

const CAPACITY_ADAPTER_CAPS = [
  { key: "vision", label: "Vision", icon: "visibility", desc: "Images" },
  { key: "audioInput", label: "Audio", icon: "graphic_eq", desc: "Audio input" },
];
const EMPTY_CAP_ENTRY = { enabled: true, roundRobin: false, models: [] };
const EMPTY_CAPACITY_ADAPTER = {
  vision: { ...EMPTY_CAP_ENTRY },
  pdf: { ...EMPTY_CAP_ENTRY },
  audioInput: { ...EMPTY_CAP_ENTRY },
  videoInput: { ...EMPTY_CAP_ENTRY },
};

function normalizeCapEntry(entry) {
  if (Array.isArray(entry)) {
    return { enabled: true, roundRobin: false, models: entry.map((e) => e?.model || e).filter(Boolean) };
  }
  if (entry && typeof entry === "object") {
    return {
      enabled: entry.enabled !== false,
      roundRobin: !!entry.roundRobin,
      models: Array.isArray(entry.models) ? entry.models.filter(Boolean) : [],
    };
  }
  return { ...EMPTY_CAP_ENTRY };
}

export default function CombosPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <CombosPageContent />
    </Suspense>
  );
}

function CombosPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl === "analytics" ? "analytics" : tabFromUrl === "adapters" ? "adapters" : "combos";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/combos?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Top Level Sub-Tabs */}
      <div className="w-full max-w-full min-w-0 overflow-x-auto no-scrollbar pb-0.5">
        <SegmentedControl
          options={[
            { value: "combos", label: "Model Combos" },
            { value: "adapters", label: "Modality Adapters" },
            { value: "analytics", label: "Analytics & Health" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          size="touch"
          snap
          className="w-full sm:w-auto min-w-max"
        />
      </div>

      {activeTab === "analytics" ? (
        <ComboAnalyticsTab />
      ) : (
        <CombosContent activeTab={activeTab} />
      )}
    </div>
  );
}

function CombosContent({ activeTab }) {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [comboStrategies, setComboStrategies] = useState({});
  const [capacityAdapter, setCapacityAdapter] = useState(EMPTY_CAPACITY_ADAPTER);
  const { getCaps } = useModelCaps();
  const [confirmState, setConfirmState] = useState(null);
  const { copied, copy } = useCopyToClipboard();
  const notify = useNotificationStore();
  const [comboCategory, setComboCategory] = useState("all"); // "all" | "custom" | "builtin"
  const [searchQuery, setSearchQuery] = useState("");
  const [showStrategyGuide, setShowStrategyGuide] = useState(false);
  const [updatingStrategy, setUpdatingStrategy] = useState({});

  const fetchData = async () => {
    try {
      const [combosRes, providersRes, settingsRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers?isActive=true&fields=summary"),
        fetch("/api/settings"),
      ]);
      const combosData = await combosRes.json();
      const providersData = await providersRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};

      if (combosRes.ok) setCombos((combosData.combos || []).filter((c) => !c.kind || c.kind === "llm"));
      if (providersRes.ok) {
        setActiveProviders(providersData.connections || []);
      }
      setComboStrategies(settingsData.comboStrategies || {});
      const rawAdapter = settingsData.capacityAdapter || {};
      const normalized = {};
      for (const cap of CAPACITY_ADAPTER_CAPS) {
        normalized[cap.key] = normalizeCapEntry(rawAdapter[cap.key]);
      }
      setCapacityAdapter(normalized);
    } catch (error) {
      console.error("Failed to load combos:", error);
      notify.error("Failed to load combos and routing data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => fetchData());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetCapacityAdapter = async (next) => {
    setCapacityAdapter(next);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacityAdapter: next }),
      });
      if (!res.ok) {
        throw new Error("Failed to save adapter settings");
      }
    } catch (error) {
      console.error("Error saving capacity adapter:", error);
      notify.error("Failed to save capacity adapter configuration");
    }
  };

  const handleCreate = async (data) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setShowCreateModal(false);
        notify.success(`Created combo "${data.name}"`);
      } else {
        const err = await res.json();
        notify.error(err.error || "Failed to create combo");
      }
    } catch (error) {
      console.error("Failed to create combo:", error);
      notify.error("Failed to create combo due to a network error");
    }
  };

  const handleUpdate = async (id, data, silent = false) => {
    try {
      const res = await fetch(`/api/combos/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
        if (!silent) {
          setEditingCombo(null);
          notify.success(`Updated combo "${data.name || updated.name}"`);
        }
      } else {
        const err = await res.json();
        if (!silent) {
          notify.error(err.error || "Failed to update combo");
        }
      }
    } catch (error) {
      console.error("Failed to update combo:", error);
      if (!silent) {
        notify.error("Failed to update combo due to a network error");
      }
    }
  };

  const handleDelete = async (id, name) => {
    setConfirmState({
      title: "Delete Model Combo",
      message: `Are you sure you want to delete combo "${name}"? Upstream clients querying this model name will encounter 404 errors.`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/combos/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (res.ok) {
            setCombos((prev) => prev.filter((c) => c.id !== id));
            notify.success(`Deleted combo "${name}"`);
          } else {
            notify.error(`Failed to delete combo "${name}"`);
          }
        } catch (error) {
          console.error("Failed to delete combo:", error);
          notify.error("Failed to delete combo due to a network error");
        }
      },
    });
  };

  const handleSetComboStrategy = async (comboName, patch) => {
    setUpdatingStrategy((prev) => ({ ...prev, [comboName]: true }));
    try {
      const updated = { ...comboStrategies };
      const next = { ...(updated[comboName] || {}), ...patch };
      if (patch.stickyLimit === null) delete next.stickyLimit;

      if (!next.fallbackStrategy || next.fallbackStrategy === "fallback") {
        delete updated[comboName];
      } else {
        updated[comboName] = next;
      }

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategies: updated }),
      });

      if (!res.ok) {
        throw new Error("Failed to save strategy");
      }

      setComboStrategies(updated);
      notify.success(`Updated routing strategy for "${comboName}"`);
    } catch (error) {
      console.error("Failed to update combo strategy:", error);
      notify.error(`Failed to update strategy for "${comboName}"`);
    } finally {
      setUpdatingStrategy((prev) => ({ ...prev, [comboName]: false }));
    }
  };

  const { customCombos, builtinCombos } = useMemo(() => {
    const custom = [];
    const builtin = [];
    for (const c of combos) {
      if (isBuiltinCombo(c)) {
        builtin.push(c);
      } else {
        custom.push(c);
      }
    }
    return { customCombos: custom, builtinCombos: builtin };
  }, [combos]);

  const filterBySearch = useCallback(
    (list) => {
      if (!searchQuery.trim()) return list;
      const q = searchQuery.trim().toLowerCase();
      return list.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        if (Array.isArray(c.models) && c.models.some((m) => m.toLowerCase().includes(q))) return true;
        const strat = comboStrategies[c.name] || {};
        if (strat.easyModels?.some((m) => m.toLowerCase().includes(q))) return true;
        if (strat.mediumModels?.some((m) => m.toLowerCase().includes(q))) return true;
        if (strat.hardModels?.some((m) => m.toLowerCase().includes(q))) return true;
        return false;
      });
    },
    [searchQuery, comboStrategies]
  );

  const filteredCustom = useMemo(() => filterBySearch(customCombos), [filterBySearch, customCombos]);
  const filteredBuiltin = useMemo(() => filterBySearch(builtinCombos), [filterBySearch, builtinCombos]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  // If "adapters" tab is active, render the dedicated Modality Adapters view
  if (activeTab === "adapters") {
    return (
      <ModalityAdaptersTab
        capacityAdapter={capacityAdapter}
        onChange={handleSetCapacityAdapter}
        activeProviders={activeProviders}
        getCaps={getCaps}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Top Banner: Crisp, confident header without bullet clutter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-text-main tracking-tight">Model Routing Combos</h1>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary border border-primary/20">
              {combos.length} Active
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
            Group multiple upstream models under a unified endpoint name. Seamlessly route queries using sequential failover, load-balanced round robin, difficulty-based smart tiers, or parallel consensus fusion.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            icon="help_outline"
            onClick={() => setShowStrategyGuide(true)}
            title="View routing strategies and tradeoffs"
          >
            Strategy Guide
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="add"
            onClick={() => setShowCreateModal(true)}
            className="shadow-sm"
          >
            Create Combo
          </Button>
        </div>
      </div>

      {/* Category Tabs (Custom vs Built-in) + Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar py-0.5">
          <SegmentedControl
            options={[
              { value: "all", label: `All (${combos.length})` },
              { value: "custom", label: `Custom (${customCombos.length})` },
              { value: "builtin", label: `Built-in Presets (${builtinCombos.length})` },
            ]}
            value={comboCategory}
            onChange={setComboCategory}
            size="touch"
            snap
            className="w-full sm:w-auto min-w-max"
          />
        </div>

        <div className="relative w-full sm:w-72">
          <Icon name="search" size={18} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search combos or member models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 rounded-sm border border-border bg-surface pl-8 pr-7 py-1 text-xs text-text-main placeholder:text-text-muted/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
              title="Clear search"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Combos List */}
      {combos.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Icon className="text-text-muted" name="alt_route" size={18} />
            <div>
              <p className="text-sm font-semibold text-text-main">No combos configured</p>
              <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                Create your first model combo to route requests across multiple AI providers with automatic fallback.
              </p>
            </div>
            <Button icon="add" onClick={() => setShowCreateModal(true)}>
              Create First Combo
            </Button>
          </div>
        </Card>
      ) : comboCategory === "custom" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-main">Custom Combos</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.2 font-mono text-[10px] font-medium text-primary border border-primary/20">
                {filteredCustom.length}
              </span>
            </div>
            <p className="text-xs text-text-muted">User-defined model groups and custom fallback orders</p>
          </div>

          {filteredCustom.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <Icon
                  name={searchQuery ? "search_off" : "person"}
                  size={28}
                  className="text-text-muted mb-2 block"
                />
                <p className="text-text-main font-medium text-xs mb-1">
                  {searchQuery ? "No matching custom combos" : "No custom combos yet"}
                </p>
                <p className="text-xs text-text-muted mb-4">
                  {searchQuery
                    ? "Try a different search term"
                    : "Create a custom combo to group models with fallback or round-robin strategies."}
                </p>
                {!searchQuery && (
                  <Button icon="add" size="sm" onClick={() => setShowCreateModal(true)}>
                    Create Custom Combo
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            filteredCustom.map((combo) => (
              <ComboCard
                key={combo.id}
                combo={combo}
                isBuiltin={false}
                getCaps={getCaps}
                activeProviders={activeProviders}
                copied={copied}
                onCopy={copy}
                onEdit={() => setEditingCombo(combo)}
                onDelete={() => handleDelete(combo.id, combo.name)}
                strategy={comboStrategies[combo.name] || {}}
                onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
                onUpdateCombo={(id, patch) => handleUpdate(id, patch, true)}
                isUpdatingStrategy={!!updatingStrategy[combo.name]}
              />
            ))
          )}
        </div>
      ) : comboCategory === "builtin" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-main">Built-in Presets & Smart Routing</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.2 font-mono text-[10px] font-medium text-primary border border-primary/20">
                {filteredBuiltin.length}
              </span>
            </div>
            <p className="text-xs text-text-muted">System seed combos with auto-failover across healthy providers</p>
          </div>

          {filteredBuiltin.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <Icon className="text-text-muted mb-2 block" name="search_off" size={18} />
                <p className="text-text-main font-medium text-xs mb-1">No matching built-in presets</p>
                <p className="text-xs text-text-muted">Try a different search term</p>
              </div>
            </Card>
          ) : (
            filteredBuiltin.map((combo) => (
              <ComboCard
                key={combo.id}
                combo={combo}
                isBuiltin={true}
                getCaps={getCaps}
                activeProviders={activeProviders}
                copied={copied}
                onCopy={copy}
                onEdit={() => setEditingCombo(combo)}
                onDelete={() => handleDelete(combo.id, combo.name)}
                strategy={comboStrategies[combo.name] || {}}
                onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
                onUpdateCombo={(id, patch) => handleUpdate(id, patch, true)}
                isUpdatingStrategy={!!updatingStrategy[combo.name]}
              />
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Custom Combos Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                  <Icon name="person" size={18} />
                </div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-text-main">Custom Combos</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.2 font-mono text-[10px] font-medium text-primary border border-primary/20">
                    {filteredCustom.length}
                  </span>
                </div>
              </div>
              <p className="text-xs text-text-muted hidden sm:block">User-created model combinations and fallbacks</p>
            </div>

            {filteredCustom.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-surface-2/40 p-5 text-center">
                <p className="text-xs font-medium text-text-muted">No custom combos</p>
                <p className="text-[11px] text-text-muted/70 mt-1 mb-3">
                  Create your own model groups with custom fallback or round-robin strategies.
                </p>
                <Button icon="add" size="sm" variant="secondary" onClick={() => setShowCreateModal(true)}>
                  Create Custom Combo
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredCustom.map((combo) => (
                  <ComboCard
                    key={combo.id}
                    combo={combo}
                    isBuiltin={false}
                    getCaps={getCaps}
                    activeProviders={activeProviders}
                    copied={copied}
                    onCopy={copy}
                    onEdit={() => setEditingCombo(combo)}
                    onDelete={() => handleDelete(combo.id, combo.name)}
                    strategy={comboStrategies[combo.name] || {}}
                    onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
                    onUpdateCombo={(id, patch) => handleUpdate(id, patch, true)}
                    isUpdatingStrategy={!!updatingStrategy[combo.name]}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Built-in Presets Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                  <Icon name="verified" size={18} />
                </div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold text-text-main">Built-in Presets & Smart Routing</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.2 font-mono text-[10px] font-medium text-primary border border-primary/20">
                    {filteredBuiltin.length}
                  </span>
                </div>
              </div>
              <p className="text-xs text-text-muted hidden sm:block">
                Pre-configured family fallbacks and intelligent difficulty routing
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {filteredBuiltin.map((combo) => (
                <ComboCard
                  key={combo.id}
                  combo={combo}
                  isBuiltin={true}
                  getCaps={getCaps}
                  activeProviders={activeProviders}
                  copied={copied}
                  onCopy={copy}
                  onEdit={() => setEditingCombo(combo)}
                  onDelete={() => handleDelete(combo.id, combo.name)}
                  strategy={comboStrategies[combo.name] || {}}
                  onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
                  onUpdateCombo={(id, patch) => handleUpdate(id, patch, true)}
                  isUpdatingStrategy={!!updatingStrategy[combo.name]}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Strategy Guide Modal */}
      {showStrategyGuide && (
        <StrategyGuideModal
          isOpen={showStrategyGuide}
          onClose={() => setShowStrategyGuide(false)}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <ComboFormModal
          key="create"
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
          activeProviders={activeProviders}
        />
      )}

      {/* Edit Modal */}
      {editingCombo && (
        <ComboFormModal
          key={editingCombo.id}
          isOpen={!!editingCombo}
          combo={editingCombo}
          isBuiltin={isBuiltinCombo(editingCombo)}
          strategy={editingCombo ? comboStrategies[editingCombo.name] || {} : null}
          onClose={() => setEditingCombo(null)}
          onSave={(data) => handleUpdate(editingCombo.id, data)}
          activeProviders={activeProviders}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm Delete"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}

const STRATEGY_OPTIONS = [
  { value: "fallback", label: "Sequential Fallback (Order 1 -> N)" },
  { value: "round-robin", label: "Round Robin (Load Balanced)" },
  { value: "round-robin-sticky", label: "Round Robin Sticky (N Calls / Model)" },
  { value: "random", label: "Random Shuffle (Per Request)" },
  { value: "difficulty", label: "Smart Routing (Easy / Med / Hard Tiers)" },
  { value: "fusion", label: "Consensus Fusion (Panel + Judge)" },
];

function ComboCard({
  combo,
  getCaps,
  activeProviders = [],
  copied,
  onCopy,
  onEdit,
  onDelete,
  strategy = {},
  onSetStrategy,
  onUpdateCombo,
  isBuiltin = false,
  isUpdatingStrategy = false,
}) {
  const [showJudgeSelect, setShowJudgeSelect] = useState(false);
  const [stickyDraft, setStickyDraft] = useState(null);
  const [expandedSmartRouting, setExpandedSmartRouting] = useState(true);

  const current = strategy.fallbackStrategy || "fallback";
  const judge = strategy.judgeModel || "";
  const isFusion = current === "fusion";
  const isDifficulty = current === "difficulty";
  const isRR = current === "round-robin" || current === "round-robin-sticky";
  const stickyValue = stickyDraft ?? strategy.stickyLimit ?? "";

  const easyCount = Array.isArray(strategy.easyModels) ? strategy.easyModels.length : 0;
  const mediumCount = Array.isArray(strategy.mediumModels) ? strategy.mediumModels.length : 0;
  const hardCount = Array.isArray(strategy.hardModels) ? strategy.hardModels.length : 0;
  const totalTierModels = useMemo(() => {
    const set = new Set([
      ...(Array.isArray(strategy.easyModels) ? strategy.easyModels : []),
      ...(Array.isArray(strategy.mediumModels) ? strategy.mediumModels : []),
      ...(Array.isArray(strategy.hardModels) ? strategy.hardModels : []),
    ]);
    return set.size;
  }, [strategy.easyModels, strategy.mediumModels, strategy.hardModels]);

  const badge = getComboBadge(combo, strategy);

  return (
    <Card padding="none" className="group rounded-lg border border-border bg-surface transition-all hover:border-border/80 overflow-hidden shadow-sm">
      {/* Card Header & Controls */}
      <div className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/40">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <div
            className={`size-9 rounded-md flex items-center justify-center shrink-0 border ${badge.border} ${badge.bg} ${badge.text}`}
            title={badge.title}
          >
            <Icon name={badge.icon} size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <code className="block truncate font-mono text-sm font-bold text-text-main tracking-tight">
                {combo.name}
              </code>

              {/* Status & Strategy Badges */}
              {isBuiltin ? (
                <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted border border-border">
                  Built-in
                </span>
              ) : (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary border border-primary/20">
                  Custom
                </span>
              )}

              {isDifficulty && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/30">
                  <Icon name="auto_awesome" size={18} />
                  Smart Routing
                </span>
              )}

              {isFusion && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/30">
                  <Icon name="groups" size={18} />
                  Fusion
                </span>
              )}
            </div>

            {/* Quick summary below name */}
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
              {isDifficulty ? (
                <div className="flex items-center gap-2">
                  <span>{totalTierModels || combo.models.length} model(s) in 3 tiers</span>
                  <span className="text-text-muted/30">•</span>
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400"></span>
                    Easy: {easyCount}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-amber-400">
                    <span className="size-1.5 rounded-full bg-amber-400"></span>
                    Med: {mediumCount}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-rose-400">
                    <span className="size-1.5 rounded-full bg-rose-400"></span>
                    Hard: {hardCount}
                  </span>
                </div>
              ) : (
                <span>
                  {combo.models.length} model(s) in pool
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Bar */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2.5 sm:shrink-0">
          {/* Strategy selector */}
          <div className="w-full sm:w-[260px] relative">
            <Select
              options={STRATEGY_OPTIONS}
              value={current}
              onChange={(e) => onSetStrategy({ fallbackStrategy: e.target.value })}
              className="w-full"
              selectClassName="h-8 py-0 px-2.5 text-xs font-medium w-full leading-none rounded-sm"
            />
            {isUpdatingStrategy && (
              <Icon name="progress_activity" size={14} className="absolute right-8 top-1/2 -translate-y-1/2 text-primary animate-spin" />
            )}
          </div>

          {/* Quick Buttons */}
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy(combo.name, `combo-${combo.id}`);
              }}
              className="flex size-8 items-center justify-center rounded-sm border border-border/70 bg-surface text-text-muted hover:border-primary/50 hover:bg-surface-2 hover:text-text-main transition-all shadow-xs"
              title="Copy endpoint name"
              aria-label="Copy endpoint name"
            >
              <Icon name={copied === `combo-${combo.id}` ? "check" : "content_copy"} size={17} />
            </button>

            <button
              onClick={onEdit}
              className="flex size-8 items-center justify-center rounded-sm border border-border/70 bg-surface text-text-muted hover:border-primary/50 hover:bg-surface-2 hover:text-text-main transition-all shadow-xs"
              title="Edit combo"
              aria-label="Edit combo"
            >
              <Icon name="edit" size={18} />
            </button>

            {!isBuiltin && (
              <button
                onClick={onDelete}
                className="flex size-8 items-center justify-center rounded-sm border border-border/70 bg-surface text-text-muted hover:border-danger/50 hover:bg-danger/10 hover:text-danger transition-all shadow-xs"
                title="Delete combo"
                aria-label="Delete combo"
              >
                <Icon name="delete" size={18} />
              </button>
            )}

            {isDifficulty && (
              <button
                onClick={() => setExpandedSmartRouting(!expandedSmartRouting)}
                className="flex size-8 items-center justify-center rounded-sm border border-border/70 bg-surface text-text-muted hover:border-primary/50 hover:bg-surface-2 hover:text-text-main transition-all ml-0.5 shadow-xs"
                title={expandedSmartRouting ? "Collapse Smart Routing panel" : "Expand Smart Routing panel"}
              >
                <Icon name={expandedSmartRouting ? "expand_less" : "expand_more"} size={17} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Model Pipeline Visualization */}
      <div className="p-4 bg-surface-2/30">
        {/* Sticky Calls Setting for Round Robin */}
        {isRR && (
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-[11px] font-semibold text-text-muted">
              Sticky requests per model:
            </span>
            <Input
              type="number"
              min="1"
              max="100"
              placeholder="Global default"
              value={stickyValue}
              onChange={(e) => setStickyDraft(e.target.value)}
              onBlur={() => {
                if (stickyDraft === null) return;
                const num = parseInt(stickyDraft, 10);
                onSetStrategy({ stickyLimit: Number.isFinite(num) && num > 0 ? num : null });
                setStickyDraft(null);
              }}
              className="w-28 py-1 text-center text-xs font-mono"
            />
            <span className="text-[11px] text-text-muted italic">
              (Preserves prompt caching by grouping N calls)
            </span>
          </div>
        )}

        {/* Fusion: Judge Selector */}
        {isFusion && (
          <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2 p-2.5 rounded-md bg-amber-500/[0.04] border border-amber-500/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <Icon name="gavel" size={18} />
              <span>Consensus Judge:</span>
            </div>
            <button
              onClick={() => setShowJudgeSelect(true)}
              className="inline-flex max-w-full items-center gap-1.5 rounded border border-amber-500/30 bg-surface px-2 py-1 font-mono text-xs text-text-main hover:border-amber-400 transition-colors"
              title="Change Judge Model"
            >
              <span className="truncate">{judge || `Auto — First Model (${combo.models[0] || "none"})`}</span>
              {judge && <CapacityBadges caps={getCaps?.(judge)} />}
            </button>
            {judge && (
              <button
                onClick={() => onSetStrategy({ judgeModel: "" })}
                className="size-6 rounded flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                title="Reset to Auto"
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}

        {/* Model Chips Pipeline */}
        {!isDifficulty && (
          <div className="flex flex-wrap items-center gap-2">
            {combo.models.length === 0 ? (
              <span className="text-xs text-text-muted italic">No models configured in this combo</span>
            ) : (
              combo.models.map((model, index) => (
                <div key={`${model}-${index}`} className="flex items-center gap-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 font-mono text-xs border border-border shadow-xs">
                    <span className="flex size-4.5 items-center justify-center rounded font-mono text-[10px] font-bold text-text-muted bg-surface-2 border border-border/60">
                      {index + 1}
                    </span>
                    <span className="text-text-main font-medium">{model}</span>
                    <CapacityBadges caps={getCaps?.(model)} />
                  </div>
                  {index < combo.models.length - 1 && (
                    <Icon name={isRR ? "sync" : "arrow_forward"} size={16} className="text-text-muted/40" />
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Smart Routing Section Accordion Body */}
        {isDifficulty && expandedSmartRouting && (
          <SmartRoutingSection
            combo={combo}
            strategy={strategy}
            onSetStrategy={onSetStrategy}
            onUpdateComboModels={(newModels) => onUpdateCombo?.(combo.id, { models: newModels })}
            activeProviders={activeProviders}
            getCaps={getCaps}
          />
        )}
      </div>

      {/* Fusion Judge model picker */}
      {isFusion && showJudgeSelect && (
        <ModelSelectModal
          isOpen={showJudgeSelect}
          onClose={() => setShowJudgeSelect(false)}
          onSelect={(m) => {
            onSetStrategy({ judgeModel: m?.value || "" });
            setShowJudgeSelect(false);
          }}
          activeProviders={activeProviders}
          title="Select Fusion Judge Model"
          addedModelValues={judge ? [judge] : []}
          closeOnSelect={true}
        />
      )}
    </Card>
  );
}

function ModelItem({ id, index, model, isFirst, isLast, onEdit, onMoveUp, onMoveDown, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(model);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== model) onEdit(trimmed);
    else setDraft(model);
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(model);
      setEditing(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex min-w-0 items-center justify-between gap-2 rounded-md p-2 bg-surface border border-border hover:border-border/80 transition-colors ${
        isDragging ? "border-primary shadow-md" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none size-7 rounded flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface-2 active:cursor-grabbing shrink-0 transition-colors"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <Icon name="drag_indicator" size={18} />
        </button>

        <span className="flex size-5.5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold bg-surface-2 text-text-muted border border-border/50">
          #{index + 1}
        </span>

        {/* Inline editable model value */}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded border border-primary/40 bg-surface-2 px-2 py-1 font-mono text-xs text-text-main outline-none"
          />
        ) : (
          <div
            className="min-w-0 flex-1 cursor-text truncate rounded px-2 py-1 font-mono text-xs text-text-main hover:bg-surface-2 transition-colors"
            onClick={() => setEditing(true)}
            title="Click to edit model ID"
          >
            {model}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`size-7 rounded flex items-center justify-center transition-colors ${
            isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-surface-2"
          }`}
          title="Move up"
          aria-label="Move up"
        >
          <Icon name="arrow_upward" size={18} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`size-7 rounded flex items-center justify-center transition-colors ${
            isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-surface-2"
          }`}
          title="Move down"
          aria-label="Move down"
        >
          <Icon name="arrow_downward" size={18} />
        </button>
        <button
          onClick={onRemove}
          className="size-7 rounded flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title="Remove"
          aria-label="Remove"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}

function ComboFormModal({
  isOpen,
  combo,
  onClose,
  onSave,
  activeProviders,
  kindFilter = null,
  strategy = null,
  isBuiltin = false,
}) {
  const [name, setName] = useState(combo?.name || "");
  const [models, setModels] = useState(combo?.models || []);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [modelAliases, setModelAliases] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const modelItems = models.map((model, i) => ({ uid: `item-${i}`, model }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = modelItems.findIndex((m) => m.uid === active.id);
      const newIndex = modelItems.findIndex((m) => m.uid === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setModels((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  };

  const fetchModalData = async () => {
    try {
      const aliasesRes = await fetch("/api/models/alias");
      if (!aliasesRes.ok) return;
      const aliasesData = await aliasesRes.json();
      setModelAliases(aliasesData.aliases || {});
    } catch (error) {
      console.error("Error fetching modal data:", error);
    }
  };

  useEffect(() => {
    if (isOpen) queueMicrotask(() => fetchModalData());
  }, [isOpen]);

  const validateName = (value) => {
    if (!value.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!VALID_NAME_REGEX.test(value)) {
      setNameError("Only letters, numbers, -, _, . and / allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    setName(value);
    if (value) validateName(value);
    else setNameError("");
  };

  const handleAddModel = (model) => {
    if (!models.includes(model.value)) {
      setModels([...models, model.value]);
    }
  };

  const handleDeselectModel = (model) => {
    setModels(models.filter((m) => m !== model.value));
  };

  const handleRemoveModel = (index) => {
    setModels(models.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newModels = [...models];
    [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
    setModels(newModels);
  };

  const handleMoveDown = (index) => {
    if (index === models.length - 1) return;
    const newModels = [...models];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
    setModels(newModels);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave({ name: name.trim(), models });
    setSaving(false);
  };

  const isEdit = !!combo;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? "Edit Model Combo" : "Create New Model Combo"}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button onClick={onClose} variant="ghost" size="sm">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              variant="primary"
              disabled={!name.trim() || !!nameError || saving}
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Combo"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Name */}
          <div>
            <Input
              label="Combo Name (Endpoint Alias)"
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. claude-team, fast-chat, gpt-frontier"
              disabled={isBuiltin}
              error={nameError}
            />
            <p className="text-[11px] text-text-muted mt-1">
              {isBuiltin
                ? "Built-in preset names are system-managed and cannot be renamed."
                : "Characters allowed: letters, numbers, dash (-), underscore (_), period (.), and slash (/)"}
            </p>
          </div>

          {/* Smart Routing Notice */}
          {strategy?.fallbackStrategy === "difficulty" && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-text-muted">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                <Icon name="auto_awesome" size={18} />
                <span>Smart Routing Active</span>
              </div>
              <p className="mt-1 text-[11px] text-text-muted leading-relaxed">
                This combo automatically classifies prompts into <strong>Easy</strong>, <strong>Medium</strong>, and <strong>Hard</strong> tiers. You can fine-tune tier models and priority order on the combo card.
              </p>
            </div>
          )}

          {/* Models */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-xs text-text-main">
                Member Models ({models.length})
              </label>
              <Button
                size="xs"
                variant="secondary"
                icon="add"
                onClick={() => setShowModelSelect(true)}
              >
                Add Model
              </Button>
            </div>

            {models.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border rounded-md bg-surface-2/40">
                <Icon name="alt_route" size={24} className="text-text-muted mb-1 block" />
                <p className="text-xs text-text-muted">No models added yet</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              >
                <SortableContext items={modelItems.map((m) => m.uid)} strategy={verticalListSortingStrategy}>
                  <div className="flex max-h-[300px] min-w-0 flex-col gap-1.5 overflow-y-auto pr-1">
                    {modelItems.map(({ uid, model }, index) => (
                      <ModelItem
                        key={uid}
                        id={uid}
                        index={index}
                        model={model}
                        isFirst={index === 0}
                        isLast={index === modelItems.length - 1}
                        onEdit={(newVal) => {
                          const updated = [...models];
                          updated[index] = newVal;
                          setModels(updated);
                        }}
                        onMoveUp={() => handleMoveUp(index)}
                        onMoveDown={() => handleMoveDown(index)}
                        onRemove={() => handleRemoveModel(index)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </Modal>

      {/* Model Select Modal */}
      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAddModel}
          onDeselect={handleDeselectModel}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title="Select Models for Combo"
          kindFilter={kindFilter}
          addedModelValues={models}
          closeOnSelect={false}
        />
      )}
    </>
  );
}
