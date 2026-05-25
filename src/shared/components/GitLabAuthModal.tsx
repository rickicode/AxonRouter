"use client";

import { KeyRound, LockKeyholeOpen } from "lucide-react";
import { useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import OAuthModal from "./OAuthModal";
import { translate } from "@/i18n/runtime";

const GITLAB_COM = "https://gitlab.com";

function getRedirectUri() {
  if (typeof window === "undefined") return "http://localhost/callback";
  const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  return `http://localhost:${port}/callback`;
}

function LabeledInput({ label, ...props }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input {...props} />
    </Field>
  );
}

/**
 * GitLab Duo Authentication Modal
 * Supports two modes:
 * - OAuth (PKCE): requires OAuth App Client ID (and optional Client Secret)
 * - PAT: requires Personal Access Token
 */
export default function GitLabAuthModal({ isOpen, providerInfo, onSuccess, onClose }) {
  const [mode, setMode] = useState(null); // null | "oauth" | "pat"
  const [baseUrl, setBaseUrl] = useState(GITLAB_COM);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOAuth, setShowOAuth] = useState(false);
  const [oauthMeta, setOauthMeta] = useState(null);

  const reset = () => {
    setMode(null);
    setBaseUrl(GITLAB_COM);
    setClientId("");
    setClientSecret("");
    setPat("");
    setError(null);
    setLoading(false);
    setShowOAuth(false);
    setOauthMeta(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleOAuthStart = () => {
    if (!clientId.trim()) {
      setError("Client ID is required");
      return;
    }
    setError(null);
    setOauthMeta({ baseUrl: baseUrl.trim() || GITLAB_COM, clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    setShowOAuth(true);
  };

  const handlePATSubmit = async () => {
    if (!pat.trim()) {
      setError("Personal Access Token is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/gitlab/pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pat.trim(), baseUrl: baseUrl.trim() || GITLAB_COM }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Sub-modal for OAuth PKCE flow
  if (showOAuth && oauthMeta) {
    return (
      <OAuthModal
        isOpen
        provider="gitlab"
        providerInfo={providerInfo}
        oauthMeta={oauthMeta}
        idcConfig={null}
        onSuccess={() => { onSuccess?.(); handleClose(); }}
        onClose={() => { setShowOAuth(false); setOauthMeta(null); }}
      />
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translate("Connect GitLab Duo")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
        {/* Mode selection */}
        {!mode && (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">
              {translate("Choose how to authenticate with GitLab Duo:")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("oauth")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-primary/5 transition-colors text-left"
              >
                <LockKeyholeOpen className="h-8 w-8 text-[var(--color-primary)]" strokeWidth={2} />
                <div>
                  <p className="text-sm font-medium">{translate("OAuth App")}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{translate("Use a GitLab OAuth application")}</p>
                </div>
              </button>
              <button
                onClick={() => setMode("pat")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-primary/5 transition-colors text-left"
              >
                <KeyRound className="h-8 w-8 text-[var(--color-primary)]" strokeWidth={2} />
                <div>
                  <p className="text-sm font-medium">{translate("Personal Access Token")}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{translate("Use a GitLab PAT with api scope")}</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* OAuth mode */}
        {mode === "oauth" && (
          <>
            <p className="text-xs text-[var(--color-text-muted)]">
              {translate("Create an OAuth app at")} {" "}
              <a href={`${baseUrl.trim() || GITLAB_COM}/-/profile/applications`} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] underline">{translate("GitLab Applications")}</a>{" "}
              {translate("with redirect URI")} {" "}
              <code className="bg-[var(--color-sidebar)] px-1 rounded text-xs">{getRedirectUri()}</code>
            </p>
            <LabeledInput label={translate("GitLab Base URL")} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={GITLAB_COM} />
            <LabeledInput label={translate("Client ID")} value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={translate("Your OAuth application client ID")} />
            <LabeledInput label={translate("Client Secret (optional for PKCE)")} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={translate("Leave empty for public PKCE app")} />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleOAuthStart} className="w-full" disabled={!clientId.trim()}>{translate("Authorize")}</Button>
              <Button onClick={() => { setMode(null); setError(null); }} variant="ghost" className="w-full">{translate("Back")}</Button>
            </div>
          </>
        )}

        {/* PAT mode */}
        {mode === "pat" && (
          <>
            <p className="text-xs text-[var(--color-text-muted)]">
              {translate("Create a PAT at")} {" "}
              <a href={`${baseUrl.trim() || GITLAB_COM}/-/user_settings/personal_access_tokens`} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] underline">{translate("GitLab Access Tokens")}</a>{" "}
              {translate("with scopes:")} <code className="bg-[var(--color-sidebar)] px-1 rounded text-xs">api</code>,{" "}
              <code className="bg-[var(--color-sidebar)] px-1 rounded text-xs">read_user</code>, {translate("and")} {" "}
              <code className="bg-[var(--color-sidebar)] px-1 rounded text-xs">ai_features</code>.
            </p>
            <LabeledInput label={translate("GitLab Base URL")} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={GITLAB_COM} />
            <LabeledInput label={translate("Personal Access Token")} value={pat} onChange={(e) => setPat(e.target.value)} placeholder="glpat-xxxxxxxxxxxxxxxxxxxx" type="password" />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handlePATSubmit} className="w-full" disabled={!pat.trim() || loading}>
                {loading ? <Spinner className="size-4" /> : null}
                {translate("Connect")}
              </Button>
              <Button onClick={() => { setMode(null); setError(null); }} variant="ghost" className="w-full">{translate("Back")}</Button>
            </div>
          </>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

GitLabAuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  providerInfo: PropTypes.shape({ name: PropTypes.string }),
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
