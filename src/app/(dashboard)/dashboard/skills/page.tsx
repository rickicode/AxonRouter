"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/shared/components/AppIcon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import {
  SKILLS,
  SKILLS_REPO_URL,
  getSkillLocalUrl,
  getSkillBlobUrl,
} from "@/shared/constants/skills";

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */
function useOrigin() {
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  return origin;
}

function buildUseSkillPrompt(url: string) {
  return `Read this skill and use it: ${url}`;
}

const iconMap: Record<string, string> = {
  hub: "⚡", chat: "💬", image: "🖼️", record_voice_over: "🔊",
  mic: "🎙️", scatter_plot: "📐", search: "🔍", language: "🌐",
  edit_note: "✏️",
};

/* ================================================================== */
/*  CopyBtn                                                            */
/* ================================================================== */
function CopyBtn({ value, label = "Copy", icon = false }: { value: string; label?: string; icon?: boolean }) {
  const { copied, copy } = useCopyToClipboard(2000);
  if (icon) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="ghost" onClick={() => copy(value)} className="size-7 p-0">
              <AppIcon name={copied ? "check" : "content_copy"} className="text-xs" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{copied ? "Copied!" : label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => copy(value)} className="h-7 text-xs gap-1.5">
      <AppIcon name={copied ? "check" : "content_copy"} className="text-xs" />
      {copied ? "Copied" : label}
    </Button>
  );
}

