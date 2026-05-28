"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import AppIcon from "@/shared/components/AppIcon";
import { fetchJson, queryKeys } from "@/shared/query";
import {
  CAVEMAN_LEVELS,
  CAVEMAN_PROMPTS,
  DEFAULT_CAVEMAN_SETTINGS,
  type CavemanLevel,
} from "../../../../../open-sse/config/caveman";

const MODE_META: Record<CavemanLevel, {
  title: string;
  summary: string;
  example: string;
  intensity: string;
  bestFor: string;
  voice: string;
  outputShape: string;
  preserves: string[];
  avoids: string[];
}> = {
  lite: {
    title: "Lite",
    summary: "Short and direct while still reading like normal operator language.",
    example: "Fixed auth bug. Root cause cookie mismatch. Re-test login.",
    intensity: "Low compression",
    bestFor: "Daily dashboard use, support replies, and responses where tone should stay familiar.",
    voice: "Concise engineer: fewer filler words, no forced primitive grammar.",
    outputShape: "Small paragraphs or bullets with enough connective words to feel natural.",
    preserves: ["Exact file paths", "Warnings", "Uncertainty", "Next action"],
    avoids: ["Long explanations", "Over-compression", "Lost nuance"],
  },
  full: {
    title: "Full",
    summary: "Classic technical caveman mode with strong compression and clear next steps.",
    example: "Bug fixed. Cookie mismatch cause. Login path good now. Re-test.",
    intensity: "Balanced compression",
    bestFor: "Coding-agent output, incident notes, and progress updates where speed matters.",
    voice: "Helpful technical caveman: plain words, clipped syntax, still precise.",
    outputShape: "What changed, why it matters, then next step. Usually bullets or short lines.",
    preserves: ["Code symbols", "Commands", "Numbers", "Safety constraints"],
    avoids: ["Corporate phrasing", "Verbose summaries", "Fake certainty"],
  },
  ultra: {
    title: "Ultra",
    summary: "Maximum compression for high-signal operational output.",
    example: "Fix done. Cause cookie. Test login.",
    intensity: "High compression",
    bestFor: "Status pings, tight loops, mobile reading, and high-volume automation logs.",
    voice: "Minimal signal: fragments are okay when meaning stays exact.",
    outputShape: "Tiny lines. One idea per line. Only critical context survives.",
    preserves: ["Blockers", "Risk", "Identifiers", "Required detail"],
    avoids: ["Polish words", "Background context", "Optional rationale"],
  },
};

const PROMPT_LINE_LABELS: Record<CavemanLevel, string[]> = {
  lite: ["Activation marker", "Style rule", "Preservation rule", "Safety rule"],
  full: ["Activation marker", "Voice rule", "Response shape", "Preservation rule", "Safety rule"],
  ultra: ["Activation marker", "Compression rule", "Preservation rule", "Risk rule"],
};

const RUNTIME_TARGETS = [
  { label: "OpenAI chat", detail: "system/developer instruction message before target conversion" },
  { label: "OpenAI Responses / Codex", detail: "developer input item; existing instructions stay intact" },
  { label: "Claude", detail: "system text or text block after Claude conversion" },
  { label: "Gemini / CLI", detail: "systemInstruction parts on native or translated request bodies" },
  { label: "CommandCode", detail: "params.system appended after CommandCode defaults" },
];

const PLAYGROUND_PROMPTS: Record<CavemanLevel, string> = {
  lite: "Change shipped successfully. The issue was a stale cache key in the provider selector. Run the targeted test next.",
  full: "Change shipped successfully. The issue was a stale cache key in the provider selector. Run the targeted test next.",
  ultra: "Change shipped successfully. The issue was a stale cache key in the provider selector. Run the targeted test next.",
};

function normalizeCavemanSettings(value: any = {}) {
  const source = value && typeof value === "object" ? value : {};
  const level = CAVEMAN_LEVELS.includes(source.level) ? source.level : DEFAULT_CAVEMAN_SETTINGS.level;
  return {
    enabled: source.enabled === true,
    level,
    applyToPassthrough: source.applyToPassthrough !== false,
  };
}

function buildPlaygroundPreview(level: CavemanLevel, source: string) {
  const text = String(source || "").trim();
  if (!text) return "";

  if (level === "lite") {
    return `Caveman lite preview:\n${text}\n\nKeep short. Keep exact technical detail.`;
  }
  if (level === "ultra") {
    return `Caveman ultra preview:\n${text.replace(/\b(the|was|a|an)\b/gi, "").replace(/\s+/g, " ").trim()}`;
  }
  return `Caveman full preview:\n${text.replace(/\bthe\b/gi, "").replace(/\s+/g, " ").trim()}\n\nSay what changed. Say why matter. Say next step.`;
}

