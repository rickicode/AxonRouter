"use client";

import {
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  FileUp,
  Info,
  LoaderCircle,
  RefreshCw,
  SearchCode,
  Terminal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type ExistingConnection = {
  id: string;
  email?: string | null;
  name?: string;
  fingerprint?: string | null;
};

type DetectedCreds = {
  authToken?: string;
  name?: string;
  email?: string;
  accountId?: string;
  fingerprintId?: string;
  fingerprintHash?: string;
  instanceId?: string;
};

/**
 * Freebuff Auth Modal — Connect + Reset Credentials flow.
 *
 * Three entry points:
 *   1. **Detect & Import** — auto-detect from ~/.config/manicode/credentials.json
 *      and create a NEW connection (dedup by email).
 *   2. **Paste Credentials JSON** — paste the full credentials.json content.
 *   3. **Reset Credentials** — detect new credentials after `freebuff login`,
 *      compare email with existing connection, replace in-place if different.
 */
export default function FreebuffAuthModal({ isOpen, onSuccess, onClose, replaceConnectionId: initialReplaceId = undefined }) {
  /* ── State ─────────────────────────────────────────────────────────── */
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedCreds | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [existing, setExisting] = useState<ExistingConnection[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  /** Fetch existing Freebuff connections for dedup UI */
  const fetchExisting = useCallback(async () => {
    setLoadingExisting(true);
    try {
      const res = await fetch("/api/providers?provider=freebuff");
      const data = await res.json();
      const list: ExistingConnection[] = (data?.connections || []).map(
        (c: any) => ({
          id: c.id,
          email: c.email || null,
          name: c.name || c.displayName || "Freebuff Account",
          fingerprint: c.providerSpecificData?.fingerprint || null,
        }),
      );
      setExisting(list);
    } catch {
      setExisting([]);
    } finally {
      setLoadingExisting(false);
    }
  }, []);

  const runDetection = useCallback(async () => {
    setDetecting(true);
    setError(null);
    try {
      const res = await fetch(`/api/oauth/freebuff/auto-import?t=${Date.now()}`, {
        cache: "no-store",
      });
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
  }, []);

  // Track whether initial detection has run for this modal open
  const hasInitialDetectionRef = useRef(false);

  // Run initial detection + fetch existing when modal opens
  // (called from Dialog's onOpenChange, not from useEffect, to satisfy lint rule)
  const handleModalOpen = useCallback(() => {
    if (!hasInitialDetectionRef.current) {
      hasInitialDetectionRef.current = true;
      fetchExisting();
      runDetection();
    }
  }, [fetchExisting, runDetection]);

  // Reset ref when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasInitialDetectionRef.current = false;
    }
  }, [isOpen]);

  /** Check if detected email collides with an existing connection */
  const collisionCheck = useCallback(
    (email?: string | null, skipId?: string | null) => {
      if (!email) return null;
      return existing.find((c) => c.email === email && c.id !== skipId) || null;
    },
    [existing],
  );

  const handleMethodSelect = (method: string) => {
    setSelectedMethod(method);
    setError(null);
  };

  const handleImportMethodSelect = () => {
    setSelectedMethod("import");
    setError(null);
    runDetection();
  };

  const handleBack = () => {
    setSelectedMethod(null);
    setError(null);
  };

  /* ── Import helpers ────────────────────────────────────────────────── */
  const buildImportBody = (
    payload: DetectedCreds,
    replaceId?: string | null,
  ) => {
    const body: Record<string, unknown> = {
      authToken: payload.authToken,
      name: payload.name,
      email: payload.email,
      accountId: payload.accountId,
      fingerprintId: payload.fingerprintId,
      fingerprintHash: payload.fingerprintHash,
      instanceId: payload.instanceId,
      authMethod: "import-session",
    };
    if (replaceId) body.replaceConnectionId = replaceId;
    return body;
  };

  const doImport = useCallback(
    async (body: Record<string, unknown>) => {
      setImporting(true);
      setError(null);
      const res = await fetch("/api/oauth/freebuff/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      return data;
    },
    [],
  );

  const handleImportDetected = async (replaceId?: string | null) => {
    if (!detected?.authToken) {
      setError("No detected Freebuff credentials to import.");
      return;
    }

    // Pre-import dedup check
    const dup = collisionCheck(detected.email, replaceId);
    if (dup) {
      setError(
        `Akun "${detected.email}" sudah terhubung (${dup.name}). Gunakan Reset Credentials untuk mengganti.`,
      );
      return;
    }

    try {
      const body = buildImportBody(detected, replaceId);
      const data = await doImport(body);
      onSuccess?.(data.connection || null);
      onClose();
    } catch (err: any) {
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
      let parsed: any;
      try {
        parsed = JSON.parse(jsonInput.trim());
      } catch {
        throw new Error("Invalid JSON format. Paste the full content of ~/.config/manicode/credentials.json");
      }

      const account = parsed?.default;
      if (!account?.authToken) throw new Error("Missing default.authToken in credentials JSON.");

      const dup = collisionCheck(parsed?.default?.email);
      if (dup) {
        throw new Error(`Email "${parsed.default.email}" sudah terhubung. Gunakan Reset Credentials untuk mengganti.`);
      }

      const body: Record<string, unknown> = {
        authToken: account.authToken,
        name: account.name,
        email: account.email,
        accountId: account.id || account.email,
        fingerprintId: account.fingerprintId,
        fingerprintHash: account.fingerprintHash,
        authMethod: "manual-json",
      };
      const data = await doImport(body);
      onSuccess?.(data.connection || null);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  /* ── Reset helpers ─────────────────────────────────────────────────── */
  const handleResetDetect = () => {
    setSelectedMethod("reset");
    setError(null);
    runDetection();
  };

  const resetTarget = (() => {
    const list = existing || [];
    if (list.length === 1) return list[0];
    // If initialReplaceId was passed, find that connection
    if (initialReplaceId) return list.find((c) => c.id === initialReplaceId) || list[0];
    return list[0];
  })();

  /* ── Render helpers ────────────────────────────────────────────────── */
  const hasExisting = existing.length > 0;
  const detectedEmail = detected?.email || null;
  const detectedFingerprint = detected?.fingerprintId || detected?.instanceId || null;
  const detectedMatchesResetTarget =
    selectedMethod === "reset" &&
    resetTarget &&
    detectedEmail === resetTarget.email;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
      if (open) handleModalOpen();
    }}>
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

              {/* Option 1: Detect & Import */}
              <button
                onClick={handleImportMethodSelect}
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
                      Paste the full content of{" "}
                      <code className="rounded bg-muted px-1">~/.config/manicode/credentials.json</code>
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 3: Reset Credentials (only when have existing) */}
              {hasExisting && (
                <button
                  onClick={handleResetDetect}
                  className="w-full p-4 text-left border border-border rounded-lg hover:bg-sidebar transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <RefreshCw className="mt-0.5 h-5 w-5 text-amber-500" strokeWidth={2} />
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">Reset Credentials</h3>
                      <p className="text-sm text-text-muted">
                        Ganti koneksi Freebuff dengan akun berbeda. Jalankan{" "}
                        <code className="rounded bg-muted px-1">freebuff login</code>{" "}
                        dulu, lalu klik di sini untuk detect & replace.
                      </p>
                    </div>
                  </div>
                </button>
              )}
            </div>
          )}

          {/* ── JSON Import Form ── */}
          {selectedMethod === "json" && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex gap-2">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Open{" "}
                    <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">~/.config/manicode/credentials.json</code>{" "}
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
                  {importing ? <Spinner className="size-4" /> : "Import Credentials"}
                </Button>
                <Button onClick={handleBack} variant="ghost" className="w-full">Back</Button>
              </div>
            </div>
          )}

          {/* ── Detect & Import ── */}
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
                        <div className="mt-2 flex flex-col gap-1 text-xs text-green-700 dark:text-green-300">
                          {detected.email && (
                            <p className="truncate">
                              <span className="font-medium">Email:</span> {detected.email}
                            </p>
                          )}
                          {detected.accountId && detected.accountId !== detected.email && (
                            <p className="truncate">
                              <span className="font-medium">Account:</span> {detected.accountId}
                            </p>
                          )}
                          {detectedFingerprint && (
                            <p className="truncate font-mono">
                              <span className="font-sans font-medium">Fingerprint:</span> {detectedFingerprint}
                            </p>
                          )}
                          {detected.instanceId && detected.instanceId !== detectedFingerprint && (
                            <p className="truncate font-mono">
                              <span className="font-sans font-medium">Instance:</span> {detected.instanceId}
                            </p>
                          )}
                          {detected.fingerprintHash && (
                            <p className="truncate font-mono">
                              <span className="font-sans font-medium">Hash:</span> {detected.fingerprintHash}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleImportDetected()}
                      className="w-full"
                      disabled={importing}
                    >
                      {importing ? <Spinner className="size-4" /> : "Import Credentials"}
                    </Button>
                    <Button onClick={handleBack} variant="ghost" className="w-full">Back</Button>
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
                    <Button onClick={handleBack} variant="ghost" className="w-full">Back</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Reset Credentials ── */}
          {selectedMethod === "reset" && (
            <div className="space-y-4">
              {/* Instructions */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex gap-2 mb-3">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" strokeWidth={2} />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium mb-1">Reset Credentials</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Jalankan <code className="rounded bg-blue-100 dark:bg-blue-800 px-1">freebuff login</code> di terminal dengan akun berbeda</li>
                      <li>Tunggu sampai login selesai</li>
                      <li>Klik tombol Detect di bawah</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Existing connection being replaced */}
              {resetTarget && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <DownloadCloud className="h-5 w-5 text-text-muted shrink-0" strokeWidth={2} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-muted">Koneksi saat ini</p>
                    <p className="text-sm font-medium truncate">{resetTarget.name}</p>
                    {resetTarget.email && (
                      <p className="text-xs text-text-muted">{resetTarget.email}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Detection state */}
              {detecting ? (
                <div className="text-center py-6">
                  <div className="size-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" strokeWidth={2} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Detecting new credentials...</h3>
                  <p className="text-sm text-text-muted">Scanning ~/.config/manicode/credentials.json</p>
                </div>
              ) : detected?.authToken ? (
                <>
                  {/* Same email warning */}
                  {detectedMatchesResetTarget ? (
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="flex gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" strokeWidth={2} />
                        <div className="text-sm text-amber-800 dark:text-amber-200">
                          <p className="font-medium">Akun yang sama terdeteksi</p>
                          <p className="mt-1">
                            Email <strong>{detected.email}</strong> sudah terhubung.
                            Jalankan <code className="rounded bg-amber-100 dark:bg-amber-700 px-1">freebuff login</code> dengan akun berbeda, lalu klik Detect lagi.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Different email — confirm replace */
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800 space-y-3">
                      <div className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" strokeWidth={2} />
                        <div className="text-sm text-green-800 dark:text-green-200">
                          <p className="font-medium">Akun baru terdeteksi</p>
                        </div>
                      </div>

                      {/* Before → After */}
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex-1 p-2 rounded bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800">
                          <span className="text-text-muted">Lama: </span>
                          <span className="line-through">{resetTarget?.email || resetTarget?.name}</span>
                        </div>
                        <span className="text-text-muted">→</span>
                        <div className="flex-1 p-2 rounded bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800">
                          <span className="text-text-muted">Baru: </span>
                          <span className="font-medium">{detected.email || detected.name}</span>
                        </div>
                      </div>

                      {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                        </div>
                      )}

                      <Button
                        onClick={() => handleImportDetected(resetTarget?.id || null)}
                        className="w-full"
                        disabled={importing}
                        variant="default"
                      >
                        {importing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                        {importing ? "Mengganti..." : `Ganti ${resetTarget?.name || "koneksi"} → ${detected.email || detected.name || "akun baru"}`}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" strokeWidth={2} />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Belum ada credentials terdeteksi
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          Pastikan kamu sudah menjalankan <code className="rounded bg-amber-100 dark:bg-amber-700 px-1">freebuff login</code> di terminal.
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
                    <Button onClick={handleResetDetect} className="w-full" disabled={detecting}>
                      {detecting ? <Spinner className="size-4" /> : <SearchCode className="size-4" />}
                      {detecting ? "Detecting..." : "Detect Again"}
                    </Button>
                    <Button onClick={handleBack} variant="ghost" className="w-full">Back</Button>
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
  replaceConnectionId: PropTypes.string,
};
