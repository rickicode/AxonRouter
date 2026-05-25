"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function AddCustomModelModal({ isOpen, providerAlias, providerDisplayAlias, onSave, onClose }) {
  const [modelId, setModelId] = useState("");
  const [testStatus, setTestStatus] = useState(null);
  const [testError, setTestError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const resetTimer = setTimeout(() => {
      setModelId("");
      setTestStatus(null);
      setTestError("");
    }, 0);
    return () => clearTimeout(resetTimer);
  }, [isOpen]);

  const handleTest = async () => {
    if (!modelId.trim()) return;
    setTestStatus("testing");
    setTestError("");
    try {
      const res = await fetch("/api/models/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: `${providerAlias}/${modelId.trim()}` }) });
      const data = await res.json();
      setTestStatus(data.ok ? "ok" : "error");
      setTestError(data.error || "");
    } catch (err) {
      setTestStatus("error");
      setTestError(err.message);
    }
  };

  const handleSave = async () => {
    if (!modelId.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(modelId.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Custom Model</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Model ID</FieldLabel>
            <Input value={modelId} onChange={(e) => { setModelId(e.target.value); setTestStatus(null); setTestError(""); }} onKeyDown={(e) => e.key === "Enter" && handleTest()} placeholder="e.g. claude-opus-4-5" autoFocus />
          </Field>
          <p className="text-xs text-muted-foreground">
            Sent to {providerDisplayAlias || providerAlias} as: <code className="rounded bg-muted px-1 font-mono">{modelId.trim() || "model-id"}</code>
          </p>
          {testStatus === "ok" && (
            <Alert className="rounded-2xl border-[var(--color-success)]/20 bg-[var(--color-success-soft)] text-[var(--color-success)]">
              <AppIcon name="check_circle" />
              <AlertDescription>Model is reachable</AlertDescription>
            </Alert>
          )}
          {testStatus === "error" && (
            <Alert variant="destructive" className="rounded-2xl">
              <AppIcon name="cancel" />
              <AlertDescription>{testError || "Model not reachable"}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 pt-1">
            <Button onClick={onClose} variant="ghost" className="w-full" size="sm">Cancel</Button>
            <Button onClick={handleTest} className="w-full" size="sm" variant="secondary" disabled={!modelId.trim() || testStatus === "testing"}>
              {testStatus === "testing" ? <Spinner className="size-4" /> : <AppIcon name="science" />}
              {testStatus === "testing" ? "Testing..." : "Test"}
            </Button>
            <Button onClick={handleSave} className="w-full" size="sm" disabled={!modelId.trim() || saving}>
              {saving ? <Spinner className="size-4" /> : null}
              {saving ? "Adding..." : "Add Model"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

AddCustomModelModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  providerAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
