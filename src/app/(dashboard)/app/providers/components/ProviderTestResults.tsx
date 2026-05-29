"use client";

import PropTypes from "prop-types";
import AppIcon from "@/shared/components/AppIcon";

function TestPhaseBadge({ label, passed }: { label: string; passed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${
        passed
          ? "border border-[var(--color-success)]/20 bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]"
          : "border border-[var(--color-danger)]/20 bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-[var(--color-danger)]"
      }`}
    >
      {label}
    </span>
  );
}

export function ProviderTestResultsView({ results }) {
  if (results.error && !results.results) {
    return (
      <div className="text-center py-6">
        <AppIcon name="error" size={32} className="text-[var(--color-danger)] mb-2 block" />
        <p className="text-sm text-[var(--color-danger)]">{results.error}</p>
      </div>
    );
  }

  const { summary, mode } = results;
  const items = results.results || [];
  const modeLabel =
    {
      oauth: "OAuth",
      free: "Free",
      apikey: "API Key",
      provider: "Provider",
      all: "All Providers",
    }[mode] || mode;

  return (
    <div className="flex flex-col gap-3">
      {summary && (
        <div className="flex items-center gap-3 text-xs mb-1">
          <span className="text-text-muted">{modeLabel} Test</span>
          <span className="px-2 py-0.5 rounded border border-[var(--color-success)]/20 bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)] font-medium">
            {summary.passed} passed
          </span>
          {summary.failed > 0 && (
            <span className="px-2 py-0.5 rounded border border-[var(--color-danger)]/20 bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-[var(--color-danger)] font-medium">
              {summary.failed} failed
            </span>
          )}
          <span className="text-text-muted ml-auto">
            {summary.total} tested
          </span>
        </div>
      )}
      {items.map((r, i) => (
        <div
          key={r.connectionId || i}
          className="flex flex-col gap-1.5 text-xs px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)]"
        >
          <div className="flex items-center gap-2">
            <AppIcon name={r.valid ? "check_circle" : "error"} size={16} className={r.valid ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"} />
            <div className="flex-1 min-w-0">
              <span className="font-medium">{r.connectionName}</span>
              <span className="text-text-muted ml-1.5">({r.provider})</span>
            </div>
            {r.latencyMs !== undefined && (
              <span className="text-text-muted font-mono tabular-nums">
                {r.latencyMs}ms
              </span>
            )}
            <span
              className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                r.valid
                  ? "border border-[var(--color-success)]/20 bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]"
                  : "border border-[var(--color-danger)]/20 bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-[var(--color-danger)]"
              }`}
            >
              {r.valid ? "OK" : r.diagnosis?.type || "ERROR"}
            </span>
          </div>
          {/* Test phase diagnostics */}
          {r.phases && (
            <div className="flex items-center gap-1.5 ml-6">
              {r.phases.connectivity !== undefined && (
                <TestPhaseBadge label="connectivity" passed={r.phases.connectivity} />
              )}
              {r.phases.authValidation !== undefined && (
                <TestPhaseBadge label="auth" passed={r.phases.authValidation} />
              )}
              {r.phases.modelListing !== undefined && (
                <TestPhaseBadge label="models" passed={r.phases.modelListing} />
              )}
              {r.phases.chatCompletion !== undefined && (
                <TestPhaseBadge label="chat" passed={r.phases.chatCompletion} />
              )}
            </div>
          )}
          {!r.valid && r.diagnosis && (
            <div className="ml-6 text-[11px] text-text-muted">
              {r.diagnosis.message || r.error}
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-center py-4 text-text-muted text-sm">
          No active connections found for this group.
        </div>
      )}
    </div>
  );
}

ProviderTestResultsView.propTypes = {
  results: PropTypes.shape({
    mode: PropTypes.string,
    results: PropTypes.array,
    summary: PropTypes.shape({
      total: PropTypes.number,
      passed: PropTypes.number,
      failed: PropTypes.number,
    }),
    error: PropTypes.string,
  }).isRequired,
};
