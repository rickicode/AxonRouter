"use client";

import { CheckCircle2, FileUp, Info, LoaderCircle, SearchCode, Terminal } from "lucide-react";
import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

/**
 * Freebuff Auth Modal — simplified Connect Freebuff flow.
 *
 * Two methods:
 *   1. Import detected — auto-detects credentials from
 *      ~/.config/manicode/credentials.json and imports immediately.
 *   2. Paste JSON — user pastes the full credentials.json structure
 *      ({"default": { id, name, email, authToken, fingerprintId, ... }}).
 */
export default function FreebuffAuthModal({ isOpen, onSuccess, onClose }) {
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [detected, setDetected] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [jsonInput, setJsonInput] = useState("");

  // Auto-detect when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const autoDetect = async () => {
      setDetecting(true);
      setError(null);
      try {
        const res = await fetch("/api/oauth/freebuff/auto-import");
        const data = await res.json();
        if (data.found) {
          setDetected(data);
        } else {
          setDetected(null);
        }
      } catch {
        setDetected(null);
      } finally {
        setDetecting(false);
      }
    };

    const timer = setTimeout(autoDetect, 0);
    return () => {
      clearTimeout(timer);
      setSelectedMethod(null);
      setError(null);
      setJsonInput("");
    };
  }, [isOpen]);

  const handleMethodSelect = (method) => {
    setSelectedMethod(method);
    setError(null);

    // If method is "import" and credentials already detected, import immediately
    if (method === "import" && detected?.authToken) {
      handleImportDetected(detected);
    }
  };

  const handleBack = () => {
    setSelectedMethod(null);
    setError(null);
  };

  const handleImportDetected = async (payload = detected) => {
    if (!payload?.authToken) {
      setError("No detected Freebuff credentials to import.");
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/freebuff/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: payload.authToken,
          name: payload.name,
          email: payload.email,
          accountId: payload.accountId,
          fingerprintId: payload.fingerprintId,
          fingerprintHash: payload.fingerprintHash,
          instanceId: payload.instanceId,
          authMethod: "import-session",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      onSuccess?.(data.connection || null);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleJsonImport = async () => {
    if (!jsonInput.trim()) {
      setError("Please paste your credentials.json content.");
      return;
    }

    setImporting(true);
    setError(null);
    try {
      let parsed;
      try {
        parsed = JSON.parse(jsonInput.trim());
      } catch {
        throw new Error("Invalid JSON format. Paste the full content of ~/.config/manicode/credentials.json");
      }

      const account = parsed?.default;
      if (!account?.authToken) {
        throw new Error("Missing default.authToken in credentials JSON.");
      }

      const res = await fetch("/api/oauth/freebuff/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: account.authToken,
          name: account.name,
          email: account.email,
          accountId: account.email || account.id,
          fingerprintId: account.fingerprintId,
          fingerprintHash: account.fingerprintHash,
          authMethod: "manual-json",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      onSuccess?.(data.connection || null);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-5 text-primary" strokeWidth={2} />
            Connect Freebuff
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">

          {/* ── Method Selection ── */}
          {!selectedMethod && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted mb-4">
                Choose how to add your Freebuff credentials:
              </p>

              {/* Option 1: Import Detected */}
              <button
                onClick={() => handleMethodSelect("import")}
                className="w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
                disabled={detecting}
              >
                <div className="flex items-start gap-3">
                  <SearchCode className="mt-0.5 h-5 w-5 text-primary" strokeWidth={2} />
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">
                      {detected?.authToken ? "Import Detected Credentials" : "Detect & Import"}
                    </h3>
                    <p className="text-sm text-text-muted">
                      {detected?.authToken
                        ? `Auto-detected from ~/.config/manicode/credentials.json (${detected.name || detected.email || "account found"})`
                        : detecting
                          ? "Scanning ~/.config/manicode/credentials.json..."
                          : "Read credentials from the installed Freebuff CLI config."}
                    </p>
                    {detected?.email && (
                      <p className="text-xs text-[var(--color-primary)] mt-1">
                        {detected.email}
                      </p>
                    )}
                  </div>
                  {detecting ? (
                    <LoaderCircle className="h-5 w-5 animate-spin text-text-muted" strokeWidth={2} />
                  ) : detected?.authToken ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" strokeWidth={2} />
                  ) : null}
                </div>
              </button>

              {/* Option 2: Paste JSON */}
              <button
                onClick={() => handleMethodSelect("json")}
                className="w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
              >
                <div className="flex items-start gap-3">
                  <FileUp className="mt-0.5 h-5 w-5 text-primary" strokeWidth={2} />
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Paste Credentials JSON</h3>
                    <p className="text-sm text-text-muted">
                      Paste the full content of <code className="rounded bg-muted px-1">~/.config/manicode/credentials.json</code>
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ── JSON Import Form ── */}
          {selectedMethod === "json" && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex gap-2">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Open <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">~/.config/manicode/credentials.json</code>{" "}
                    and copy the entire file content.
                  </p>
                </div>
              </div>

              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"default": {"id": "...", "name": "...", "email": "...", "authToken": "...", ...}}'
                className="w-full min-h-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-text-muted focus:border-primary focus:outline-none resize-y"
              />

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleJsonImport} className="w-full" disabled={importing || !jsonInput.trim()}>
                  {importing ? <Spinner className="size-4" /> : null}
                  {importing ? "Importing..." : "Import Credentials"}
                </Button>
                <Button onClick={handleBack} variant="ghost" className="w-full">
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* ── Import progress / result ── */}
          {selectedMethod === "import" && (
            <div className="space-y-4">
              {detecting ? (
                <div className="text-center py-6">
                  <div className="size-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" strokeWidth={2} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Detecting Freebuff credentials...</h3>
                  <p className="text-sm text-text-muted">Scanning ~/.config/manicode/credentials.json</p>
                </div>
              ) : detected?.authToken ? (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" strokeWidth={2} />
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                          Credentials detected
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                          {detected.name || detected.email || "Freebuff Account"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={() => handleImportDetected()} className="w-full" disabled={importing}>
                      {importing ? <Spinner className="size-4" /> : null}
                      {importing ? "Importing..." : "Import Credentials"}
                    </Button>
                    <Button onClick={handleBack} variant="ghost" className="w-full">
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex gap-2">
                      <Info className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        No Freebuff credentials found at ~/.config/manicode/credentials.json.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => handleMethodSelect("json")} className="w-full">
                      <FileUp className="size-4" />
                      Paste Credentials JSON Instead
                    </Button>
                    <Button onClick={handleBack} variant="ghost" className="w-full">
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

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
