"use client";

import { useState, useEffect } from "react";
import { getDefaultPricing } from "@/shared/constants/pricing";
import { translate } from "@/i18n/runtime";

export default function PricingModal({ isOpen, onClose }) {
  const [pricingData, setPricingData] = useState({});
  const [loading, setLoading] = useState(isOpen);

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/pricing");
        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();
          if (!cancelled) setPricingData(data);
        } else {
          if (!cancelled) setPricingData(getDefaultPricing());
        }
      } catch (error) {
        console.error("Failed to load pricing:", error);
        if (!cancelled) setPricingData(getDefaultPricing());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Get all unique providers and models for display
  const allProviders = Object.keys(pricingData).sort();
  const pricingFields = ["input", "output", "cached", "reasoning", "cache_creation"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 [background-color:var(--color-overlay,rgba(0,0,0,0.48))]">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
          <h2 className="text-xl font-semibold text-[var(--color-text-main)]">{translate("Pricing Reference")}</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-main)]"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="py-8 text-center text-[var(--color-text-muted)]">{translate("Loading pricing data...")}</div>
          ) : (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3 text-sm">
                <p className="mb-1 font-medium text-[var(--color-text-main)]">{translate("Pricing Rates Format")}</p>
                <p className="text-[var(--color-text-muted)]">
                  {translate("All rates are in")} <strong>{translate("dollars per million tokens")}</strong> ($/1M tokens).
                  {translate("Example: input rate 2.50 means $2.50 per 1,000,000 input tokens.")}
                </p>
                <p className="mt-2 text-[var(--color-text-muted)]">
                  {translate("Pricing is system-managed. This view is read-only and mirrors the rates used by backend cost calculation.")}
                </p>
              </div>

              {/* Pricing Tables */}
              {allProviders.map(provider => {
                const models = Object.keys(pricingData[provider]).sort();
                return (
                  <div key={provider} className="overflow-hidden rounded border border-[var(--color-border)]">
                    <div className="bg-[var(--color-bg-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text-main)]">
                      {provider.toUpperCase()}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--color-bg-alt)] text-[var(--color-text-muted)] uppercase text-xs">
                          <tr>
                            <th className="px-3 py-2 text-left">{translate("Model")}</th>
                            <th className="px-3 py-2 text-right">{translate("Input")}</th>
                            <th className="px-3 py-2 text-right">{translate("Output")}</th>
                            <th className="px-3 py-2 text-right">{translate("Cached")}</th>
                            <th className="px-3 py-2 text-right">{translate("Reasoning")}</th>
                            <th className="px-3 py-2 text-right">{translate("Cache Creation")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {models.map(model => (
                            <tr key={model} className="hover:bg-[var(--color-bg-alt)]">
                              <td className="px-3 py-2 font-medium text-[var(--color-text-main)]">{model}</td>
                              {pricingFields.map(field => (
                                <td key={field} className="px-3 py-2">
                                  <div className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-2 py-1 text-right text-[var(--color-text-main)]">
                                    {pricingData[provider][model][field] || 0}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {allProviders.length === 0 && (
                <div className="py-8 text-center text-[var(--color-text-muted)]">
                  {translate("No pricing data available")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] p-4">
          <button
            onClick={onClose}
            className="rounded border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-main)]"
          >
            {translate("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
