"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";

export function AddOpenAICompatibleModal({ isOpen, onClose, onCreated }) {
  const inv = useInvalidate();
  const validationAlertClass = "border-0 rounded-[4px] text-[var(--color-danger)] !bg-[var(--color-danger)]/15";
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    apiType: "chat",
    baseUrl: "https://api.openai.com/v1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showAdvancedCheck, setShowAdvancedCheck] = useState(false);

  const apiTypeOptions = [
    { value: "chat", label: "Chat Completions" },
    { value: "responses", label: "Responses API" },
  ];

  const createOpenAINodeMutation = useMutation({
    retry: false,
    mutationFn: async (body: typeof formData) => {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, type: "openai-compatible" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create node");
      return data;
    },
    onSuccess: (data) => {
      onCreated(data.node);
      inv.providerNodes(); inv.providerModels();
      setFormData({ name: "", prefix: "", apiType: "chat", baseUrl: "https://api.openai.com/v1" });
      setCheckKey("");
      setCheckModelId("");
      setValidationResult(null);
    },
    onSettled: () => setSubmitting(false),
  });

  const handleSubmit = (event) => {
    event?.preventDefault();
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    createOpenAINodeMutation.mutate(formData);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: "openai-compatible",
          modelId: checkModelId.trim() || undefined,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, method } = validationResult;

    return (
      <Alert variant={valid ? "default" : "destructive"} className={valid ? "border-0 rounded-[4px] text-[var(--color-success)] !bg-[var(--color-success)]/15" : validationAlertClass}>
        <AlertTitle className="flex items-center gap-2">
          <ShadcnBadge variant={valid ? "default" : "destructive"}>{valid ? "Valid" : "Invalid"}</ShadcnBadge>
          {valid ? "Endpoint check passed" : "Endpoint check failed"}
        </AlertTitle>
        <AlertDescription>
          {valid && method === "chat"
            ? "Validated with an inference test because model listing was unavailable."
            : valid
              ? "The endpoint accepted the supplied key."
              : error || "AxonRouter could not validate this endpoint."}
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          return;
        }
        setShowAdvancedCheck(false);
        setCheckKey("");
        setCheckModelId("");
        setValidationResult(null);
      }}
    >
      <DialogContent className="max-w-[min(calc(100vw-2rem),42rem)]">
        <DialogHeader>
          <DialogTitle>Add OpenAI Compatible</DialogTitle>
          <DialogDescription>Add an OpenAI-compatible provider endpoint and optionally validate it first.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="openai-compatible-name">Name</FieldLabel>
              <ShadcnInput
                id="openai-compatible-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="OpenAI Compatible (Prod)"
                required
              />
              <FieldDescription>Required. A friendly label for this node.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="openai-compatible-prefix">Prefix</FieldLabel>
              <ShadcnInput
                id="openai-compatible-prefix"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                placeholder="oc-prod"
                required
              />
              <FieldDescription>Required. Used as the provider prefix for model IDs.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>API Type</FieldLabel>
              <ShadcnSelect value={formData.apiType} onValueChange={(value) => setFormData({ ...formData, apiType: value })}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Select API type" />
                </SelectTrigger>
                <SelectContent>
                  {apiTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </ShadcnSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="openai-compatible-base-url">Base URL</FieldLabel>
              <ShadcnInput
                id="openai-compatible-base-url"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                required
              />
              <FieldDescription>Use the base URL (ending in /v1) for your OpenAI-compatible API.</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="rounded-[4px] border border-border bg-muted/30 p-4">
            <div className="mb-3 flex flex-col gap-1">
              <h3 className="text-sm font-semibold tracking-[-0.01em]">Credential flow</h3>
              <p className="text-sm text-muted-foreground">Create the compatible endpoint first. Add and validate API keys from the connection list after node creation.</p>
            </div>
            <details
              className="rounded-[4px] border border-border/60 bg-background/50 p-3"
              open={showAdvancedCheck}
              onToggle={(event) => setShowAdvancedCheck((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm font-medium text-foreground">Optional pre-check (advanced)</summary>
              <div className="mt-3 flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="openai-compatible-check-key">API Key (optional)</FieldLabel>
                  <ShadcnInput
                    id="openai-compatible-check-key"
                    type="password"
                    value={checkKey}
                    onChange={(e) => setCheckKey(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="openai-compatible-check-model">Model ID (optional)</FieldLabel>
                  <ShadcnInput
                    id="openai-compatible-check-model"
                    value={checkModelId}
                    onChange={(e) => setCheckModelId(e.target.value)}
                    placeholder="e.g. gpt-4, claude-3-opus"
                  />
                  <FieldDescription>If provider lacks /models endpoint, enter a model ID to validate via chat/completions instead.</FieldDescription>
                </Field>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Button
                    type="button"
                    onClick={handleValidate}
                    disabled={!checkKey || validating || !formData.baseUrl.trim()}
                    variant="secondary"
                  >
                    {validating ? <Spinner className="size-4" /> : null}
                    {validating ? "Checking" : "Check endpoint"}
                  </Button>
                  <div className="flex-1">{renderValidationResult()}</div>
                </div>
              </div>
            </details>
          </div>
          <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <p className="order-3 text-xs text-muted-foreground sm:order-1 sm:mr-auto">After create, open provider details and add API key from Connections.</p>
            <Button type="button" onClick={onClose} variant="ghost" className="order-1 sm:order-2">
              Cancel
            </Button>
            <Button
              type="submit"
              className="order-2 sm:order-3"
              disabled={
                !formData.name.trim() ||
                !formData.prefix.trim() ||
                !formData.baseUrl.trim() ||
                submitting
              }
            >
              {submitting ? <Spinner className="size-4" /> : null}
              {submitting ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

AddOpenAICompatibleModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

export function AddAnthropicCompatibleModal({ isOpen, onClose, onCreated }) {
  const inv = useInvalidate();
  const validationAlertClass = "border-0 rounded-[4px] text-[var(--color-danger)] !bg-[var(--color-danger)]/15";
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    baseUrl: "https://api.anthropic.com/v1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null); // { valid, error, method }
  const [showAdvancedCheck, setShowAdvancedCheck] = useState(false);

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      setValidationResult(null);
      setCheckKey("");
      setCheckModelId("");
      setShowAdvancedCheck(false);
      return;
    }
    onClose?.(nextOpen);
  };

  const createAnthropicNodeMutation = useMutation({
    retry: false,
    mutationFn: async (body: typeof formData) => {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, type: "anthropic-compatible" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create node");
      return data;
    },
    onSuccess: (data) => {
      onCreated(data.node);
      inv.providerNodes(); inv.providerModels();
      setFormData({ name: "", prefix: "", baseUrl: "https://api.anthropic.com/v1" });
      setCheckKey("");
      setCheckModelId("");
      setValidationResult(null);
    },
    onSettled: () => setSubmitting(false),
  });

  const handleSubmit = (event) => {
    event?.preventDefault();
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    createAnthropicNodeMutation.mutate(formData);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: "anthropic-compatible",
          modelId: checkModelId.trim() || undefined,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, method } = validationResult;

    return (
      <Alert variant={valid ? "default" : "destructive"} className={valid ? "border-0 rounded-[4px] text-[var(--color-success)] !bg-[var(--color-success)]/15" : validationAlertClass}>
        <AlertTitle className="flex items-center gap-2">
          <ShadcnBadge variant={valid ? "default" : "destructive"}>{valid ? "Valid" : "Invalid"}</ShadcnBadge>
          {valid ? "Endpoint check passed" : "Endpoint check failed"}
        </AlertTitle>
        <AlertDescription>
          {valid && method === "chat"
            ? "Validated with an inference test because model listing was unavailable."
            : valid
              ? "The endpoint accepted the supplied key."
              : error || "AxonRouter could not validate this endpoint."}
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && handleOpenChange(false)}
    >
      <DialogContent className="max-w-[min(calc(100vw-2rem),42rem)]">
        <DialogHeader>
          <DialogTitle>Add Anthropic Compatible</DialogTitle>
          <DialogDescription>Add an Anthropic-compatible provider endpoint and optionally validate it first.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="anthropic-compatible-name">Name</FieldLabel>
              <ShadcnInput
                id="anthropic-compatible-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Anthropic Compatible (Prod)"
                required
              />
              <FieldDescription>Required. A friendly label for this node.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="anthropic-compatible-prefix">Prefix</FieldLabel>
              <ShadcnInput
                id="anthropic-compatible-prefix"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                placeholder="ac-prod"
                required
              />
              <FieldDescription>Required. Used as the provider prefix for model IDs.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="anthropic-compatible-base-url">Base URL</FieldLabel>
              <ShadcnInput
                id="anthropic-compatible-base-url"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="https://api.anthropic.com/v1"
                required
              />
              <FieldDescription>Use the base URL (ending in /v1) for your Anthropic-compatible API. The system will append /messages.</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="rounded-[4px] border border-border bg-muted/30 p-4">
            <div className="mb-3 flex flex-col gap-1">
              <h3 className="text-sm font-semibold tracking-[-0.01em]">Credential flow</h3>
              <p className="text-sm text-muted-foreground">Create the compatible endpoint first. Add and validate API keys from the connection list after node creation.</p>
            </div>
            <details
              className="rounded-[4px] border border-border/60 bg-background/50 p-3"
              open={showAdvancedCheck}
              onToggle={(event) => setShowAdvancedCheck((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm font-medium text-foreground">Optional pre-check (advanced)</summary>
              <div className="mt-3 flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="anthropic-compatible-check-key">API Key (optional)</FieldLabel>
                  <ShadcnInput
                    id="anthropic-compatible-check-key"
                    type="password"
                    value={checkKey}
                    onChange={(e) => setCheckKey(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="anthropic-compatible-check-model">Model ID (optional)</FieldLabel>
                  <ShadcnInput
                    id="anthropic-compatible-check-model"
                    value={checkModelId}
                    onChange={(e) => setCheckModelId(e.target.value)}
                    placeholder="e.g. claude-3-opus"
                  />
                  <FieldDescription>If provider lacks /models endpoint, enter a model ID to validate via chat/completions instead.</FieldDescription>
                </Field>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Button
                    type="button"
                    onClick={handleValidate}
                    disabled={!checkKey || validating || !formData.baseUrl.trim()}
                    variant="secondary"
                  >
                    {validating ? <Spinner className="size-4" /> : null}
                    {validating ? "Checking" : "Check endpoint"}
                  </Button>
                  <div className="flex-1">{renderValidationResult()}</div>
                </div>
              </div>
            </details>
          </div>
          <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <p className="order-3 text-xs text-muted-foreground sm:order-1 sm:mr-auto">After create, open provider details and add API key from Connections.</p>
            <Button type="button" onClick={onClose} variant="ghost" className="order-1 sm:order-2">
              Cancel
            </Button>
            <Button
              type="submit"
              className="order-2 sm:order-3"
              disabled={
                !formData.name.trim() ||
                !formData.prefix.trim() ||
                !formData.baseUrl.trim() ||
                submitting
              }
            >
              {submitting ? <Spinner className="size-4" /> : null}
              {submitting ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

AddAnthropicCompatibleModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

