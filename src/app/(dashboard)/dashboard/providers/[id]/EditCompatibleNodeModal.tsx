"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInvalidate } from "@/shared/query";

function LabeledInput({ label, hint, className, ...props }) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Input {...props} />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

export default function EditCompatibleNodeModal({ isOpen, node, onSave, onClose, isAnthropic, providerId }) {
  const inv = useInvalidate();
  const [formData, setFormData] = useState({ name: "", prefix: "", apiType: "chat", baseUrl: "https://api.openai.com/v1" });
  const [saving, setSaving] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  useEffect(() => {
    if (!node) return undefined;
    const resetTimer = setTimeout(() => {
      setFormData({ name: node.name || "", prefix: node.prefix || "", apiType: node.apiType || "chat", baseUrl: node.baseUrl || (isAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1") });
    }, 0);
    return () => clearTimeout(resetTimer);
  }, [node, isAnthropic]);

  const apiTypeOptions = [
    { value: "chat", label: "Chat Completions" },
    { value: "responses", label: "Responses API" },
  ];

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSaving(true);
    try {
      const payload: any = { name: formData.name, prefix: formData.prefix, baseUrl: formData.baseUrl };
      if (!isAnthropic) payload.apiType = formData.apiType;
      await onSave(payload);
      inv.providerNodes();
      inv.allProviders(providerId);
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: formData.baseUrl, apiKey: checkKey, type: isAnthropic ? "anthropic-compatible" : "openai-compatible", modelId: checkModelId.trim() || undefined }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch {
      setValidationResult("failed");
    } finally {
      setValidating(false);
    }
  };

  if (!node) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{`Edit ${isAnthropic ? "Anthropic" : "OpenAI"} Compatible`}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <LabeledInput label="Name" className="w-full" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={`${isAnthropic ? "Anthropic" : "OpenAI"} Compatible (Prod)`} hint="Required. A friendly label for this node." />
          <LabeledInput label="Prefix" className="w-full" value={formData.prefix} onChange={(e) => setFormData({ ...formData, prefix: e.target.value })} placeholder={isAnthropic ? "ac-prod" : "oc-prod"} hint="Required. Used as the provider prefix for model IDs." />
          {!isAnthropic && (
            <Field>
              <FieldLabel>API Type</FieldLabel>
              <Select value={formData.apiType} onValueChange={(value) => setFormData({ ...formData, apiType: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{apiTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <LabeledInput label="Base URL" className="w-full" value={formData.baseUrl} onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })} placeholder={isAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"} hint={`Use the base URL (ending in /v1) for your ${isAnthropic ? "Anthropic" : "OpenAI"}-compatible API.`} />
          <div className="flex gap-2">
            <LabeledInput label="API Key (for Check)" hint="Used only for validation checks." type="password" value={checkKey} onChange={(e) => setCheckKey(e.target.value)} className="flex-1" />
            <div className="pt-6"><Button onClick={handleValidate} disabled={!checkKey || validating || !formData.baseUrl.trim()} variant="secondary">{validating ? <Spinner className="size-4" /> : null}{validating ? "Checking..." : "Check"}</Button></div>
          </div>
          <LabeledInput label="Model ID (optional)" className="w-full" value={checkModelId} onChange={(e) => setCheckModelId(e.target.value)} placeholder="e.g. my-model-id" hint="If provider lacks /models endpoint, enter a model ID to validate via chat/completions instead." />
          {validationResult && <Badge variant={validationResult === "success" ? "default" : "destructive"}>{validationResult === "success" ? "Valid" : "Invalid"}</Badge>}
          <div className="flex gap-2">
            <Button onClick={handleSubmit} className="w-full" disabled={!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || saving}>{saving ? <Spinner className="size-4" /> : null}{saving ? "Saving..." : "Save"}</Button>
            <Button onClick={onClose} variant="ghost" className="w-full">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

EditCompatibleNodeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  node: PropTypes.shape({ id: PropTypes.string, name: PropTypes.string, prefix: PropTypes.string, apiType: PropTypes.string, baseUrl: PropTypes.string }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  isAnthropic: PropTypes.bool,
  providerId: PropTypes.string,
};
