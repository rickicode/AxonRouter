import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";

export const BASE_TITLE = "AxonRouter - AI Infrastructure Management";
export const TITLE_SUFFIX = "AxonRouter";

let routeTitle = BASE_TITLE;
let pageOverride = null;

function applyTitle() {
  if (typeof document === "undefined") return;
  const next = pageOverride || routeTitle;
  if (document.title !== next) document.title = next;
}

/** Router-level setter. Ignored while a page holds an explicit override. */
export function setRouteTitle(title) {
  if (!title) return;
  routeTitle = title;
  if (!pageOverride) applyTitle();
}

/**
 * Per-page override for dynamic titles (provider name, combo name, ...).
 * Runs in an effect so it always wins over the route-derived title.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return undefined;
    pageOverride = title;
    applyTitle();
    return () => {
      if (pageOverride === title) {
        pageOverride = null;
        applyTitle();
      }
    };
  }, [title]);
}

function page(label) {
  return `${label} · ${TITLE_SUFFIX}`;
}

function mediaKindLabel(kind) {
  return MEDIA_PROVIDER_KINDS.find((item) => item.id === kind)?.label || "Media Provider";
}

const EXACT_TITLES = {
  "/login": "Sign In",
  "/callback": "Completing Sign In",
  "/dashboard": "Overview",
  "/dashboard/app": "Overview",
  "/dashboard/providers": "Providers",
  "/dashboard/providers/new": "Add Provider",
  "/dashboard/combos": "Combo Adapter",
  "/dashboard/quota": "Quota Tracker",
  "/dashboard/usage": "Usage & Analytics",
  "/dashboard/benchmark": "Benchmark",
  "/dashboard/cli-tools": "CLI Tools",
  "/dashboard/proxy-pools": "Proxy Pools",
  "/dashboard/console-log": "Console Log",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/pricing": "Pricing Settings",
  "/dashboard/media-providers/web": "Web Fetch & Search",
};

/** Derive the document title for the current location. */
export function titleForRoute(pathname = "/", search = "") {
  const path = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search);
  const tab = params.get("tab");

  if (path === "/landing") return BASE_TITLE;

  if (path === "/dashboard") {
    if (tab === "endpoint") return page("Endpoint & Key");
    if (tab === "settings") return page("Settings");
    return page("Overview");
  }

  if (path === "/dashboard/proxy-pools" && tab === "fitness") return page("Proxy Fitness");
  if (EXACT_TITLES[path]) return page(EXACT_TITLES[path]);

  if (path.startsWith("/dashboard/cli-tools/")) return page("CLI Tool");
  if (path.startsWith("/dashboard/media-providers/combo")) return page("Media Combo Provider");
  if (path.startsWith("/dashboard/providers/")) return page("Provider Detail");

  const mediaMatch = path.match(/^\/dashboard\/media-providers\/([^/]+)(?:\/(.*))?$/);
  if (mediaMatch) {
    const label = mediaKindLabel(mediaMatch[1]);
    return page(mediaMatch[2] ? `${label} Provider` : label);
  }

  return BASE_TITLE;
}

/** Sets the document title from the current location. Mount inside the router. */
export default function DocumentTitle() {
  const location = useLocation();
  useEffect(() => {
    setRouteTitle(titleForRoute(location.pathname, location.search));
  }, [location.pathname, location.search]);
  return null;
}
