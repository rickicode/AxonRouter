"use client";

import { CheckCircle2, CircleAlert, LoaderCircle, Copy } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function AntigravityAuthModal({ isOpen, onSuccess, onClose }) {
  const providerInfo = { name: "Antigravity" };
  const provider = "antigravity";
  const [step, setStep] = useState("input"); // input | loading | success | error | verification_required
  const [authData, setAuthData] = useState(null);
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState(null);
  const [validationUrl, setValidationUrl] = useState(null);
  const { copied, copy } = useCopyToClipboard();

  const startOAuthFlow = useCallback(async () => {
    try {
      setError(null);
      setStep("input");

      const redirectUri = "https://antigravity.google/oauth-callback";
      const authorizeUrl = new URL(`/api/oauth/${provider}/authorize`, window.location.origin);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("t", Date.now().toString());
      
      const res = await fetch(authorizeUrl.toString(), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAuthData({ ...data, redirectUri });
    } catch (err) {
      setError(err.message);
      setStep("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (isOpen) {
      const resetTimer = setTimeout(() => {
        if (cancelled) return;
        setAuthData(null);
        setAuthCode("");
        setError(null);
        setValidationUrl(null);
        void startOAuthFlow();
      }, 0);

      return () => {
        cancelled = true;
        clearTimeout(resetTimer);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, startOAuthFlow]);

  const exchangeTokens = useCallback(async (code, state) => {
    if (!authData) return;
    try {
      setStep("loading");
      const res = await fetch(`/api/oauth/${provider}/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          redirectUri: authData.redirectUri,
          state,
          codeVerifier: authData.codeVerifier,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.connection?.validationUrl) {
        setValidationUrl(data.connection.validationUrl);
        setStep("verification_required");
        onSuccess?.(data.connection);
        return;
      }

      setStep("success");
      onSuccess?.(data.connection || null);
    } catch (err) {
      setError(err.message);
      setStep("error");
    }
  }, [authData, provider, onSuccess]);

  useEffect(() => {
    if (!authData) return;

    const handleCallback = async (data) => {
      const { code, state, error: callbackError, errorDescription } = data;
      if (callbackError) {
        setError(errorDescription || callbackError);
        setStep("error");
        return;
      }
      if (code) {
        await exchangeTokens(code, state);
      }
    };

    const handleMessage = (event) => {
      const isLocalhost = event.origin.includes("localhost") || event.origin.includes("127.0.0.1");
      const isSameOrigin = event.origin === window.location.origin;
      if (!isLocalhost && !isSameOrigin) return;
      
      if (event.data?.type === "oauth_callback") {
        handleCallback(event.data.data);
      }
    };
    window.addEventListener("message", handleMessage);

    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("oauth_callback");
      channel.onmessage = (event) => handleCallback(event.data);
    } catch (e) {
      console.log("BroadcastChannel not supported");
    }

    const handleStorage = (event) => {
      if (event.key === "oauth_callback" && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          handleCallback(data);
          localStorage.removeItem("oauth_callback");
        } catch (e) {
          console.log("Failed to parse localStorage data");
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    try {
      const stored = localStorage.getItem("oauth_callback");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.timestamp && Date.now() - data.timestamp < 30000) {
          handleCallback(data);
        }
        localStorage.removeItem("oauth_callback");
      }
    } catch {
      // ignore
    }

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      if (channel) channel.close();
    };
  }, [authData, exchangeTokens]);

  const handleManualSubmit = async () => {
    try {
      setError(null);
      
      const input = authCode.trim();
      if (!input) {
        throw new Error("Please enter an authorization code.");
      }

      let code = input;
      let state = authData?.state;
      
      // If user pasted a full URL instead of just the code
      if (input.startsWith("http")) {
        const url = new URL(input);
        const urlCode = url.searchParams.get("code");
        const urlState = url.searchParams.get("state");
        const urlError = url.searchParams.get("error");
        
        if (urlError) {
           throw new Error(url.searchParams.get("error_description") || urlError);
        }
        if (urlCode) {
           code = urlCode;
           if (urlState) state = urlState;
        }
      }

      await exchangeTokens(code, state);
    } catch (err) {
      setError(err.message);
      setStep("error");
    }
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{`Connect ${providerInfo.name}`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {step === "loading" && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full [background-color:color-mix(in_srgb,var(--color-primary)_12%,transparent)]">
                <LoaderCircle className="h-8 w-8 animate-spin text-[var(--color-primary)]" strokeWidth={2} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-main)]">Connecting to Antigravity</h3>
              <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                Validating your authorization code...
              </p>
            </div>
          )}

          {step === "input" && (
            <>
              <div className="space-y-6">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</div>
                    <h4 className="text-sm font-semibold">Open Authorization URL</h4>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Click the button below to log in with your Google account.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input value={authData?.authUrl || ""} readOnly className="flex-1 font-mono text-xs bg-muted/50" />
                    <Button variant="outline" size="icon" onClick={() => copy(authData?.authUrl, "auth_url")} title="Copy URL">
                      {copied === "auth_url" ? <CheckCircle2 className="size-4 text-green-500" /> : <Copy className="size-4" />}
                    </Button>
                    <Button size="sm" onClick={() => window.open(authData?.authUrl, "_blank")}>
                      Open Link
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</div>
                    <h4 className="text-sm font-semibold">Paste Authorization Code</h4>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    After granting permission, you will be redirected. Please copy the <strong>full URL</strong> from your browser&apos;s address bar or the authorization code, and paste it here.
                  </p>
                  <Input
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="e.g. 4/0A... or https://antigravity.google/oauth-callback?code=..."
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleManualSubmit} className="flex-1" disabled={!authCode.trim()}>
                  Connect
                </Button>
                <Button onClick={handleClose} variant="ghost" className="flex-1">
                  Cancel
                </Button>
              </div>
            </>
          )}

          {step === "success" && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full [background-color:color-mix(in_srgb,var(--color-success,#16a34a)_12%,transparent)]">
                <CheckCircle2 className="h-8 w-8 [color:var(--color-success,#16a34a)]" strokeWidth={2} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-main)]">Connected Successfully!</h3>
              <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                Your {providerInfo.name} account has been connected.
              </p>
              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          )}

          {step === "verification_required" && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full [background-color:color-mix(in_srgb,var(--color-warning,#f59e0b)_12%,transparent)]">
                <CircleAlert className="h-8 w-8 text-[var(--color-warning,#f59e0b)]" strokeWidth={2} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-main)]">Verification Required</h3>
              <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                Your account connected successfully, but it requires verification before you can use Antigravity.
              </p>
              <div className="mb-4 rounded-lg border bg-card p-4 text-left shadow-sm">
                <p className="mb-3 text-sm text-muted-foreground">Please verify your account in your browser to continue:</p>
                <div className="mt-2 flex items-center gap-2">
                  <Input value={validationUrl || ""} readOnly className="flex-1 bg-muted/50 font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copy(validationUrl, "validation_url")} title="Copy URL">
                    {copied === "validation_url" ? <CheckCircle2 className="size-4 text-green-500" /> : <Copy className="size-4" />}
                  </Button>
                  <Button size="sm" onClick={() => window.open(validationUrl, "_blank")}>
                    Verify Account
                  </Button>
                </div>
              </div>
              <Button onClick={handleClose} className="w-full">
                Done (I will verify later)
              </Button>
            </div>
          )}

          {step === "error" && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full [background-color:color-mix(in_srgb,var(--color-danger)_12%,transparent)]">
                <CircleAlert className="h-8 w-8 text-[var(--color-danger)]" strokeWidth={2} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-main)]">Connection Failed</h3>
              <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p>
              <div className="flex gap-2">
                <Button onClick={startOAuthFlow} variant="secondary" className="w-full">
                  Try Again
                </Button>
                <Button onClick={handleClose} variant="ghost" className="w-full">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

AntigravityAuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
