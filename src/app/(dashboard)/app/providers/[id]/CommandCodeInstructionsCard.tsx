"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { translate } from "@/i18n/runtime";

export default function CommandCodeInstructionsCard() {
  const inv = useInvalidate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftMode, setDraftMode] = useState("default");
  const lastLoadedDraftRef = useRef("");

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
      const res = await fetch("/api/providers/commandcode/instructions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      applyFetchedData(json);
    } catch (err) {
      setError(err?.message || translate("Failed to load Command Code instructions settings"));
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
        const res = await fetch("/api/providers/commandcode/instructions");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) applyFetchedData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || translate("Failed to load Command Code instructions settings"));
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
      const res = await fetch("/api/providers/commandcode/instructions", {
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
      setInfo(next
        ? translate("Command Code default instructions enabled.")
        : translate("Command Code default instructions disabled.")
      );
      inv.providers();
    },
    onError: (err: Error) => { setError(err.message || translate("Failed to update")); },
  });

  const saveMutation = useMutation({
    retry: false,
    mutationFn: async (content: string) => {
      const res = await fetch("/api/providers/commandcode/instructions", {
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
      setInfo(translate(`Saved ${json.customLength.toLocaleString()} characters to ${json.filename}.`));
      inv.providers();
    },
    onError: (err: Error) => { setError(err.message || translate("Failed to save custom instructions")); },
  });

  const resetMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const res = await fetch("/api/providers/commandcode/instructions", {
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
      setInfo(translate("Reset to default. Custom file deleted."));
      inv.providers();
    },
    onError: (err: Error) => { setError(err.message || translate("Failed to reset")); },
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
    if (!confirm(translate("Reset to built-in Command Code default instructions? Any custom content will be deleted."))) return;
    setSaving(true); setError(""); setInfo("");
    resetMutation.mutate(undefined, { onSettled: () => setSaving(false) });
  }, [resetMutation]);

  const onLoadDefaultIntoEditor = useCallback(() => {
    if (!data) return;
    setDraft(data.defaultContent);
    setDraftMode("custom");
    setInfo(translate("Loaded default into the editor. Save to persist as a custom override."));
  }, [data]);

  if (loading) {
    return <Card><CardContent><div className="py-6 text-sm text-text-muted">{translate("Loading Command Code default instructions…")}</div></CardContent></Card>;
  }

  if (!data) {
    return <Card><CardContent><div className="py-6 text-sm text-red-500">{error || translate("Failed to load Command Code instructions settings")}</div></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{translate("Command Code Default Instructions")}</CardTitle>
          <CardDescription>
            {translate("Controls the default coding-agent behavior sent to Command Code requests.")}
            {translate("Default mode sends the built-in agent prompt, custom mode sends your own")} <code className="font-mono"> commandcode-instructions.md </code>{translate("content, and disabled sends no default provider instructions.")}
          </CardDescription>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-sm text-text-muted">{data.enabled ? translate("Enabled") : translate("Disabled")}</span>
          <Switch checked={data.enabled} onToggle={(v) => onToggleEnabled(v)} disabled={saving} />
        </div>
      </CardHeader>
      <CardContent>

      {error && <p className="text-xs text-red-500 mb-3 break-words">{error}</p>}
      {info && !error && <p className="text-xs text-green-500 mb-3 break-words">{info}</p>}

      {!data.enabled ? (
        <div className="rounded border border-border p-3 text-sm text-text-muted bg-bg-subtle">
          {translate("Sending no default Command Code instructions. Use this only if you want the raw upstream model behavior without the coding-agent guardrails.")}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm">
              {translate("Mode:")} <span className="font-medium">{data.mode === "custom" ? translate("Custom (.md file)") : translate("Built-in default")}</span>
              {data.mode === "custom" && data.hasCustomFile && (
                <span className="text-text-muted ml-2">
                  - {data.customLength.toLocaleString()} chars in <code className="font-mono">{data.filename}</code>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {data.mode === "default" && (
                <Button size="sm" variant="secondary" onClick={onLoadDefaultIntoEditor} disabled={saving}>{translate("Edit as custom")}</Button>
              )}
              {data.mode === "custom" && (
                <Button size="sm" variant="secondary" onClick={onResetToDefault} disabled={saving}>{translate("Reset to default")}</Button>
              )}
            </div>
          </div>

          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (draftMode !== "custom") setDraftMode("custom");
            }}
            spellCheck={false}
            disabled={saving}
            rows={18}
            className="font-mono text-xs leading-relaxed"
            placeholder={translate("Write your custom Command Code instructions here…")}
          />

          <div className="rounded border border-border p-3 text-xs text-text-muted bg-bg-subtle">
            {translate("Recommended for most users: keep")} <span className="font-medium">{translate("Built-in default")}</span> {translate("enabled. Switch to")} <span className="font-medium">{translate("Custom")}</span> {translate("only when you want to override the provider's default coding-agent behavior for every Command Code request.")}
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
                {translate("Revert")}
              </Button>
              <Button size="sm" onClick={onSaveCustom} disabled={saving || draftMode !== "custom" || !dirty}>
                {translate("Save custom")}
              </Button>
            </div>
          </div>
        </div>
      )}
      </CardContent>
    </Card>
  );
}
