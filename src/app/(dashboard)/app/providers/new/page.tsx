"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ArrowLeft, LinkIcon } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AI_PROVIDERS, AUTH_METHODS } from "@/shared/constants/config";
import { useMutation } from "@tanstack/react-query";
import { useInvalidate } from "@/shared/query";
import { translate } from "@/i18n/runtime";

const providerOptions = Object.values(AI_PROVIDERS).map((p) => ({
  value: p.id,
  label: p.name,
}));

const authMethodOptions = Object.values(AUTH_METHODS).map((m) => ({
  value: m.id,
  label: m.name,
}));

export default function NewProviderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inv = useInvalidate();
  const [formData, setFormData] = useState<any>({
    provider: "",
    authMethod: "api_key",
    apiKey: "",
    displayName: "",
    isActive: true,
  });
  const [errors, setErrors] = useState<any>({});

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors: any = {};
    if (!formData.provider) newErrors.provider = translate("Please select a provider");
    if (formData.authMethod === "api_key" && !formData.apiKey) {
      newErrors.apiKey = translate("API Key is required");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const createProviderMutation = useMutation({
    retry: false,
    mutationFn: async (data: any) => {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || translate("Failed to create provider"));
      }
      return response.json();
    },
    onSuccess: () => {
      inv.allProviders();
      router.push("/app/providers");
    },
    onError: (err: Error) => {
      setErrors({ submit: err.message });
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    createProviderMutation.mutate(formData, { onSettled: () => setLoading(false) });
  };

  const selectedProvider = AI_PROVIDERS[formData.provider];

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 px-0 text-muted-foreground hover:bg-transparent hover:text-primary">
          <Link href="/app/providers">
            <ArrowLeft data-icon className="size-4" strokeWidth={2} />
            {translate("Back to Providers")}
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">{translate("Add New Provider")}</h1>
        <p className="mt-2 text-muted-foreground">
          {translate("Configure a new AI provider to use with your applications.")}
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Provider Selection */}
            <Field data-invalid={!!errors.provider}>
              <FieldLabel htmlFor="provider">
                {translate("Provider")} <span className="text-destructive">*</span>
              </FieldLabel>
              <Select value={formData.provider} onValueChange={(value) => handleChange("provider", value)}>
                <SelectTrigger id="provider" aria-invalid={!!errors.provider} className="h-8 w-full">
                  <SelectValue placeholder={translate("Select a provider")} />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>{provider.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{errors.provider}</FieldError>
            </Field>

            {/* Provider Info */}
            {selectedProvider && (
              <div className="flex items-center gap-3 rounded-[4px] border border-border bg-card/60 p-4">
                <div className="flex size-10 items-center justify-center rounded-[4px] border border-border bg-background">
                  <AppIcon
                    name={selectedProvider.icon}
                    size={20}
                    style={{ color: selectedProvider.color }}
                  />
                </div>
                <div>
                  <p className="font-medium">{selectedProvider.name}</p>
                  <p className="text-sm text-muted-foreground">{translate("Selected provider")}</p>
                </div>
              </div>
            )}

            {/* Auth Method */}
            <Field>
              <FieldLabel>
                {translate("Authentication Method")} <span className="text-destructive">*</span>
              </FieldLabel>
              <div className="flex gap-3">
                {authMethodOptions.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => handleChange("authMethod", method.value)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-[4px] border p-4 transition-all ${
                      formData.authMethod === method.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <AppIcon name={method.value === "api_key" ? "key" : "lock"} size={20} />
                    <span className="font-medium">{method.label}</span>
                  </button>
                ))}
              </div>
            </Field>

            {/* API Key Input */}
            {formData.authMethod === "api_key" && (
              <Field data-invalid={!!errors.apiKey}>
                <FieldLabel htmlFor="apiKey">
                  {translate("API Key")} <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={translate("Enter your API key")}
                  value={formData.apiKey}
                  onChange={(e) => handleChange("apiKey", e.target.value)}
                  aria-invalid={!!errors.apiKey}
                  required
                />
                <FieldDescription>{translate("Your API key will be encrypted and stored securely.")}</FieldDescription>
                <FieldError>{errors.apiKey}</FieldError>
              </Field>
            )}

            {/* OAuth2 Button */}
            {formData.authMethod === "oauth2" && (
              <div className="rounded-[4px] border border-border bg-card/60 p-4">
                <p className="mb-4 text-sm text-muted-foreground">{translate("Connect your account using OAuth2 authentication.")}</p>
                <Button type="button" variant="secondary">
                  <LinkIcon data-icon className="size-4" />
                  {translate("Connect with OAuth2")}
                </Button>
              </div>
            )}

            {/* Display Name */}
            <Field>
              <FieldLabel htmlFor="displayName">{translate("Display Name")}</FieldLabel>
              <Input
                id="displayName"
                placeholder={translate("My Provider")}
                value={formData.displayName}
                onChange={(e) => handleChange("displayName", e.target.value)}
              />
            </Field>

            {/* Active Toggle */}
            <Field orientation="horizontal">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onToggle={(checked) => handleChange("isActive", checked)}
              />
              <FieldGroup className="gap-1">
                <FieldLabel htmlFor="isActive">Active</FieldLabel>
                <FieldDescription>Enable this provider for use in your applications</FieldDescription>
              </FieldGroup>
            </Field>

            {/* Error Message */}
            {errors.submit && (
              <Alert variant="destructive" className="border-0 rounded-[4px] text-[var(--color-danger)] !bg-[var(--color-danger)]/15">
                <AlertDescription>{errors.submit}</AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex gap-3 border-t border-border pt-4">
              <Button asChild type="button" variant="ghost" className="flex-1">
                <Link href="/app/providers">Cancel</Link>
              </Button>
              <Button type="submit" variant="secondary" disabled={loading} className="flex-1">
                {loading ? <Spinner className="size-4" /> : null}
                {translate("Create Provider")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
