"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";

export default function MorphInstructionsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftMode, setDraftMode] = useState("default");
  const lastLoadedDraftRef = useRef("");
  const inv = useInvalidate();

  const applyFetchedData = useCallback((json) => {
    setData(json);
    const seed = json.mode === "custom"
      ? (json.customContent || "")
      : json.defaultContent;
    setDraft(seed);
    lastLoadedDraftRef.current = seed;
    setDraftMode(json.mode || "default");
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/providers/morph/instructions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      applyFetchedData(json);
    } catch (err) {
      setError(err?.message || "Failed to load Morph instructions settings");
    } finally {
      setLoading(false);
    }
  }, [applyFetchedData]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/providers/morph/instructions");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) applyFetchedData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load Morph instructions settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFetchedData]);

  const dirty = useMemo(() => {
    if (!data) return false;
    if (draftMode !== data.mode) return true;
    if (draftMode === "custom") return draft !== (data.customContent || "");
    return false;
  }, [data, draft, draftMode]);

  const toggleMutation = useMutation({
    retry: false,
    mutationFn: async (next: boolean) => {
      const res = await fetch("/api/providers/morph/instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (json, next) => {
      setData(json);
      const seed = json.mode === "custom" ? (json.customContent || "") : json.defaultContent;
      setDraft(seed);
      lastLoadedDraftRef.current = seed;
      setDraftMode(json.mode || "default");
      setInfo(next ? "Morph default instructions enabled." : "Morph default instructions disabled.");
      inv.providers(); inv.settings();
    },
    onError: (err: Error) => { setError(err.message || "Failed to update Morph instructions"); },
  });

  const saveMutation = useMutation({
    retry: false,
    mutationFn: async (content: string) => {
      const res = await fetch("/api/providers/morph/instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mode: "custom" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (json) => {
      setData(json);
      setDraft(json.customContent || "");
      lastLoadedDraftRef.current = json.customContent || "";
      setDraftMode(json.mode);
      setInfo(`Saved ${json.customLength.toLocaleString()} characters to ${json.filename}.`);
      inv.providers(); inv.settings();
    },
    onError: (err: Error) => { setError(err.message || "Failed to save custom instructions"); },
  });

  const resetMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/providers/morph/instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true, mode: "default" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (json) => {
      setData(json);
      setDraft(json.defaultContent);
      lastLoadedDraftRef.current = json.defaultContent;
      setDraftMode(json.mode);
      setInfo("Reset to default. Custom file deleted.");
      inv.providers(); inv.settings();
    },
    onError: (err: Error) => { setError(err.message || "Failed to reset Morph instructions"); },
  });

  const onToggleEnabled = useCallback((next) => {
    setSaving(true); setError(""); setInfo("");
    toggleMutation.mutate(next, { onSettled: () => setSaving(false) });
  }, [toggleMutation]);

  const onSaveCustom = useCallback(() => {
    setSaving(true); setError(""); setInfo("");
    saveMutation.mutate(draft, { onSettled: () => setSaving(false) });
  }, [draft, saveMutation]);

  const onResetToDefault = useCallback(() => {
    if (!confirm("Reset to built-in Morph default instructions? Any custom content will be deleted.")) return;
    setSaving(true); setError(""); setInfo("");
    resetMutation.mutate(undefined, { onSettled: () => setSaving(false) });
  }, [resetMutation]);

  const onLoadDefaultIntoEditor = useCallback(() => {
    if (!data) return;
    setDraft(data.defaultContent);
    setDraftMode("custom");
    setInfo("Loaded default into the editor. Save to persist as a custom override.");
  }, [data]);

  if (loading) {
    return <Card><CardContent><div className="py-6 text-sm text-muted-foreground">Loading Morph default instructions…</div></CardContent></Card>;
  }

  if (!data) {
    return <Card><CardContent><div className="py-6 text-sm text-red-500">{error || "Failed to load Morph instructions settings"}</div></CardContent></Card>;
  }

  return (
    <Card>
      <CardContent>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Morph Default Instructions</h2>
          <p className="text-sm text-text-muted mt-1">
            Controls the default code-aware guidance sent to Morph Fast Models on shared `/v1/*` request paths.
            Use built-in default for the standard coding-agent prompt, custom mode for your own
            <code className="font-mono"> morph-instructions.md </code>
            content, or disable this entirely to keep Morph Fast requests unmodified.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm text-text-muted">{data.enabled ? "Enabled" : "Disabled"}</span>
          <Switch checked={data.enabled} onToggle={(v) => onToggleEnabled(v)} disabled={saving} />
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mb-3 break-words">{error}</p>}
      {info && !error && <p className="text-xs text-green-500 mb-3 break-words">{info}</p>}

      {!data.enabled ? (
        <div className="rounded border border-border p-3 text-sm text-text-muted bg-bg-subtle">
          Morph Fast Models will receive no default code-aware instructions unless the request already includes its own explicit system or developer guidance.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm">
              Mode: <span className="font-medium">{data.mode === "custom" ? "Custom (.md file)" : "Built-in default"}</span>
              {data.mode === "custom" && data.hasCustomFile && (
                <span className="text-text-muted ml-2">
                  - {data.customLength.toLocaleString()} chars in <code className="font-mono">{data.filename}</code>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {data.mode === "default" && (
                <Button size="sm" variant="secondary" onClick={onLoadDefaultIntoEditor} disabled={saving}>Edit as custom</Button>
              )}
              {data.mode === "custom" && (
                <Button size="sm" variant="secondary" onClick={onResetToDefault} disabled={saving}>Reset to default</Button>
              )}
            </div>
          </div>

          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (draftMode !== "custom") setDraftMode("custom");
            }}
            spellCheck={false}
            disabled={saving}
            rows={18}
            className="w-full font-mono text-xs rounded border border-border bg-bg-input p-3 leading-relaxed"
            placeholder="Write your custom Morph instructions here…"
          />

          <div className="rounded border border-border p-3 text-xs text-text-muted bg-bg-subtle">
            Morph Fast Models use this for code-aware behavior on the shared provider surface. Morph Core native capabilities remain configured separately on this page.
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-text-muted">
            <span>{draft.length.toLocaleString()} chars</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDraft(lastLoadedDraftRef.current);
                  setDraftMode(data.mode);
                  setInfo("");
                  setError("");
                }}
                disabled={saving || !dirty}
              >
                Revert
              </Button>
              <Button size="sm" onClick={onSaveCustom} disabled={saving || draftMode !== "custom" || !dirty}>
                Save custom
              </Button>
            </div>
          </div>
        </div>
      )}
      </CardContent>
    </Card>
  );
}
