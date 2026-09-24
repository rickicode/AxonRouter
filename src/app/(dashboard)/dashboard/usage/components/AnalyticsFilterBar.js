"use client";

import Card from "@/shared/components/Card";
import Combobox from "@/shared/components/Combobox";
import Button from "@/shared/components/Button";
import { cn } from "@/shared/utils/cn";
import {
  TIME_BUCKETS,
  defaultTimeBucket,
} from "./analyticsData";
import { ERROR_METADATA } from "./analyticsConstants";
import Icon from "@/shared/components/Icon";

export default function AnalyticsFilterBar({ analytics, period }) {
  const {
    provider, setProvider,
    model, setModel,
    errorCategory, setErrorCategory,
    autoRefreshInterval, setAutoRefreshInterval,
    timeBucket, setTimeBucket,
    loading, loadingOptions,
    providerValidation, modelValidation,
    providerOptions, modelOptions,
    hasActiveFilters,
    handleProviderChange, handleModelChange,
    setRefresh,
  } = analytics;

  return (
    <Card padding="sm" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Provider Filter */}
        <div className="flex min-w-0 w-full items-center sm:flex-1 sm:min-w-[180px]">
          <Combobox
            id="analytics-provider-filter"
            aria-label="Provider filter"
            placeholder="All Providers"
            value={provider}
            onChange={handleProviderChange}
            options={providerOptions}
            icon="cloud"
            allowCustom
            clearable
            loading={loadingOptions}
            error={providerValidation.valid ? undefined : providerValidation.error}
            className="w-full"
          />
        </div>

        {/* Model Filter */}
        <div className="flex min-w-0 w-full items-center sm:flex-1 sm:min-w-[180px]">
          <Combobox
            id="analytics-model-filter"
            aria-label="Model filter"
            placeholder="All Models"
            value={model}
            onChange={handleModelChange}
            options={modelOptions}
            icon="psychology"
            allowCustom
            clearable
            loading={loadingOptions}
            error={modelValidation.valid ? undefined : modelValidation.error}
            className="w-full"
          />
        </div>

        {/* Granularity Dropdown */}
        <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-sm border border-border bg-surface text-xs hover:border-border-subtle focus-within:border-primary transition-colors shrink-0">
          <Icon name="schedule" size={16} className="text-text-muted shrink-0" />
          <select
            value={timeBucket}
            onChange={(e) => setTimeBucket(e.target.value)}
            className="bg-transparent text-xs text-text-main font-medium outline-none cursor-pointer pr-1"
            aria-label="Timeline granularity"
          >
            <option value="">Auto ({defaultTimeBucket(period)})</option>
            {TIME_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auto Refresh Dropdown */}
        <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-sm border border-border bg-surface text-xs hover:border-border-subtle focus-within:border-primary transition-colors shrink-0">
          <Icon name="timer" size={16} className="text-text-muted shrink-0" />
          <select
            value={autoRefreshInterval}
            onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
            className="bg-transparent text-xs text-text-main font-medium outline-none cursor-pointer pr-1"
            aria-label="Auto refresh interval"
          >
            <option value={0}>Auto: Off</option>
            <option value={15}>Auto: 15s</option>
            <option value={30}>Auto: 30s</option>
            <option value={60}>Auto: 60s</option>
          </select>
          {autoRefreshInterval > 0 && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
          )}
        </div>

        {/* Refresh Button (CSV button removed as requested) */}
        <Button
          variant="secondary"
          size="md"
          icon="refresh"
          loading={loading}
          onClick={() => setRefresh((x) => x + 1)}
          className="shrink-0"
        >
          Refresh
        </Button>
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border text-xs">
          <span className="text-text-muted font-medium mr-1 text-[11px]">Active filters:</span>
          {provider && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-sm bg-surface-2 text-text-main border border-border text-[11px]">
              Provider: <strong className="truncate max-w-[140px]">{provider}</strong>
              <button
                type="button"
                onClick={() => setProvider("")}
                className="hover:text-danger ml-0.5 inline-flex items-center"
                aria-label="Remove provider filter"
              >
                <Icon name="close" size={18} />
              </button>
            </span>
          )}
          {model && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-sm bg-surface-2 text-text-main border border-border text-[11px]">
              Model: <strong className="truncate max-w-[140px]">{model}</strong>
              <button
                type="button"
                onClick={() => setModel("")}
                className="hover:text-danger ml-0.5 inline-flex items-center"
                aria-label="Remove model filter"
              >
                <Icon name="close" size={18} />
              </button>
            </span>
          )}
          {errorCategory && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 rounded-sm bg-danger/10 text-danger border border-danger/30 text-[11px]">
              Error: <strong>{ERROR_METADATA[errorCategory]?.label || errorCategory}</strong>
              <button
                type="button"
                onClick={() => setErrorCategory("")}
                className="hover:text-danger ml-0.5 inline-flex items-center"
                aria-label="Remove error category filter"
              >
                <Icon name="close" size={18} />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setProvider("");
              setModel("");
              setErrorCategory("");
            }}
            className="text-text-muted hover:text-danger text-[11px] underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}
    </Card>
  );
}
