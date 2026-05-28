"use client";

import { CheckCircle2, ExternalLink, Info, LoaderCircle, Terminal, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

const AUTO_POLL_MS = 2500;
const AUTO_POLL_MAX_ATTEMPTS = 24;

export default function FreebuffAuthModal({ isOpen, onSuccess, onClose }) {
  const [detecting, setDetecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [detected, setDetected] = useState(null);
  const [freshDetected, setFreshDetected] = useState(null);
  const [error, setError] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [autoPolling, setAutoPolling] = useState(false);
  const [realTesting, setRealTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [realtestResult, setRealtestResult] = useState(null);
  const [launchAuthUrl, setLaunchAuthUrl] = useState("");
  const [launchOutput, setLaunchOutput] = useState("");
  const pollAttemptRef = useRef(0);
  const pollTimerRef = useRef(null);
  const preLaunchFingerprintRef = useRef("");
  const preLaunchCredentialsMtimeRef = useRef(0);
  const preLaunchInstanceOwnerMtimeRef = useRef(0);

  const clearPollingTimer = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const buildFingerprintSignature = (data) => {
    if (!data || typeof data !== "object") return "";
    return [
      data.authToken || "",
      data.instanceId || "",
      data.fingerprintId || "",
      data.fingerprintHash || "",
      data.accountId || "",
    ].join("|");
  };

  const detectCredentials = async ({ silent = false } = {}) => {
    if (!silent) {
      setDetecting(true);
      setError(null);
    }

    try {
      const res = await fetch("/api/oauth/freebuff/auto-import");
      const data = await res.json();
      if (data.found) {
        setDetected(data);
        return data;
      }

      setDetected(null);
      setFreshDetected(null);
      if (!silent) {
        setError(data.error || "Freebuff credentials were not found.");
      }
      return null;
    } catch {
      setDetected(null);
      if (!silent) {
        setError("Failed to inspect local Freebuff credentials.");
      }
      return null;
    } finally {
      if (!silent) {
        setDetecting(false);
      }
    }
  };

  const activeCredentials = freshDetected || null;
  const detectedAtLabel = useMemo(() => {
    if (typeof detected?.credentialsMtimeMs !== "number") return null;
    return new Date(detected.credentialsMtimeMs).toLocaleString();
  }, [detected?.credentialsMtimeMs]);
  const statusTone = useMemo(() => {
    if (error) return "error";
    if (freshDetected) return "success";
    if (autoPolling || launching || importing || realTesting) return "info";
    if (detected) return "warning";
    return "muted";
  }, [autoPolling, detected, error, freshDetected, importing, launching, realTesting]);

  const getFreshnessSignature = (data) => {
    if (!data || typeof data !== "object") return "";
    return [
      typeof data.credentialsMtimeMs === "number" ? data.credentialsMtimeMs : 0,
      typeof data.instanceOwnerMtimeMs === "number" ? data.instanceOwnerMtimeMs : 0,
    ].join("|");
  };

  const handleUseExistingCredentials = () => {
    setFreshDetected(detected || null);
    setError(null);
    setStatusMessage("Using currently saved Freebuff credentials.");
  };

  const handleImport = async (payload = activeCredentials) => {
    if (!payload?.authToken) {
      setError("No detected Freebuff auth token to import.");
      return false;
    }

    setImporting(true);
    setError(null);
    setStatusMessage("Importing detected Freebuff credentials...");
    try {
      const res = await fetch("/api/oauth/freebuff/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: payload.authToken,
          name: payload.name,
          accountId: payload.accountId,
          fingerprintId: payload.instanceId || payload.fingerprintId,
          fingerprintHash: payload.fingerprintHash,
          instanceId: payload.instanceId,
          authMethod: "import-session",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import Freebuff credentials");
      }
      setStatusMessage("Freebuff credentials imported successfully.");
      onSuccess?.(data.connection || null);
      onClose();
      return true;
    } catch (err) {
      setError(err?.message || "Failed to import Freebuff credentials");
      setStatusMessage("");
      return false;
    } finally {
      setImporting(false);
    }
  };

  const stopAutoPolling = () => {
    clearPollingTimer();
    pollAttemptRef.current = 0;
    setAutoPolling(false);
  };

  const handleRealtest = async () => {
    if (!activeCredentials?.authToken) {
      setError("No selected Freebuff auth token to realtest.");
      return;
    }

    setRealTesting(true);
    setError(null);
    setRealtestResult(null);
    setStatusMessage("Running Freebuff realtest...");
    try {
      const res = await fetch("/api/oauth/freebuff/realtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: activeCredentials.authToken,
          clientId: activeCredentials.instanceId || activeCredentials.fingerprintId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Freebuff realtest failed");
      }
      setRealtestResult(data);
      setStatusMessage("Freebuff realtest completed.");
    } catch (err) {
      setError(err?.message || "Freebuff realtest failed");
      setStatusMessage("");
    } finally {
      setRealTesting(false);
    }
  };

  const pollForFreshCredentials = async () => {
    const data = await detectCredentials({ silent: true });
    pollAttemptRef.current += 1;

    const currentSignature = buildFingerprintSignature(data);
    const currentFreshnessSignature = getFreshnessSignature(data);
    const foundFreshCredentials = Boolean(
      data && (
        (currentSignature && currentSignature !== preLaunchFingerprintRef.current) ||
        (typeof data.credentialsMtimeMs === "number" && data.credentialsMtimeMs > preLaunchCredentialsMtimeRef.current) ||
        (typeof data.instanceOwnerMtimeMs === "number" && data.instanceOwnerMtimeMs > preLaunchInstanceOwnerMtimeRef.current) ||
        currentFreshnessSignature !== `${preLaunchCredentialsMtimeRef.current}|${preLaunchInstanceOwnerMtimeRef.current}`
      )
    );

    if (foundFreshCredentials) {
      setFreshDetected(data);
      setAutoPolling(false);
      setStatusMessage("Detected fresh Freebuff credentials from new login. Importing automatically...");
      await handleImport(data);
      return;
    }

    if (pollAttemptRef.current >= AUTO_POLL_MAX_ATTEMPTS) {
      stopAutoPolling();
      setStatusMessage("");
      setError("Login was launched, but no new Freebuff credentials were detected yet. Finish login in Freebuff, then click Retry Detect.");
      return;
    }

    setStatusMessage(`Waiting for Freebuff login to write credentials... (${pollAttemptRef.current}/${AUTO_POLL_MAX_ATTEMPTS})`);
    pollTimerRef.current = setTimeout(() => {
      void pollForFreshCredentials();
    }, AUTO_POLL_MS);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    setStatusMessage("");
    setRealtestResult(null);
    setFreshDetected(null);
    setLaunchAuthUrl("");
    setLaunchOutput("");
    void detectCredentials();

    return () => {
      stopAutoPolling();
      setStatusMessage("");
    };
  }, [isOpen]);

  const handleLaunchLogin = async () => {
    setLaunching(true);
    setError(null);
    setStatusMessage("");
    preLaunchFingerprintRef.current = buildFingerprintSignature(detected);
    preLaunchCredentialsMtimeRef.current = typeof detected?.credentialsMtimeMs === "number" ? detected.credentialsMtimeMs : 0;
    preLaunchInstanceOwnerMtimeRef.current = typeof detected?.instanceOwnerMtimeMs === "number" ? detected.instanceOwnerMtimeMs : 0;
    stopAutoPolling();

    try {
      const res = await fetch("/api/oauth/freebuff/launch-login", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to launch Freebuff login");
      }

      setLaunchAuthUrl(typeof data.authUrl === "string" ? data.authUrl : "");
      setLaunchOutput(typeof data.capturedOutput === "string" ? data.capturedOutput : "");

      pollAttemptRef.current = 0;
      setAutoPolling(true);
      setStatusMessage(data.authUrl
        ? "Freebuff login launched. Open the auth URL below, then finish login."
        : "Freebuff login launched. Waiting for new credentials...");
      void pollForFreshCredentials();
    } catch (err) {
      setError(err?.message || "Failed to launch Freebuff login");
      setStatusMessage("");
      stopAutoPolling();
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-5 text-primary" strokeWidth={2} />
            Connect Freebuff
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Card className="border-primary/20 bg-[color-mix(in_srgb,var(--color-primary)_7%,var(--color-card))]">
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-text-primary">Local-first auth handoff</p>
                  <p className="text-sm text-text-muted">Launches installed `freebuff`, watches `~/.config/manicode/credentials.json`, then imports newly written credentials into AxonRouter.</p>
                </div>
                <Badge variant="default">
                  <ShieldCheck className="size-3.5" />
                  Runtime sync
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-text-muted">
                <Badge variant="secondary">Fresh login preferred</Badge>
                <Badge variant="secondary">Existing creds optional</Badge>
                <Badge variant="secondary">Realtest ready</Badge>
              </div>
            </CardContent>
          </Card>

          {detecting ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
                <LoaderCircle className="h-8 w-8 animate-spin text-[var(--color-primary)]" strokeWidth={2} />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Checking local Freebuff credentials…</h3>
              <p className="text-sm text-text-muted">Reading `~/.config/manicode/credentials.json`</p>
            </div>
          ) : detected ? (
            <Card className={freshDetected ? "border-green-300 bg-green-50/80 dark:border-green-800 dark:bg-green-900/20" : "border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-900/20"}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className={`mt-0.5 h-5 w-5 ${freshDetected ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`} strokeWidth={2} />
                  <div className="flex-1 space-y-3">
                    <div className={freshDetected ? "text-green-800 dark:text-green-200" : "text-amber-800 dark:text-amber-200"}>
                      <p className="font-medium">{freshDetected ? "Fresh Freebuff credentials ready" : "Existing system credentials detected"}</p>
                      {!freshDetected ? <p className="mt-1 text-sm">Launch a new Freebuff login if you want a fresh account instead of reusing the existing one.</p> : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">Name</p>
                        <p className="mt-1 text-sm font-medium text-text-primary break-all">{detected.name || "Freebuff Account"}</p>
                      </div>
                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">Account</p>
                        <p className="mt-1 text-sm font-medium text-text-primary break-all">{detected.accountId || "-"}</p>
                      </div>
                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">Fingerprint</p>
                        <p className="mt-1 text-sm font-medium text-text-primary break-all">{detected.instanceId || detected.fingerprintId || "-"}</p>
                      </div>
                    </div>
                    {detectedAtLabel ? (
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Clock3 className="size-3.5" />
                        <span>Credentials updated {detectedAtLabel}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex gap-2">
                <Info className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-medium">No saved Freebuff credentials found yet.</p>
                  <p>Launch the real Freebuff login flow and this modal will watch for newly written credentials.</p>
                </div>
              </div>
            </div>
          )}

          {statusMessage ? (
            <div className={`rounded-lg border p-3 text-sm ${statusTone === "success" ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300" : statusTone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300" : statusTone === "error" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300" : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"}`}>
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-4" />
                <span>{statusMessage}</span>
              </div>
            </div>
          ) : null}

          {launchAuthUrl ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">Auth URL</p>
                  <Badge variant="secondary">
                    <ExternalLink className="size-3.5" />
                    Browser step
                  </Badge>
                </div>
                <p className="break-all rounded-md border border-border/70 bg-background/70 p-3 font-mono text-xs text-text-muted">{launchAuthUrl}</p>
                <Button onClick={() => window.open(launchAuthUrl, "_blank", "noopener,noreferrer")} variant="outline" className="w-full" disabled={launching || importing || realTesting}>
                  Open Auth URL
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <Button onClick={handleLaunchLogin} variant="secondary" className="w-full" disabled={launching || importing || autoPolling || realTesting}>
              {launching || autoPolling ? <Spinner className="size-4" /> : <ExternalLink className="size-4" />}
              {launching ? "Launching..." : autoPolling ? "Waiting for Login..." : "Launch Freebuff Login"}
            </Button>
            <Button onClick={() => void detectCredentials()} variant="outline" className="w-full" disabled={detecting || launching || importing || autoPolling || realTesting}>
              Retry Detect
            </Button>
            <Button onClick={handleUseExistingCredentials} variant="outline" className="w-full" disabled={!detected?.authToken || !!freshDetected || detecting || launching || importing || autoPolling || realTesting}>
              Use Existing Saved Credentials
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button onClick={() => void handleImport()} className="w-full" disabled={!activeCredentials?.authToken || importing || launching || autoPolling || realTesting}>
              {importing ? <Spinner className="size-4" /> : null}
              {importing ? "Importing..." : "Import Detected Credentials"}
            </Button>
            <Button onClick={() => void handleRealtest()} variant="outline" className="w-full" disabled={!activeCredentials?.authToken || importing || launching || autoPolling || realTesting}>
              {realTesting ? <Spinner className="size-4" /> : null}
              {realTesting ? "Testing..." : "Realtest"}
            </Button>
            <Button onClick={onClose} variant="ghost" className="w-full" disabled={importing || launching || realTesting}>
              Cancel
            </Button>
          </div>

          {launchOutput ? (
            <Card>
              <CardContent className="p-4 text-xs text-text-muted">
                <p className="mb-2 font-medium text-text-primary">Login Output</p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border/70 bg-background/70 p-3">{launchOutput}</pre>
              </CardContent>
            </Card>
          ) : null}

          {realtestResult ? (
            <Card>
              <CardContent className="p-4 text-xs text-text-muted">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">Realtest Result</p>
                  <Badge variant="secondary">Live probe</Badge>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border/70 bg-background/70 p-3">{JSON.stringify(realtestResult, null, 2)}</pre>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

FreebuffAuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSuccess: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
