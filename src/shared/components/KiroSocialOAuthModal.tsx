"use client";

import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { translate } from "@/i18n/runtime";

/**
 * Kiro Social OAuth Modal (Google/GitHub)
 * Handles manual callback URL flow for social login
 */
export default function KiroSocialOAuthModal({ isOpen, provider, onSuccess, onClose, providerId = "kiro" }) {
  const [step, setStep] = useState("loading");
  const [authUrl, setAuthUrl] = useState("");
  const [authData, setAuthData] = useState(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [error, setError] = useState(null);
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    if (!isOpen || !provider) return;

    const initAuth = async () => {
      try {
        setError(null);
        setStep("loading");

        const authUrl = new URL("/api/oauth/kiro/social-authorize", window.location.origin);
        authUrl.searchParams.set("provider", provider);
        if (providerId === "amazon-q") authUrl.searchParams.set("targetProvider", "amazon-q");
        const res = await fetch(authUrl.toString());
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setAuthData(data);
        setAuthUrl(data.authUrl);
        setStep("input");
        window.open(data.authUrl, "_blank");
      } catch (err) {
        setError(err.message);
        setStep("error");
      }
    };

    initAuth();
  }, [isOpen, provider, providerId]);

  const handleManualSubmit = async () => {
    try {
      setError(null);
      if (!authData?.codeVerifier || !authData?.state) {
        throw new Error(translate("Authorization session expired. Please restart the connection flow."));
      }

      let url;
      try {
        url = new URL(callbackUrl);
      } catch {
        throw new Error(translate("Invalid callback URL format"));
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) throw new Error(url.searchParams.get("error_description") || errorParam);
      if (!code) throw new Error(translate("No authorization code found in URL"));
      if (!returnedState) throw new Error(translate("Missing OAuth state in callback URL"));
      if (returnedState !== authData.state) {
        throw new Error(translate("OAuth state mismatch. Please restart the connection flow."));
      }

      const exchangeUrl = new URL("/api/oauth/kiro/social-exchange", window.location.origin);
      if (providerId === "amazon-q") exchangeUrl.searchParams.set("targetProvider", "amazon-q");
      const res = await fetch(exchangeUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, codeVerifier: authData.codeVerifier, provider, state: returnedState }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("success");
      onSuccess?.(data.connection || null);
    } catch (err) {
      setError(err.message);
      setStep("error");
    }
  };

  const socialProviderName = provider === "google" ? "Google" : "GitHub";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translate(`Connect ${socialProviderName} via ${socialProviderName}`)}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
        {step === "loading" && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full [background-color:color-mix(in_srgb,var(--color-primary)_12%,transparent)]">
              <LoaderCircle className="h-8 w-8 animate-spin text-[var(--color-primary)]" strokeWidth={2} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-main)]">{translate("Initializing...")}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{translate(`Setting up ${socialProviderName} authentication`)}</p>
          </div>
        )}

        {step === "input" && (
          <>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--color-text-main)]">{translate("Step 1: Open this URL in your browser")}</p>
                <div className="flex gap-2">
                  <Input value={authUrl} readOnly className="flex-1 font-mono text-xs" />
                  <Button variant="secondary" onClick={() => copy(authUrl, "auth_url")}>{copied === "auth_url" ? <CheckCircle2 className="size-4" /> : null}{translate("Copy")}</Button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-[var(--color-text-main)]">{translate("Step 2: Paste the callback URL here")}</p>
                <p className="mb-2 text-xs text-[var(--color-text-muted)]">{translate("After authorization, copy the full URL from your browser address bar.")}</p>
                <Input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder={translate("kiro://kiro.kiroAgent/authenticate-success?code=...")} className="font-mono text-xs" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleManualSubmit} className="w-full" disabled={!callbackUrl}>{translate("Connect")}</Button>
              <Button onClick={onClose} variant="ghost" className="w-full">{translate("Cancel")}</Button>
            </div>
          </>
        )}

        {step === "success" && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full [background-color:color-mix(in_srgb,var(--color-success,#16a34a)_12%,transparent)]">
              <CheckCircle2 className="h-8 w-8 [color:var(--color-success,#16a34a)]" strokeWidth={2} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-main)]">{translate("Connected Successfully!")}</h3>
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">{translate(`Your ${socialProviderName} account via ${socialProviderName} has been connected.`)}</p>
            <Button onClick={onClose} className="w-full">{translate("Done")}</Button>
          </div>
        )}

        {step === "error" && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full [background-color:color-mix(in_srgb,var(--color-danger)_12%,transparent)]">
              <CircleAlert className="h-8 w-8 text-[var(--color-danger)]" strokeWidth={2} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-main)]">{translate("Connection Failed")}</h3>
            <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p>
            <div className="flex gap-2">
              <Button onClick={() => setStep("input")} variant="secondary" className="w-full">{translate("Try Again")}</Button>
              <Button onClick={onClose} variant="ghost" className="w-full">{translate("Cancel")}</Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

KiroSocialOAuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  provider: PropTypes.oneOf(["google", "github"]).isRequired,
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  providerId: PropTypes.string,
};