export default function CavemanPageClient() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(DEFAULT_CAVEMAN_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<{ type: "" | "success" | "error"; message: string }>({ type: "", message: "" });
  const [playgroundInput, setPlaygroundInput] = useState(PLAYGROUND_PROMPTS.full);
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: ({ signal }) => fetchJson<any>("/api/settings", { signal }),
  });
  const savedSettings = useMemo(
    () => normalizeCavemanSettings(settingsQuery.data?.caveman),
    [settingsQuery.data]
  );

  const saveMutation = useMutation({
    mutationFn: async (nextDraft: typeof draft) => {
      return fetchJson<any>("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caveman: nextDraft }),
      });
    },
    onSuccess: (data) => {
      const next = normalizeCavemanSettings(data?.caveman);
      setDraft(next);
      setIsDirty(false);
      queryClient.setQueryData(queryKeys.settings(), (current: any) => ({
        ...(current || {}),
        caveman: next,
      }));
      setStatus({ type: "success", message: "Caveman settings saved." });
    },
    onError: (error: any) => {
      setStatus({ type: "error", message: error?.message || "Failed to save Caveman settings." });
    },
  });

  const effectiveDraft = isDirty ? draft : savedSettings;
  const selectedPrompt = useMemo(() => CAVEMAN_PROMPTS[effectiveDraft.level], [effectiveDraft.level]);
  const selectedPromptLines = useMemo(() => selectedPrompt.split("\n").filter(Boolean), [selectedPrompt]);
  const promptLabels = PROMPT_LINE_LABELS[effectiveDraft.level];
  const playgroundPreview = useMemo(() => buildPlaygroundPreview(effectiveDraft.level, playgroundInput), [effectiveDraft.level, playgroundInput]);

  const saveDraft = async () => {
    setStatus({ type: "", message: "" });
    await saveMutation.mutateAsync(effectiveDraft);
  };

  const currentStatusLabel = effectiveDraft.enabled ? "Enabled" : "Disabled";
  const activeMode = MODE_META[effectiveDraft.level];

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden border-border/70">
        <CardHeader className="border-b border-border/70 bg-[var(--color-bg-alt)]">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-[4px] bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <AppIcon name="zap" size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>Caveman</CardTitle>
              <CardDescription>
                Global concise-output prompt modifier for routed chat requests and optional native passthrough clients.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Status</p>
            <p className="mt-2 text-2xl font-semibold text-text-main">{currentStatusLabel}</p>
            <p className="mt-2 text-sm text-text-muted">Current mode: {effectiveDraft.level}</p>
          </div>
          <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Passthrough</p>
            <p className="mt-2 text-2xl font-semibold text-text-main">{effectiveDraft.applyToPassthrough ? "Applied" : "Bypassed"}</p>
            <p className="mt-2 text-sm text-text-muted">Controls native client/provider pairs such as Codex, Claude, and Gemini CLI paths.</p>
          </div>
          <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Pipeline</p>
            <p className="mt-2 text-sm text-text-main">Translated requests use the canonical OpenAI-message modifier path before target conversion.</p>
            <p className="mt-2 text-sm text-text-muted">Native passthrough uses final-format helpers.</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="control" className="gap-6">
        <TabsList>
          <TabsTrigger value="control">Global Mode</TabsTrigger>
          <TabsTrigger value="modes">Modes</TabsTrigger>
          <TabsTrigger value="preview">Prompt Preview</TabsTrigger>
          <TabsTrigger value="playground">Test Playground</TabsTrigger>
          <TabsTrigger value="notes">Runtime Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="control">
          <Card>
            <CardHeader>
              <CardTitle>Global Mode</CardTitle>
              <CardDescription>Enable Caveman globally, choose the active compression level, and control passthrough scope.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
                <div>
                  <p className="font-medium text-text-main">Enable Caveman globally</p>
                  <p className="text-sm text-text-muted">All routed chat requests receive the Caveman prompt modifier when enabled.</p>
                </div>
                <Switch checked={effectiveDraft.enabled} onToggle={(enabled) => {
                  setIsDirty(true);
                  setDraft((prev) => ({ ...(isDirty ? prev : savedSettings), enabled }));
                }} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {CAVEMAN_LEVELS.map((level) => {
                  const active = effectiveDraft.level === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        setIsDirty(true);
                        setDraft((prev) => ({ ...(isDirty ? prev : savedSettings), level }));
                      }}
                      className={`rounded-[4px] border p-4 text-left transition-colors ${active ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10" : "border-border/70 bg-[var(--color-bg-alt)] hover:border-border"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-text-main">{MODE_META[level].title}</p>
                        <Badge variant={active ? "default" : "outline"}>{MODE_META[level].intensity}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-text-muted">{MODE_META[level].summary}</p>
                      <p className="mt-3 rounded-[4px] border border-border/70 bg-background/60 p-2 font-mono text-xs text-text-main">{MODE_META[level].example}</p>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
                <div>
                  <p className="font-medium text-text-main">Apply to native passthrough clients</p>
                  <p className="text-sm text-text-muted">Covers native Claude, Codex, Gemini CLI, and Antigravity request paths that skip the normal translator.</p>
                </div>
                <Switch
                  checked={effectiveDraft.applyToPassthrough}
                  onToggle={(enabled) => {
                    setIsDirty(true);
                    setDraft((prev) => ({ ...(isDirty ? prev : savedSettings), applyToPassthrough: enabled }));
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-4">
                <Button type="button" onClick={saveDraft} disabled={saveMutation.isPending || settingsQuery.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save Caveman settings"}
                </Button>
                {status.message ? (
                  <Alert variant={status.type === "error" ? "destructive" : "default"}>
                    <AlertDescription>{status.message}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modes">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 lg:grid-cols-3">
              {CAVEMAN_LEVELS.map((level) => {
                const meta = MODE_META[level];
                const active = effectiveDraft.level === level;
                return (
                  <Card key={level} className={active ? "border-[var(--color-primary)]/70" : undefined}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>{meta.title}</CardTitle>
                          <CardDescription>{meta.summary}</CardDescription>
                        </div>
                        <Badge variant={active ? "default" : "outline"}>{meta.intensity}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-3 font-mono text-sm text-text-main">
                        {meta.example}
                      </div>
                      <div className="flex flex-col gap-2 text-sm">
                        <div>
                          <p className="font-medium text-text-main">Best for</p>
                          <p className="text-text-muted">{meta.bestFor}</p>
                        </div>
                        <div>
                          <p className="font-medium text-text-main">Voice</p>
                          <p className="text-text-muted">{meta.voice}</p>
                        </div>
                        <div>
                          <p className="font-medium text-text-main">Output shape</p>
                          <p className="text-text-muted">{meta.outputShape}</p>
                        </div>
                      </div>
                      <Separator />
                      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
                        <div>
                          <p className="mb-2 font-medium text-text-main">Must preserve</p>
                          <div className="flex flex-wrap gap-2">
                            {meta.preserves.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 font-medium text-text-main">Avoids</p>
                          <div className="flex flex-wrap gap-2">
                            {meta.avoids.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Mode Selection Rules</CardTitle>
                <CardDescription>How to choose the level without guessing.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm text-text-main">
                <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-3">
                  <p className="font-medium">Use Lite when tone matters.</p>
                  <p className="mt-1 text-text-muted">Readable, polite, and short. Best default for human-facing prose.</p>
                </div>
                <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-3">
                  <p className="font-medium">Use Full for agent work.</p>
                  <p className="mt-1 text-text-muted">Most balanced. Keeps enough detail for code review, debugging, and validation summaries.</p>
                </div>
                <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-3">
                  <p className="font-medium">Use Ultra for status loops.</p>
                  <p className="mt-1 text-text-muted">Fastest to scan, but easiest to make terse. Good for repeated automation updates.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Prompt Preview</CardTitle>
                    <CardDescription>
                      Exact prompt text injected for the selected mode, with each line explained.
                    </CardDescription>
                  </div>
                  <Badge>{activeMode.title}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Raw injected prompt</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-[4px] border border-border/70 bg-background/70 p-4 text-sm leading-6 text-text-main">{selectedPrompt}</pre>
                </div>
                <div className="grid gap-3">
                  {selectedPromptLines.map((line, index) => (
                    <div key={`${effectiveDraft.level}-${index}`} className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Line {index + 1}</Badge>
                        <p className="text-sm font-medium text-text-main">{promptLabels[index] || "Prompt rule"}</p>
                      </div>
                      <p className="mt-2 font-mono text-sm text-text-main">{line}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Runtime Placement</CardTitle>
                <CardDescription>Where this prompt lands for each request shape.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {RUNTIME_TARGETS.map((target) => (
                  <div key={target.label} className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-3">
                    <p className="font-medium text-text-main">{target.label}</p>
                    <p className="mt-1 text-sm text-text-muted">{target.detail}</p>
                  </div>
                ))}
                <Separator />
                <div className="rounded-[4px] border border-border/70 bg-background/60 p-3 text-sm text-text-muted">
                  Existing system/developer instructions are preserved. Caveman is appended once and deduped by marker text.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="playground">
          <Card>
            <CardHeader>
              <CardTitle>Test Playground</CardTitle>
              <CardDescription>Local preview helper for the selected mode. This does not call a provider in phase 1.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-text-main">Sample source text</p>
                <Textarea
                  value={playgroundInput}
                  onChange={(event) => setPlaygroundInput(event.target.value)}
                  rows={10}
                  placeholder="Paste a normal assistant response to preview Caveman compression style."
                />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-text-main">Preview</p>
                <div className="min-h-[220px] rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4 text-sm leading-6 text-text-main whitespace-pre-wrap">
                  {playgroundPreview || "Type sample text to preview the selected Caveman mode."}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>Runtime Notes</CardTitle>
              <CardDescription>How Caveman currently works inside AxonRouter.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-text-main">
              <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
                Normal translated chat requests pass through the canonical prompt modifier layer before provider-specific target conversion.
              </div>
              <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
                OpenAI Responses/Codex compatibility keeps its current `instructions` contract; Caveman uses developer-style input injection instead of blindly writing `instructions`.
              </div>
              <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
                Native passthrough clients can still receive Caveman through final-format helpers when passthrough scope is enabled.
              </div>
              <div className="rounded-[4px] border border-border/70 bg-[var(--color-bg-alt)] p-4">
                Embeddings, image, TTS, STT, and other non-chat routes are not modified in phase 1.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
