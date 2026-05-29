"use client";

import { useMemo } from "react";
import {
  DEFAULT_INTELLIGENT_WEIGHTS,
  FACTOR_LABELS,
  MODE_PACK_OPTIONS,
  ROUTER_STRATEGY_OPTIONS,
  normalizeIntelligentRoutingConfig,
} from "@/lib/combos/intelligentRouting";
import { translate } from "@/i18n/runtime";

function toProviderOptions(activeProviders = []) {
  const uniqueProviders = new Map();

  activeProviders.forEach((provider) => {
    const providerId =
      typeof provider?.provider === "string" && provider.provider.trim().length > 0
        ? provider.provider
        : typeof provider?.id === "string" && provider.id.trim().length > 0
          ? provider.id
          : null;

    if (!providerId) return;

    const currentEntry = uniqueProviders.get(providerId);
    const fallbackLabel =
      typeof provider?.name === "string" && provider.name.trim().length > 0
        ? provider.name
        : providerId;

    uniqueProviders.set(providerId, {
      id: providerId,
      label: currentEntry?.label || fallbackLabel,
      connectionCount: (currentEntry?.connectionCount || 0) + 1,
    });
  });

  return [...uniqueProviders.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export default function BuilderIntelligentStep({ config, onChange, activeProviders }) {
  const normalizedConfig = normalizeIntelligentRoutingConfig(config);
  const providerOptions = useMemo(() => toProviderOptions(activeProviders), [activeProviders]);

  const updateConfig = (patch) => {
    onChange({
      ...normalizedConfig,
      ...patch,
      weights: {
        ...normalizedConfig.weights,
        ...(patch.weights || {}),
      },
    });
  };

  const toggleCandidateProvider = (providerId) => {
    const nextCandidatePool = normalizedConfig.candidatePool.includes(providerId)
      ? normalizedConfig.candidatePool.filter((entry) => entry !== providerId)
      : [...normalizedConfig.candidatePool, providerId];

    updateConfig({ candidatePool: nextCandidatePool });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header Card */}
      <div className="rounded border border-[var(--color-border)] p-4 bg-[var(--color-bg-alt)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-main)]">{translate("Intelligent Routing Configuration")}</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {translate("Configure the multi-factor scoring engine for this auto-routing combo.")}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]" style={{ backgroundColor: "var(--color-primary-soft)" }}>
            <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
            Intelligent
          </span>
        </div>
      </div>

      {/* Candidate Pool Card */}
      <div className="rounded border border-[var(--color-border)] p-4 bg-[var(--color-bg-alt)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-main)]">{translate("Candidate Pool")}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">{translate("Select which providers this engine should evaluate. Leave empty to use all active providers.")}</p>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {normalizedConfig.candidatePool.length > 0 ? `${normalizedConfig.candidatePool.length} ${translate("selected")}` : translate("All active providers")}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {providerOptions.length === 0 && (
            <span className="text-[11px] text-[var(--color-text-muted)]">{translate("No active providers available yet.")}</span>
          )}

          {providerOptions.map((provider) => {
            const isSelected = normalizedConfig.candidatePool.includes(provider.id);
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => toggleCandidateProvider(provider.id)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                }`}
                style={isSelected ? { backgroundColor: "var(--color-primary-soft)" } : {}}
              >
                {provider.label}
                <span className="ml-1 text-[10px]">
                  {provider.connectionCount} {translate("acct")}{provider.connectionCount === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Pack & Router Strategy Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded border border-[var(--color-border)] p-4 bg-[var(--color-bg-alt)]">
          <label className="text-xs font-semibold text-[var(--color-text-main)] block mb-2">{translate("Mode Pack")}</label>
          <select
            value={normalizedConfig.modePack}
            onChange={(event) => updateConfig({ modePack: event.target.value })}
            className="w-full text-xs py-2.5 px-3 rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-none transition-colors cursor-pointer"
          >
            {MODE_PACK_OPTIONS.map((modePack) => (
              <option key={modePack.id} value={modePack.id}>
                {modePack.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded border border-[var(--color-border)] p-4 bg-[var(--color-bg-alt)]">
          <label className="text-xs font-semibold text-[var(--color-text-main)] block mb-2">{translate("Router Strategy")}</label>
          <select
            value={normalizedConfig.routerStrategy}
            onChange={(event) => updateConfig({ routerStrategy: event.target.value })}
            className="w-full text-xs py-2.5 px-3 rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-main)] focus:border-[var(--color-primary)] focus:outline-none transition-colors cursor-pointer"
          >
            {ROUTER_STRATEGY_OPTIONS.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Exploration Rate & Budget Cap Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded border border-[var(--color-border)] p-4 bg-[var(--color-bg-alt)]">
          <label className="text-xs font-semibold text-[var(--color-text-main)] block">{translate("Exploration Rate")}</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={normalizedConfig.explorationRate}
            onChange={(event) => updateConfig({ explorationRate: Number(event.target.value || 0) })}
            className="mt-3 w-full cursor-pointer"
            style={{ accentColor: "var(--color-primary)" }}
          />
          <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
            {Math.round(normalizedConfig.explorationRate * 100)}% {translate("of requests can explore non-optimal providers.")}
          </p>
        </div>

        <div className="rounded border border-[var(--color-border)] p-4 bg-[var(--color-bg-alt)]">
          <label className="text-xs font-semibold text-[var(--color-text-main)] block mb-2">{translate("Budget Cap (USD / request)")}</label>
          <input
            type="number"
            min="0"
            step="0.0001"
            value={normalizedConfig.budgetCap ?? ""}
            placeholder={translate("No limit")}
            onChange={(event) =>
              updateConfig({
                budgetCap: event.target.value ? Number(event.target.value) : undefined,
              })
            }
            className="w-full text-xs py-2.5 px-3 rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text-main)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Advanced: Scoring Weights */}
      <details className="rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-bg-alt)]">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--color-text-main)]">{translate("Advanced: Scoring Weights")}</summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {Object.entries(normalizedConfig.weights).map(([weightKey, weightValue]) => (
            <div key={weightKey} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-medium text-[var(--color-text-main)]">
                  {FACTOR_LABELS[weightKey] || weightKey}
                </label>
                <span className="text-[11px] text-[var(--color-text-muted)]">{Math.round(Number(weightValue) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={weightValue}
                onChange={(event) =>
                  updateConfig({
                    weights: {
                      ...normalizedConfig.weights,
                      [weightKey]: Number(event.target.value || DEFAULT_INTELLIGENT_WEIGHTS[weightKey] || 0),
                    },
                  })
                }
                className="mt-3 w-full cursor-pointer"
                style={{ accentColor: "var(--color-primary)" }}
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
