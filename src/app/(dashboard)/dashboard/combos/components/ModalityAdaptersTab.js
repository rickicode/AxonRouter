"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, Toggle, ModelSelectModal, CapacityBadges } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import Icon from "@/shared/components/Icon";

const CAPACITY_ADAPTER_CAPS = [
  {
    key: "vision",
    label: "Vision Adapter",
    inputKind: "Images",
    icon: "visibility",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    desc: "PNG, JPG, WebP, GIF, SVG input modalities",
    doc: "When a target model lacks image perception, AxonRouter reroutes to this pool seamlessly.",
  },
  {
    key: "audioInput",
    label: "Audio Adapter",
    inputKind: "Audio & Speech",
    icon: "graphic_eq",
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    desc: "WAV, MP3, OGG, spoken prompts and audio inputs",
    doc: "When a target model cannot ingest audio, requests automatically switch to this pool.",
  },
];

const DEFAULT_FALLBACK_MODEL = "oc/mimo-v2.5-free";

export default function ModalityAdaptersTab({
  capacityAdapter = {},
  onChange,
  activeProviders = [],
  getCaps,
}) {
  const notify = useNotificationStore();

  const handleUpdateCap = (capKey, entry) => {
    const next = { ...capacityAdapter, [capKey]: entry };
    onChange(next);
    notify.success(`Updated ${capKey === "vision" ? "Vision" : "Audio"} adapter configuration`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
              <Icon name="perm_media" size={18} />
            </div>
            <h2 className="text-base font-semibold text-text-main">Input Modality Fallback Adapters</h2>
          </div>
          <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
            Global fallback pools for missing model modalities. If an incoming prompt includes images or audio but the requested model or combo does not support that input type, AxonRouter automatically reroutes to the first healthy model in the respective pool below instead of returning a 400 bad request error.
          </p>
        </div>
      </div>

      {/* Modality Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {CAPACITY_ADAPTER_CAPS.map((cap) => (
          <ModalityCard
            key={cap.key}
            cap={cap}
            entry={capacityAdapter[cap.key] || { enabled: true, roundRobin: false, models: [] }}
            onChange={(entry) => handleUpdateCap(cap.key, entry)}
            activeProviders={activeProviders}
            getCaps={getCaps}
          />
        ))}
      </div>
    </div>
  );
}

ModalityAdaptersTab.propTypes = {
  capacityAdapter: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  activeProviders: PropTypes.array,
  getCaps: PropTypes.func,
};

function ModalityCard({ cap, entry, onChange, activeProviders, getCaps }) {
  const [showModelSelect, setShowModelSelect] = useState(false);
  const { enabled, roundRobin, models = [] } = entry;

  const patch = (p) => onChange({ ...entry, ...p });

  const handleAdd = (model) => {
    if (models.includes(model.value)) return;
    patch({ models: [...models, model.value] });
  };

  const handleRemove = (index) => {
    const next = models.filter((_, i) => i !== index);
    patch({ models: next.length === 0 ? [DEFAULT_FALLBACK_MODEL] : next });
  };

  const handleMove = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= models.length) return;
    const next = [...models];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ models: next });
  };

  return (
    <Card className={`flex flex-col gap-4 p-4 transition-opacity ${!enabled ? "opacity-60" : ""}`}>
      {/* Top row: Icon, Label, Master Toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${cap.color}`}>
            <Icon name={cap.icon} size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-text-main">{cap.label}</h3>
              <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] font-medium text-text-muted border border-border">
                {cap.inputKind}
              </span>
            </div>
            <p className="text-[11px] text-text-muted truncate mt-0.5">{cap.desc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] font-medium ${enabled ? "text-emerald-400" : "text-text-muted"}`}>
            {enabled ? "Active" : "Disabled"}
          </span>
          <Toggle
            checked={enabled}
            onChange={(v) => patch({ enabled: v })}
            aria-label={`Enable ${cap.label}`}
          />
        </div>
      </div>

      <p className="text-xs text-text-muted leading-relaxed bg-surface-2/60 p-2.5 rounded-md border border-border/60">
        {cap.doc}
      </p>

      {/* Distribution Mode: Fallback vs Round Robin */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3 rounded-md bg-surface-2 border border-border">
        <div>
          <span className="text-xs font-semibold text-text-main block">Routing Strategy</span>
          <span className="text-[11px] text-text-muted">
            {roundRobin
              ? "Round Robin: Rotates requests evenly across healthy models in this pool"
              : "Sequential Fallback: Always tries #1 first, falling back to subsequent models on error"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer font-medium select-none">
            <Toggle
              checked={roundRobin}
              onChange={(v) => patch({ roundRobin: v })}
              disabled={!enabled}
              aria-label={`Toggle Round Robin for ${cap.label}`}
            />
            <span className={roundRobin ? "text-primary font-semibold" : ""}>
              Round Robin
            </span>
          </label>
        </div>
      </div>

      {/* Model Pool List */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-main">
            Fallback Pool ({models.length})
          </span>
          <Button
            icon="add"
            variant="secondary"
            size="xs"
            onClick={() => setShowModelSelect(true)}
            disabled={!enabled}
            title={`Add ${cap.label} model`}
          >
            Add Model
          </Button>
        </div>

        {models.length === 0 ? (
          <div className="py-6 text-center border border-dashed border-border rounded-md bg-surface-2/40">
            <p className="text-xs font-medium text-text-muted">No custom models configured</p>
            <p className="text-[11px] text-text-muted/70 mt-1">
              Falls back automatically to default: <code className="font-mono text-primary">{DEFAULT_FALLBACK_MODEL}</code>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
            {models.map((model, index) => (
              <div
                key={`${model}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 border border-border transition-colors hover:border-border/80"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold bg-surface text-text-muted border border-border/50">
                    #{index + 1}
                  </span>
                  <span className="truncate font-mono text-xs font-medium text-text-main" title={model}>
                    {model}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <CapacityBadges caps={getCaps?.(model)} />

                  {/* Move Up */}
                  <button
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0 || !enabled}
                    className={`size-11 rounded flex items-center justify-center transition-colors sm:size-7 ${
                      index === 0 || !enabled
                        ? "text-text-muted/20 cursor-not-allowed"
                        : "text-text-muted hover:text-primary hover:bg-surface"
                    }`}
                    title="Move up priority"
                    aria-label="Move up priority"
                  >
                    <Icon name="arrow_upward" size={18} />
                  </button>

                  {/* Move Down */}
                  <button
                    onClick={() => handleMove(index, 1)}
                    disabled={index === models.length - 1 || !enabled}
                    className={`size-11 rounded flex items-center justify-center transition-colors sm:size-7 ${
                      index === models.length - 1 || !enabled
                        ? "text-text-muted/20 cursor-not-allowed"
                        : "text-text-muted hover:text-primary hover:bg-surface"
                    }`}
                    title="Move down priority"
                    aria-label="Move down priority"
                  >
                    <Icon name="arrow_downward" size={18} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleRemove(index)}
                    disabled={!enabled}
                    className="size-11 rounded flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors sm:size-7"
                    title="Remove model from pool"
                    aria-label="Remove model from pool"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAdd}
          activeProviders={activeProviders}
          title={`Add ${cap.label} Model`}
          addedModelValues={models}
          capFilter={cap.key}
          closeOnSelect={false}
        />
      )}
    </Card>
  );
}

ModalityCard.propTypes = {
  cap: PropTypes.object.isRequired,
  entry: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  activeProviders: PropTypes.array,
  getCaps: PropTypes.func,
};
