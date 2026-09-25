"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { usePathname } from "@/lib/ui/navigation.js";
import Link from "@/lib/ui/link.jsx";
import PropTypes from "prop-types";
import ProviderIcon from "@/shared/components/ProviderIcon";
import HeaderMenu from "@/shared/components/HeaderMenu";
import HeaderLanguage from "@/shared/components/HeaderLanguage";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { translate } from "@/i18n/runtime";
import Icon from "@/shared/components/Icon";

const getPageInfo = (pathname) => {
 if (!pathname) return { title: "", description: "", breadcrumbs: [] };

 // Media provider detail: /dashboard/media-providers/[kind]/[id]
 const mediaDetailMatch = pathname.match(/\/media-providers\/([^/]+)\/([^/]+)$/);
 if (mediaDetailMatch) {
 const kindId = mediaDetailMatch[1];
 const providerId = mediaDetailMatch[2];
 const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
 const provider = AI_PROVIDERS[providerId];
 return {
 title: provider?.name || providerId,
 description: "",
 breadcrumbs: [
 { label: "Media Providers", href: `/dashboard/media-providers/${kindId}` },
 { label: kindConfig?.label || kindId, href: `/dashboard/media-providers/${kindId}` },
 { label: provider?.name || providerId, image: getProviderIconSrc(providerId) },
 ],
 };
 }

 // Media provider kind: /dashboard/media-providers/[kind]
 const mediaKindMatch = pathname.match(/\/media-providers\/([^/]+)$/);
 if (mediaKindMatch) {
 const kindId = mediaKindMatch[1];
 const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
 return {
 title: kindConfig?.label || kindId,
 description: `Manage your ${kindConfig?.label || kindId} providers`,
 icon: kindConfig?.icon || "perm_media",
 breadcrumbs: [],
 };
 }

 // Provider detail page: /dashboard/providers/[id]
 const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
 if (providerMatch) {
 const providerId = providerMatch[1];
 const providerInfo =
 OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
 if (providerInfo) {
 return {
 title: providerInfo.name,
 description: "",
 breadcrumbs: [
 { label: "Providers", href: "/dashboard/providers" },
 {
 label: providerInfo.name,
 image: getProviderIconSrc(providerInfo.id),
 },
 ],
 };
 }
 }

 if (pathname.includes("/providers") && !pathname.includes("/media-providers"))
 return {
 title: "Providers",
 description: "Manage your AI provider connections",
 icon: "dns",
 breadcrumbs: [],
 };
 if (pathname.includes("/combos"))
 return {
 title: "Combos",
 description: "Model combos with fallback",
 icon: "layers",
 breadcrumbs: [],
 };
 if (pathname.includes("/usage"))
 return {
 title: "Usage & Analytics",
 description:
 "Monitor your API usage, token consumption, and request logs",
 icon: "bar_chart",
 breadcrumbs: [],
 };
 if (pathname.includes("/auth-files"))
 return {
 title: "Auth Files",
 description: "Map provider credentials stored in the local database",
 icon: "vpn_key",
 breadcrumbs: [],
 };
 if (pathname.includes("/quota"))
 return {
 title: "Quota Tracker",
 description: "Track and manage your API quota limits",
 icon: "data_usage",
 breadcrumbs: [],
 };
 if (pathname.includes("/cli-tools"))
 return {
 title: "CLI Tools",
 description: "Configure CLI tools",
 icon: "terminal",
 breadcrumbs: [],
 };
 if (pathname.includes("/proxy-pools"))
 return {
 title: "Proxy Pools",
 description: "Manage your proxy pool configurations",
 icon: "lan",
 breadcrumbs: [],
 };
if (pathname.includes("/settings"))
return {
title: "Settings",
description: "Manage your preferences",
icon: "settings",
breadcrumbs: [],
};
 if (pathname.includes("/translator"))
 return {
 title: "Translator",
 description: "Debug translation flow between formats",
 icon: "translate",
 breadcrumbs: [],
 };
 if (pathname.includes("/console-log"))
 return {
 title: "Console Log",
 description: "Live server console output",
 icon: "monitor",
 breadcrumbs: [],
 };
  if (pathname === "/dashboard" || pathname.includes("/app"))
    return {
      title: "Overview",
      description: "Gateway status, system health, and usage overview",
      icon: "dashboard",
      breadcrumbs: [],
    };
 return { title: "", description: "", breadcrumbs: [] };
};

