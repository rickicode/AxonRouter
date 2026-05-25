"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { translate } from "@/i18n/runtime";

function buildInitialFormState(connection: any) {
  const routingOrder = connection?.providerSpecificData?.routingOrder;
  return {
    name: connection?.name || "",
    priority: connection?.priority || 1,
    apiKey: "",
    hasExistingKey: Boolean(connection?.maskedApiKey),
    maskedApiKeyHint: connection?.maskedApiKey || "",
    isActive: connection?.isActive !== false,
    routingOrderLocked: connection?.providerSpecificData?.routingOrderLocked === true,
    routingOrder: Number.isFinite(Number(routingOrder)) ? String(Number(routingOrder)) : "",
  };
}

function buildInitialAzureState(connection: any) {
  if (connection?.provider === "azure" && connection?.providerSpecificData) {
    return {
      azureEndpoint: connection.providerSpecificData.azureEndpoint || "",
      apiVersion: connection.providerSpecificData.apiVersion || "2024-10-01-preview",
      deployment: connection.providerSpecificData.deployment || "",
      organization: connection.providerSpecificData.organization || "",
    };
  }

  return {
    azureEndpoint: "",
    apiVersion: "2024-10-01-preview",
    deployment: "",
    organization: "",
  };
}

export default function EditConnectionModal({ isOpen, connection, connections = [], onSave, onClose }: any) {
  const [formData, setFormData] = useState(() => buildInitialFormState(connection));
  const [azureData, setAzureData] = useState(() => buildInitialAzureState(connection));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!connection) return undefined;

    const resetTimer = setTimeout(() => {
      setFormData(buildInitialFormState(connection));
      setAzureData(buildInitialAzureState(connection));
      setTestResult(null);
      setValidationResult(null);
    }, 0);

    return () => clearTimeout(resetTimer);
  }, [connection]);

  const isOAuth = connection?.authType === "oauth";
  const routingOrderNumber = Number(formData.routingOrder);
  const hasRoutingOrderValue = formData.routingOrder.trim() !== "" && Number.isInteger(routingOrderNumber) && routingOrderNumber >= 1;
  const routingOrderConflict = formData.routingOrderLocked && hasRoutingOrderValue
    ? connections.find((candidate: any) => (
        candidate?.id !== connection?.id
        && candidate?.provider === connection?.provider
        && candidate?.providerSpecificData?.routingOrderLocked === true
        && Number(candidate?.providerSpecificData?.routingOrder) === routingOrderNumber
      ))
    : null;
  const isAzure = connection?.provider === "azure";
  const isCompatible = connection
    ? (isOpenAICompatibleProvider(connection.provider) || isAnthropicCompatibleProvider(connection.provider))
    : false;

  const handleTest = async () => {
    if (!connection?.provider) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${connection.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult(data.valid ? "success" : "failed");
    } catch {
      setTestResult("failed");
    } finally {
      setTesting(false);
    }
  };

  const handleValidate = async () => {
    if (!connection?.provider) return;
    // If no new key entered, use the test endpoint (which uses stored key)
    if (!formData.apiKey && formData.hasExistingKey) {
      setValidating(true);
      setValidationResult(null);
      try {
        const res = await fetch(`/api/providers/${connection.id}/test`, { method: "POST" });
        const data = await res.json();
        const isValid = !!data.valid;
        setValidationResult(isValid ? "success" : "failed");
        // If valid, immediately update connection status to eligible
        if (isValid) {
          try {
            await fetch(`/api/providers/${connection.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                routingStatus: "eligible",
                healthStatus: "healthy",
                quotaState: "ok",
                authState: "ok",
                reasonCode: null,
                reasonDetail: null,
                nextRetryAt: null,
                resetAt: null,
                lastCheckedAt: new Date().toISOString(),
              }),
            });
          } catch {}
        }
      } catch {
        setValidationResult("failed");
      } finally {
        setValidating(false);
      }
      return;
    }
    // New key entered — validate via /api/providers/validate
    if (!formData.apiKey) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: connection.provider,
          apiKey: formData.apiKey,
          ...(isAzure ? { providerSpecificData: azureData } : {}),
        }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch {
      setValidationResult("failed");
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!connection) return;
    setSaving(true);
    try {
      const updates: any = {
        name: formData.name || (isCompatible && formData.apiKey ? `****${formData.apiKey.slice(-6)}` : undefined),
        priority: formData.priority,
        isActive: formData.isActive,
        routingOrderLocked: formData.routingOrderLocked,
        routingOrder: formData.routingOrderLocked && hasRoutingOrderValue ? routingOrderNumber : null,
      };
      if (!isOAuth && formData.apiKey) {
        updates.apiKey = formData.apiKey;
        let isValid = validationResult === "success";
        if (!isValid) {
          try {
            setValidating(true);
            setValidationResult(null);
            const res = await fetch("/api/providers/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: connection.provider,
                apiKey: formData.apiKey,
                ...(isAzure ? { providerSpecificData: azureData } : {}),
              }),
            });
            const data = await res.json();
            isValid = !!data.valid;
            setValidationResult(isValid ? "success" : "failed");
          } catch {
            setValidationResult("failed");
          } finally {
            setValidating(false);
          }
        }
        if (isValid) {
          updates.routingStatus = "eligible";
          updates.healthStatus = "healthy";
          updates.quotaState = "ok";
          updates.authState = "ok";
          updates.reasonCode = "unknown";
          updates.reasonDetail = null;
          updates.nextRetryAt = null;
          updates.resetAt = null;
          updates.lastCheckedAt = new Date().toISOString();
        }
      }
      if (isAzure) {
        updates.providerSpecificData = {
          ...(connection.providerSpecificData || {}),
          azureEndpoint: azureData.azureEndpoint,
          apiVersion: azureData.apiVersion,
          deployment: azureData.deployment,
          organization: azureData.organization,
        };
      }
      await onSave(updates);
    } finally {
      setSaving(false);
    }
  };

  if (!connection) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("Edit Connection")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel>{translate("Name")}</FieldLabel>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={isOAuth ? translate("Account name") : translate("Production Key")}
          />
        </Field>
        {isOAuth && connection.email && (
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3">
            <p className="mb-1 text-sm text-[var(--color-text-muted)]">{translate("Email")}</p>
            <p className="font-medium text-[var(--color-text-main)]">{connection.email}</p>
          </div>
        )}
        <Field>
          <FieldLabel>{translate("Tie-break priority")}</FieldLabel>
          <Input
            type="number"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 1 })}
          />
          <FieldDescription>{translate("Used only as a tie-breaker when routing order and usage availability do not decide the order.")}</FieldDescription>
        </Field>

        <div className="flex flex-col gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-[var(--color-text-main)]">{translate("Lock routing order")}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{translate("Locked accounts are routed by order number first while they are eligible.")}</p>
            </div>
            <Switch
              checked={formData.routingOrderLocked}
              onToggle={(checked) => setFormData((prev: any) => ({ ...prev, routingOrderLocked: checked === true }))}
              disabled={saving}
            />
          </div>
          {formData.routingOrderLocked && (
            <Field data-invalid={Boolean(routingOrderConflict) || (formData.routingOrder.trim() !== "" && !hasRoutingOrderValue)}>
              <FieldLabel>{translate("Routing order")}</FieldLabel>
              <Input
                type="number"
                min={1}
                value={formData.routingOrder}
                aria-invalid={Boolean(routingOrderConflict) || (formData.routingOrder.trim() !== "" && !hasRoutingOrderValue)}
                onChange={(e) => setFormData({ ...formData, routingOrder: e.target.value })}
              />
              <FieldDescription>
                {formData.routingOrder.trim() !== "" && !hasRoutingOrderValue
                  ? translate("Enter a whole number greater than or equal to 1.")
                  : routingOrderConflict
                    ? translate(`Order #${routingOrderNumber} is already used by ${routingOrderConflict.name || routingOrderConflict.email || routingOrderConflict.id}.`)
                    : translate("Lower numbers route first. This number stays reserved, but the lock is ignored while this account is exhausted, blocked, disabled, or cooling down.")}
              </FieldDescription>
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-3">
          <div>
            <p className="font-medium text-[var(--color-text-main)]">{translate("Enable this account")}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{translate("Turn this off to disable the account for routing until you re-enable it.")}</p>
          </div>
          <Switch
            checked={formData.isActive}
            onToggle={(checked) => setFormData((prev: any) => ({ ...prev, isActive: checked === true }))}
            disabled={saving}
          />
        </div>

        {!isOAuth && (
          <>
            <div className="flex gap-2">
              <Field className="flex-1">
                <FieldLabel>{translate("API Key")}</FieldLabel>
                <Input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={formData.hasExistingKey ? `Current: ${formData.maskedApiKeyHint} — enter new key to replace` : translate("Enter new API key")}
                />
                <FieldDescription>{formData.hasExistingKey ? translate("Leave blank to keep the current API key. Click Check to validate the stored key.") : translate("Leave blank to keep the current API key.")}</FieldDescription>
              </Field>
              <div className="pt-6">
                <Button onClick={handleValidate} disabled={(!formData.apiKey && !formData.hasExistingKey) || validating || saving} variant="secondary">
                  {validating ? <Spinner className="size-4" /> : null}
                  {validating ? translate("Checking...") : translate("Check")}
                </Button>
              </div>
            </div>
            {validationResult && (
              <Badge variant={validationResult === "success" ? "default" : "destructive"}>
                {validationResult === "success" ? translate("Valid") : translate("Invalid")}
              </Badge>
            )}
          </>
        )}

        {isAzure && (
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-main)]">{translate("Azure OpenAI Configuration")}</h3>
            <div className="flex flex-col gap-3">
              <Field>
                <FieldLabel>{translate("Azure Endpoint")}</FieldLabel>
                <Input
                  value={azureData.azureEndpoint}
                  onChange={(e) => setAzureData({ ...azureData, azureEndpoint: e.target.value })}
                  placeholder={translate("https://your-resource.openai.azure.com")}
                />
                <FieldDescription>{translate("Your Azure OpenAI resource endpoint URL")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{translate("Deployment Name")}</FieldLabel>
                <Input
                  value={azureData.deployment}
                  onChange={(e) => setAzureData({ ...azureData, deployment: e.target.value })}
                  placeholder={translate("gpt-4")}
                />
                <FieldDescription>{translate("The deployment name in your Azure resource")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{translate("API Version")}</FieldLabel>
                <Input
                  value={azureData.apiVersion}
                  onChange={(e) => setAzureData({ ...azureData, apiVersion: e.target.value })}
                  placeholder={translate("2024-10-01-preview")}
                />
                <FieldDescription>{translate("Azure OpenAI API version to use")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{translate("Organization")}</FieldLabel>
                <Input
                  value={azureData.organization}
                  onChange={(e) => setAzureData({ ...azureData, organization: e.target.value })}
                  placeholder={translate("Organization ID")}
                />
                <FieldDescription>{translate("Required for billing")}</FieldDescription>
              </Field>
            </div>
          </div>
        )}

        {!isCompatible && !isAzure && (
          <div className="flex items-center gap-3">
            <Button onClick={handleTest} variant="secondary" disabled={testing}>
              {testing ? <Spinner className="size-4" /> : null}
              {testing ? translate("Testing...") : translate("Test Connection")}
            </Button>
            {testResult && (
              <Badge variant={testResult === "success" ? "default" : "destructive"}>
                {testResult === "success" ? translate("Valid") : translate("Failed")}
              </Badge>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSubmit} className="w-full" disabled={saving || Boolean(routingOrderConflict) || (formData.routingOrderLocked && !hasRoutingOrderValue)}>
            {saving ? <Spinner className="size-4" /> : null}
            {saving ? translate("Saving...") : translate("Save")}
          </Button>
          <Button onClick={onClose} variant="ghost" className="w-full">{translate("Cancel")}</Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

EditConnectionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    priority: PropTypes.number,
    isActive: PropTypes.bool,
    authType: PropTypes.string,
    provider: PropTypes.string,
    providerSpecificData: PropTypes.object,
  }),
  connections: PropTypes.array,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