/* ================================================================== */
/*  SkillCard                                                          */
/* ================================================================== */
function SkillCard({ skill, origin }: { skill: (typeof SKILLS)[number]; origin: string }) {
  const localUrl = `${origin}${getSkillLocalUrl(skill.id)}`;
  const githubUrl = getSkillBlobUrl(skill.id);
  const usePrompt = buildUseSkillPrompt(localUrl);

  return (
    <Card className={cn("group transition-shadow hover:shadow-md", skill.isEntry && "border-primary/50 ring-1 ring-primary/20")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg flex items-center justify-center shrink-0 text-lg bg-muted">
            {iconMap[skill.icon] || "⚡"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-foreground truncate">{skill.name}</h3>
              {skill.isEntry && <Badge variant="default" className="text-[10px] px-1.5 py-0">START HERE</Badge>}
            </div>
            {skill.endpoint && (
              <code className="text-[11px] text-muted-foreground font-mono">{skill.endpoint}</code>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {skill.description}
        </p>
        <div className="flex items-center gap-1.5 pt-1">
          <CopyBtn value={localUrl} label="Copy link" />
          <CopyBtn value={usePrompt} label="Use skill" />
          <a href={githubUrl} target="_blank" rel="noreferrer" className="ml-auto">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
              <AppIcon name="open_in_new" className="text-xs" />
              Source
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  CustomSkillCard                                                     */
/* ================================================================== */
function CustomSkillCard({ skill, onDelete, onEdit, onDuplicate, origin }: {
  skill: any;
  onDelete: (id: string) => void;
  onEdit: (s: any) => void;
  onDuplicate: (s: any) => void;
  origin: string;
}) {
  const localUrl = `${origin}${getSkillLocalUrl(skill.slug)}`;
  const usePrompt = buildUseSkillPrompt(localUrl);

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg flex items-center justify-center shrink-0 text-lg bg-muted">
            ✏️
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground truncate">{skill.name}</h3>
              <Badge variant="secondary" className="text-[10px]">custom</Badge>
            </div>
            <code className="text-[10px] text-muted-foreground font-mono">{skill.slug}</code>
          </div>
        </div>
        {skill.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{skill.description}</p>
        )}
        <div className="flex items-center gap-1.5 pt-1 flex-wrap">
          <CopyBtn value={localUrl} label="Copy link" />
          <CopyBtn value={usePrompt} label="Use skill" />
        </div>
        <div className="flex items-center gap-1 border-t border-border pt-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => onDuplicate(skill)} className="h-6 text-[11px] px-2">
            Duplicate
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(skill)} className="h-6 text-[11px] px-2">
            Edit
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(skill.id)} className="h-6 text-[11px] px-2 text-destructive hover:text-destructive ml-auto">
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  SkillsPage                                                         */
/* ================================================================== */
export default function SkillsPage() {
  const [activeTab, setActiveTab] = useState("builtin");
  const [customSkills, setCustomSkills] = useState<any[]>([]);
  const [newSkill, setNewSkill] = useState({ id: "", name: "", slug: "", description: "", content: "" });
  const [saveStatus, setSaveStatus] = useState("");
  const [editingSkillId, setEditingSkillId] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJson, setExportJson] = useState("");
  const inv = useInvalidate();
  const origin = useOrigin();

  const skillSearch: string = useHeaderSearchStore((s: any) => s.query);
  const setSkillSearch: (q: string) => void = useHeaderSearchStore((s: any) => s.setQuery);

  const loadCustomSkills = async () => {
    try {
      const res = await fetch("/api/skills", { cache: "no-store" });
      const data = await res.json();
      return res.ok ? (data.skills || []) : [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    let active = true;
    loadCustomSkills().then((skills) => { if (active) setCustomSkills(skills); });
    return () => { active = false; };
  }, []);

  /* ── mutations ── */
  const deleteMutation = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/skills?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => { inv.settings(); loadCustomSkills().then(setCustomSkills); },
  });

  const createMutation = useMutation({
    retry: false,
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create skill");
      return data;
    },
    onSuccess: () => {
      resetForm();
      setSaveStatus("Saved");
      inv.settings();
      loadCustomSkills().then(setCustomSkills);
    },
    onError: (err: Error) => { setSaveStatus(err.message); },
  });

  const updateSkillMutation = useMutation({
    retry: false,
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update skill");
      return data;
    },
    onSuccess: () => {
      resetForm();
      setSaveStatus("Updated");
      inv.settings();
      loadCustomSkills().then(setCustomSkills);
    },
    onError: (err: Error) => { setSaveStatus(err.message); },
  });

  const duplicateMutation = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Duplicate failed");
      return data;
    },
    onSuccess: (data) => {
      setSaveStatus(`Duplicated as ${data.skill?.slug || "copy"}`);
      inv.settings();
      loadCustomSkills().then(setCustomSkills);
    },
    onError: (err: Error) => { setSaveStatus(err.message); },
  });

  /* ── filtering ── */
  const q = skillSearch.trim().toLowerCase();
  const filteredBuiltin = SKILLS.filter((s) =>
    !q ? true : [s.name, s.description, s.id, s.endpoint].some((v) => String(v || "").toLowerCase().includes(q))
  );
  const filteredCustom = customSkills.filter((s) =>
    !q ? true : [s.name, s.slug, s.description, s.content].some((v) => String(v || "").toLowerCase().includes(q))
  );

  /* ── form helpers ── */
  const resetForm = () => {
    setNewSkill({ id: "", name: "", slug: "", description: "", content: "" });
    setEditingSkillId("");
    setSaveStatus("");
    setShowEditor(false);
  };

  const handleExport = async () => {
    const res = await fetch("/api/skills?format=export", { cache: "no-store" });
    const data = await res.json();
    setExportJson(JSON.stringify(data, null, 2));
    setExportOpen(true);
  };

  const handleExportCopy = async () => {
    await navigator.clipboard.writeText(exportJson);
    setSaveStatus("Exported to clipboard");
    setExportOpen(false);
  };

  const handleExportDownload = () => {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "axonrouter-skills-export.json";
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const handleImport = () => {
    setImportJson("");
    setImportOpen(true);
  };

  const handleImportConfirm = () => {
    setSaveStatus("");
    try {
      const parsed = JSON.parse(importJson);
      createMutation.mutate({ skills: parsed.skills || [] });
      setImportOpen(false);
      setImportJson("");
    } catch { setSaveStatus("Invalid JSON format"); }
  };

  const handleSave = () => {
    setSaveStatus("");
    const payload = { ...newSkill, slug: (newSkill.slug || "").trim().toLowerCase() };
    if (editingSkillId) {
      updateSkillMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header + Toggle ────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Agent skills</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-foreground">Skills library</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Drop-in skill documents for AI agents. Copy a link and paste it to your AI to enable AxonRouter capabilities.
          </p>
        </div>
        <ToggleGroup type="single" value={activeTab} onValueChange={(next) => next && setActiveTab(next)} aria-label="Skills sections">
          <ToggleGroupItem value="builtin" className="min-w-24">Built-in</ToggleGroupItem>
          <ToggleGroupItem value="custom" className="min-w-24">Custom</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* ── Quick Start Banner ─────────────────────── */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-4 flex-wrap">
          <div className="size-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary text-lg shrink-0">
            ⚡
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">Paste this to your AI agent to get started:</p>
            <code className="text-xs font-mono text-foreground break-all">
              Read this skill and use it: {origin}{getSkillLocalUrl("axonrouter")}
            </code>
          </div>
          <CopyBtn value={buildUseSkillPrompt(`${origin}${getSkillLocalUrl("axonrouter")}`)} label="Copy prompt" />
        </CardContent>
      </Card>

      {/* ── Search bar ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <AppIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" />
          <Input
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            placeholder="Search skills..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <a href={`${SKILLS_REPO_URL}/tree/main/skills`} target="_blank" rel="noreferrer">
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1.5">
            <AppIcon name="open_in_new" className="text-xs" />
            GitHub
          </Button>
        </a>
      </div>

      {/* ── Built-in Tab ───────────────────────────── */}
      {activeTab === "builtin" && (
        filteredBuiltin.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBuiltin.filter(s => s.isEntry).map((skill) => (
              <div key={skill.id} className="sm:col-span-2 lg:col-span-3">
                <SkillCard skill={skill} origin={origin} />
              </div>
            ))}
            {filteredBuiltin.filter(s => !s.isEntry).map((skill) => (
              <SkillCard key={skill.id} skill={skill} origin={origin} />
            ))}
          </div>
        ) : (
          <Empty className="border-dashed bg-card/40 py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon"><AppIcon name="search" /></EmptyMedia>
              <EmptyTitle>No built-in skills match your search.</EmptyTitle>
              <EmptyDescription>Try a different skill name, endpoint, or description.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      )}

      {/* ── Custom Tab ─────────────────────────────── */}
      {activeTab === "custom" && (
        <>
          {/* Actions bar */}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => { resetForm(); setShowEditor(true); }} className="h-8 text-xs gap-1.5">
              <AppIcon name="add" className="text-sm" />
              New Skill
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleImport} className="h-8 text-xs">
              Import
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleExport} className="h-8 text-xs">
              Export
            </Button>
            {saveStatus && (
              <Alert className="ml-auto py-1.5 px-3 max-w-xs">
                <AlertDescription className="text-xs">{saveStatus}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Editor */}
          {showEditor && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-bold text-foreground">
                  {editingSkillId ? "Edit Skill" : "Create New Skill"}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={newSkill.name}
                    onChange={(e) => setNewSkill((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Skill name"
                    className="h-9 text-xs"
                  />
                  <Input
                    value={newSkill.slug}
                    onChange={(e) => setNewSkill((p) => ({ ...p, slug: e.target.value }))}
                    placeholder="skill-slug"
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <Input
                  value={newSkill.description}
                  onChange={(e) => setNewSkill((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Short description"
                  className="h-9 text-xs"
                />
                <Textarea
                  value={newSkill.content}
                  onChange={(e) => setNewSkill((p) => ({ ...p, content: e.target.value }))}
                  placeholder="# My Skill&#10;&#10;Markdown content..."
                  rows={10}
                  className="min-h-40 resize-y font-mono text-xs"
                />
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" onClick={handleSave} className="h-8 text-xs">
                      {editingSkillId ? "Update" : "Save"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={resetForm} className="h-8 text-xs">
                      Cancel
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Served at <code className="font-mono">/api/skills/{newSkill.slug || "<slug>"}</code>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Custom skills grid */}
          {filteredCustom.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCustom.map((skill) => (
                <CustomSkillCard
                  key={skill.id}
                  skill={skill}
                  origin={origin}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onDuplicate={(s) => duplicateMutation.mutate(s.id)}
                  onEdit={(s) => {
                    setEditingSkillId(s.id);
                    setNewSkill({ id: s.id, name: s.name || "", slug: s.slug || "", description: s.description || "", content: s.content || "" });
                    setSaveStatus("");
                    setShowEditor(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <Empty className="border-dashed bg-card/40 py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon"><AppIcon name="edit_note" /></EmptyMedia>
                <EmptyTitle>{customSkills.length === 0 ? "No custom skills yet" : "No custom skills match your search"}</EmptyTitle>
                <EmptyDescription>
                  {customSkills.length === 0
                    ? "Create a custom skill to serve your own markdown via the API."
                    : "Try a different search term."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </>
      )}

      {/* ── Import Modal ───────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent aria-describedby="import-desc">
          <DialogHeader>
            <DialogTitle>Import Skills</DialogTitle>
            <DialogDescription id="import-desc">
              Paste the exported JSON to import custom skills.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"skills": [...]}'
            rows={10}
            className="min-h-40 resize-y font-mono text-xs"
          />
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => setImportOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleImportConfirm} disabled={!importJson.trim()} className="text-xs">
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export Modal ───────────────────────────── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent aria-describedby="export-desc">
          <DialogHeader>
            <DialogTitle>Export Skills</DialogTitle>
            <DialogDescription id="export-desc">
              Copy to clipboard or download as file.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={exportJson}
            readOnly
            rows={10}
            className="min-h-40 resize-y font-mono text-xs"
          />
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => setExportOpen(false)} className="text-xs">
              Close
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleExportDownload} className="text-xs gap-1.5">
              <AppIcon name="download" className="text-xs" />
              Download
            </Button>
            <Button type="button" size="sm" onClick={handleExportCopy} className="text-xs gap-1.5">
              <AppIcon name="content_copy" className="text-xs" />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
