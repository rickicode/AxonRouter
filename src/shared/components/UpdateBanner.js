"use client";

import { useState, useEffect } from "react";
import Icon from "@/shared/components/Icon";

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkVersion() {
      try {
        const res = await fetch("/api/system/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.hasUpdate) {
          // Check if this specific version was dismissed in this session
          const dismissedVersion = sessionStorage.getItem("axon_dismissed_update");
          if (dismissedVersion !== data.latestVersion) {
            setUpdateInfo(data);
          }
        }
      } catch {}
    }

    checkVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!updateInfo || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (updateInfo?.latestVersion) {
      sessionStorage.setItem("axon_dismissed_update", updateInfo.latestVersion);
    }
  };

  return (
    <div
      role="region"
      aria-label="Update notification"
      className="flex items-center justify-between gap-3 border-b border-cyan-500/30 bg-cyan-950/40 px-4 py-2 text-xs text-cyan-200 transition-all"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-400" />
        <span className="font-semibold text-cyan-300">Update Available:</span>
        <span className="truncate">
          Versi baru <strong className="text-white">{updateInfo.latestVersion}</strong> tersedia (saat ini: v{updateInfo.currentVersion}).
        </span>
        <code className="hidden rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-cyan-300 sm:inline">
          docker compose pull && docker compose up -d
        </code>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {updateInfo.releaseUrl ? (
          <a
            href={updateInfo.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-cyan-500/40 bg-cyan-900/40 px-2 py-0.5 text-[11px] font-medium text-cyan-100 hover:bg-cyan-800/60"
          >
            Changelog
          </a>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded p-1 text-cyan-300/70 hover:bg-cyan-900/40 hover:text-cyan-100"
          aria-label="Dismiss update notification"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