export default function Header({ onMenuClick, showMenuButton = true }) {
 const pathname = usePathname();
 const [displayName, setDisplayName] = useState("");
 const [loginMethod, setLoginMethod] = useState("");

 // Memoize page info to prevent unnecessary recalculations
 const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
 const { title, description, icon, breadcrumbs } = pageInfo;

 useEffect(() => {
 let cancelled = false;

 async function loadAuthStatus() {
 try {
 const res = await fetch("/api/auth/status", { cache: "no-store" });
 if (!res.ok) return;
 const data = await res.json();
 if (!cancelled) {
 setDisplayName(data?.displayName || data?.samlName || data?.samlEmail || data?.oidcName || data?.oidcEmail || "");
 setLoginMethod(data?.loginMethod || "");
 }
 } catch {
 if (!cancelled) {
 setDisplayName("");
 setLoginMethod("");
 }
 }
 }

 loadAuthStatus();
 return () => {
 cancelled = true;
 };
 }, []);

 const handleLogout = async () => {
 try {
 const res = await fetch("/api/auth/logout", { method: "POST" });
 if (res.ok) {
 window.location.assign("/login");
 }
 } catch (err) {
 console.error("Failed to logout:", err);
 }
 };

 return (
    <header className="flex h-16 min-h-16 shrink-0 items-center gap-3 border-b border-border bg-bg px-3.5 z-20">
 {showMenuButton && (
 <button
 type="button"
 onClick={onMenuClick}
className="flex size-10 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text-main lg:hidden"
 aria-label="Open navigation"
 >
 <Icon name="menu" size={18} />
 </button>
 )}

 <div className="flex min-w-0 flex-1 items-center gap-2">
 {breadcrumbs.length > 0 ? (
 breadcrumbs.map((crumb, index) => (
 <div key={`${crumb.label}-${crumb.href || "current"}`} className="flex min-w-0 items-center gap-2">
 {index > 0 && <span className="text-text-subtle">/</span>}
 {crumb.href ? (
 <Link href={crumb.href} className="truncate text-sm text-text-muted hover:text-primary">
 {crumb.label}
 </Link>
 ) : (
 <span className="flex min-w-0 items-center gap-2">
 {crumb.image && (
 <ProviderIcon
 src={crumb.image}
 alt=""
 size={16}
 className="size-4 object-contain"
 fallbackText={crumb.label.slice(0, 2).toUpperCase()}
 />
 )}
 <h1 className="truncate text-sm font-medium text-text-main">{translate(crumb.label)}</h1>
 </span>
 )}
 </div>
 ))
 ) : title ? (
 <h1 className="truncate text-sm font-medium text-text-main">{translate(title)}</h1>
 ) : null}
 </div>

 <div className="flex shrink-0 items-center gap-1">
 {displayName && (loginMethod === "OIDC" || loginMethod === "SAML") && (
 <span className="hidden max-w-[180px] truncate px-2 text-xs text-text-muted sm:inline" title={displayName}>
 {displayName}
 </span>
 )}
 <HeaderSearch />
 <HeaderLanguage />
 <HeaderMenu onLogout={handleLogout} />
 </div>
 </header>
 );
}

function HeaderSearch() {
	const visible = useHeaderSearchStore((s) => s.visible);
	const query = useHeaderSearchStore((s) => s.query);
	const placeholder = useHeaderSearchStore((s) => s.placeholder);
	const setQuery = useHeaderSearchStore((s) => s.setQuery);
	const inputRef = useRef(null);

	// Global "/" keyboard shortcut to focus search
	useEffect(() => {
		if (!visible) return;

		const handleKeyDown = (e) => {
			if (
				e.key === "/" &&
				!["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) &&
				!document.activeElement?.isContentEditable
			) {
				e.preventDefault();
				inputRef.current?.focus();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [visible]);

	if (!visible) return null;

	const handleInputKeyDown = (e) => {
		if (e.key === "Escape") {
			if (query) {
				setQuery("");
			} else {
				inputRef.current?.blur();
			}
		}
	};

	return (
		<div
			role="search"
			className="group relative flex items-center w-36 sm:w-52 md:w-64 transition-all duration-200 ease-out focus-within:w-48 sm:focus-within:w-64 md:focus-within:w-76"
		>
			<Icon
				name="search"
				size={16}
				className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/70 group-focus-within:text-primary transition-colors"
			/>
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={handleInputKeyDown}
				placeholder={placeholder || "Search..."}
				className="h-8 w-full rounded-sm border border-border/80 bg-surface-2/50 pl-8 pr-7 text-xs sm:text-sm text-text-main placeholder:text-text-muted/60 outline-none transition-all hover:bg-surface-2 hover:border-border focus:border-primary/60 focus:bg-surface focus:ring-2 focus:ring-primary/15"
				aria-label={placeholder || "Search"}
			/>
			{query ? (
				<button
					type="button"
					onClick={() => {
						setQuery("");
						inputRef.current?.focus();
					}}
					className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-sm text-text-muted/70 hover:bg-surface-3 hover:text-text-main transition-colors"
					aria-label="Clear search"
				>
					<Icon name="close" size={13} />
				</button>
			) : (
				<kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-[3px] border border-border/70 bg-surface text-[10px] font-mono text-text-muted/70 select-none shadow-2xs">
					/
				</kbd>
			)}
		</div>
	);
}

Header.propTypes = {
 onMenuClick: PropTypes.func,
 showMenuButton: PropTypes.bool,
};
