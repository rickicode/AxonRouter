"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import Link from "@/lib/ui/link.jsx";
import Image from "@/lib/ui/image.jsx";
import { usePathname } from "@/lib/ui/navigation.js";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import Icon from "@/shared/components/Icon";

const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt"];
const COMBINED_WEB_ITEM = { id: "web", label: "Web Fetch & Search", icon: "travel_explore", href: "/dashboard/media-providers/web" };

// Core & Routing
const coreRoutingItems = [
  { href: "/dashboard/app", label: "Overview", icon: "dashboard" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combo Adapter", icon: "layers" },
];

// Monitoring
const monitoringItems = [
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/usage", label: "Usage & Analytics", icon: "bar_chart" },
  { href: "/dashboard/benchmark", label: "Benchmark", icon: "speed" },
];

// Tools & Integration
const toolsItems = [
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
];

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [mediaOpen, setMediaOpen] = useState(false);

  const isActive = (href) => {
    if (href === "/dashboard/app") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/app");
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-sidebar min-h-full">
      <div className="flex h-16 min-h-16 items-center justify-between px-3.5 border-b border-border">
        <Link href="/dashboard" prefetch={false} className="flex min-w-0 items-center gap-2.5 rounded-sm" aria-label="Dashboard">
          <Image src="/favicon.svg" alt="AxonRouter logo" width={36} height={36} className="size-9 shrink-0" priority />
          <span className="truncate text-sm font-semibold text-text-main">{APP_CONFIG.name}</span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="size-10 rounded-sm text-text-muted hover:text-text-main hover:bg-surface-2"
            aria-label="Close navigation sidebar"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-2 space-y-0.5 overflow-y-auto custom-scrollbar">
        {/* Core & Routing Section */}
        <div className="mb-2.5">
          <div className="px-2.5 mb-1">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">Core & Routing</span>
          </div>
          {coreRoutingItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 px-2.5 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <Icon
                name={item.icon}
                size={18}
                className={isActive(item.href) ? "fill-current" : ""}
              />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Monitoring Section */}
        <div className="mb-2.5">
          <div className="px-2.5 mb-1">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">Monitoring</span>
          </div>
          {monitoringItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 px-2.5 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <Icon
                name={item.icon}
                size={18}
                className={isActive(item.href) ? "fill-current" : ""}
              />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* System & Tools Section */}
        <div className="pt-1.5 border-t border-border/50">
          <div className="px-2.5 mb-1">
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted opacity-70">System & Tools</span>
          </div>
          {toolsItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 px-2.5 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <Icon
                name={item.icon}
                size={18}
                className={isActive(item.href) ? "fill-current" : ""}
              />
              <span>{item.label}</span>
            </Link>
          ))}

          {/* Media Providers accordion */}
          <button
            onClick={() => setMediaOpen((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-2.5 px-2.5 rounded-sm text-[13px] font-medium transition-colors",
              pathname.startsWith("/dashboard/media-providers")
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:bg-surface-2 hover:text-text-main"
            )}
          >
            <Icon name="perm_media" size={18} />
            <span className="flex-1 text-left">Media Providers</span>
            <Icon name="expand_more" size={18} className="transition-transform" />
          </button>
          
          {mediaOpen && (
            <div className="mt-1 space-y-0.5">
              {MEDIA_PROVIDER_KINDS.filter((k) => VISIBLE_MEDIA_KINDS.includes(k.id)).map((kind) => (
                <Link
                  key={kind.id}
                  href={`/dashboard/media-providers/${kind.id}`}
                  prefetch={false}
                  onClick={onClose}
                  aria-current={pathname.startsWith(`/dashboard/media-providers/${kind.id}`) ? "page" : undefined}
                  className={cn(
                    "flex h-7.5 items-center gap-2 pl-8 pr-2.5 rounded-sm text-[12.5px] transition-colors",
                    pathname.startsWith(`/dashboard/media-providers/${kind.id}`)
                      ? "bg-primary/10 text-primary"
                      : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                  )}
                >
                  <Icon name={kind.icon} size={16} />
                  <span>{kind.label}</span>
                </Link>
              ))}
              <Link
                key={COMBINED_WEB_ITEM.id}
                href={COMBINED_WEB_ITEM.href}
                prefetch={false}
                onClick={onClose}
                aria-current={pathname.startsWith(COMBINED_WEB_ITEM.href) ? "page" : undefined}
                className={cn(
                  "flex h-7.5 items-center gap-2 pl-8 pr-2.5 rounded-sm text-[12.5px] transition-colors",
                  pathname.startsWith(COMBINED_WEB_ITEM.href)
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                )}
              >
                <Icon name={COMBINED_WEB_ITEM.icon} size={16} />
                <span>{COMBINED_WEB_ITEM.label}</span>
              </Link>
            </div>
          )}

          {systemItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 px-2.5 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <Icon
                name={item.icon}
                size={18}
                className={isActive(item.href) ? "fill-current" : ""}
              />
              <span>{item.label}</span>
            </Link>
          ))}

          {debugItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 px-2.5 rounded-sm text-[13px] font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <Icon
                name={item.icon}
                size={18}
                className={isActive(item.href) ? "fill-current" : ""}
              />
              <span>{item.label}</span>
            </Link>
          ))}

          {/* Settings */}
          <Link
            href="/dashboard/settings"
            prefetch={false}
            onClick={onClose}
            className={cn(
              "flex h-8 items-center gap-2.5 px-2.5 rounded-sm text-[13px] font-medium transition-colors",
              isActive("/dashboard/settings")
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:bg-surface-2 hover:text-text-main"
            )}
          >
            <Icon
              name="settings"
              size={18}
              className={isActive("/dashboard/settings") ? "fill-current" : ""}
            />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      <div className="flex flex-col border-t border-border px-1 py-1.5">
        <div className="flex items-center justify-between gap-2 px-2">
          <a
            href="https://github.com/rickicode/AxonRouter"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-9 items-center rounded-sm px-2 text-xs text-text-muted hover:text-text-main"
          >
            AxonRouter · GitHub
          </a>
          <span
            className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
            title={`${APP_CONFIG.name} version`}
          >
            v{APP_CONFIG.version}
          </span>
        </div>
      </div>
    </aside>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};
