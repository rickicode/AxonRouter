"use client";

import { useState, useEffect } from "react";
import { Modal, Button, Select } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { cn } from "@/shared/utils/cn";

/**
 * Modal to test an individual connection with a user-selected registered model.
 * Works for ALL providers.
 */
export default function TestAccountModelModal({
  isOpen,
  onClose,
  connection,
  providerId,
  providerStorageAlias,
  registeredModels = [],
}) {
  const [selectedModel, setSelectedModel] = useState("__auth_probe__");
  const [modelFilter, setModelFilter] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setTesting(false);
      setModelFilter("");
      if (registeredModels.length > 0) {
        setSelectedModel(registeredModels[0].id);
      } else {
        setSelectedModel("__auth_probe__");
      }
    }
  }, [isOpen, registeredModels]);

  if (!connection) return null;

  const connName = connection.displayName || connection.name || connection.email || connection.id?.slice(0, 8);

  const modelOptions = [
    { value: "__auth_probe__", label: "Default Auth Probe (Profile / ping)" },
    ...registeredModels.map((m) => ({
      value: m.id,
      label: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id,
    })),
  ];

  const handleRunTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      if (selectedModel === "__auth_probe__") {
        const res = await fetch(`/api/providers/${connection.id}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        setResult({
          ok: !!data.valid,
          status: data.statusCode || (data.valid ? 200 : 400),
          latencyMs: data.latencyMs,
          error: data.valid ? null : (data.error || "Probe failed"),
          model: "Auth probe",
        });
      } else {
        const res = await fetch(`/api/providers/${connection.id}/test-model`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: selectedModel,
            kind: "llm",
          }),
        });
        const data = await res.json();
        setResult({
          ok: !!data.ok,
          status: data.status || (data.ok ? 200 : 400),
          latencyMs: data.latencyMs,
          error: data.ok ? null : (data.error || "Model test failed"),
          note: data.note || null,
          model: selectedModel,
        });
      }
    } catch (err) {
      setResult({
        ok: false,
        status: 500,
        latencyMs: 0,
        error: err?.message || "Network error",
        model: selectedModel,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Test Connection with Model" size="md">
      <div className="flex flex-col gap-4">
        <div className="rounded-sm border border-border bg-surface-2 p-3 text-xs">
          <div className="font-medium text-text-main">
            Account: <span className="font-semibold text-primary">{connName}</span>
          </div>
          <div className="text-text-subtle font-mono mt-0.5">
            Provider: {providerId} · ID: {connection.id}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-text-muted">
              Select Registered Model ({registeredModels.length} models)
            </label>
          </div>
          {registeredModels.length > 8 && (
            <input
              type="text"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              placeholder="Filter model name..."
              className="mb-1.5 w-full rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-text-main focus:border-primary focus:outline-none"
            />
          )}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={testing}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-xs text-text-main focus:border-primary focus:outline-none"
          >
            <option value="__auth_probe__">Default Auth Probe (Profile / ping)</option>
            {registeredModels
              .filter((m) => !modelFilter || m.id.toLowerCase().includes(modelFilter.toLowerCase()) || (m.name && m.name.toLowerCase().includes(modelFilter.toLowerCase())))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                </option>
              ))}
          </select>
        </div>

        {result && (
          <div
            className={cn(
              "rounded-sm border p-3 text-xs flex flex-col gap-1.5",
              result.ok
                ? "border-success/40 bg-success/10 text-success"
                : "border-danger/40 bg-danger/10 text-danger"
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <Icon name={result.ok ? "check_circle" : "error"} size={16} />
              <span>{result.ok ? "Test Passed" : "Test Failed"}</span>
              {result.latencyMs != null && (
                <span className="ml-auto font-mono text-[11px] font-normal opacity-90">
                  {result.latencyMs}ms
                </span>
              )}
            </div>
            {result.note && (
              <div className="text-[11px] text-text-muted italic">{result.note}</div>
            )}
            {result.error && (
              <div className="text-[11px] text-danger/90 break-words font-mono mt-0.5">
                {result.error}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button size="sm" variant="secondary" onClick={onClose} disabled={testing}>
            Close
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon="play_arrow"
            onClick={handleRunTest}
            loading={testing}
            disabled={testing}
          >
            {testing ? "Testing..." : "Run Test"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
