import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "./config";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "./providers";

export const DASHBOARD_PRIMARY_NAV_ITEMS = [
  { href: "/app/home", label: "Home", icon: "home" },
  { href: "/app/endpoint", label: "Endpoint", icon: "app_window" },
  { href: "/app/providers", label: "Providers", icon: "network" },
  { href: "/app/combos", label: "Combos", icon: "layers" },
  { href: "/app/quota", label: "Quota Tracker", icon: "gauge" },
  { href: "/app/usage", label: "Usage", icon: "chart_column" },
  { href: "/app/analytics", label: "Analytics", icon: "data_object" },
  { href: "/app/mitm", label: "MITM", icon: "shield" },
  { href: "/app/cli-tools", label: "CLI Tools", icon: "terminal" },
  { href: "/app/morph", label: "Morph", icon: "route" },
  { href: "/app/caveman", label: "Caveman", icon: "swords" },
  { href: "/app/skills", label: "Skills", icon: "sparkles" },
  { href: "/app/mcp", label: "MCP", icon: "route" },
];

export const DASHBOARD_SYSTEM_NAV_ITEMS = [
  { href: "/app/proxy-pools", label: "Proxy Pools", icon: "folder_cog" },
];

export const DASHBOARD_DEBUG_NAV_ITEMS = [
  { href: "/app/console-log", label: "Console Log", icon: "scroll_text" },
  { href: "/app/translator", label: "Translator", icon: "languages" },
];

export const DASHBOARD_SETTINGS_NAV_ITEM = {
  href: "/app/settings",
  label: "Settings",
  icon: "settings",
};

export const DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM = {
  href: "/app/media-providers",
  label: "Media Providers",
  icon: "image",
};

export const DASHBOARD_STATIC_PAGE_INFO = [
  {
    match: (pathname) => pathname === "/app/home",
    info: {
      title: "Home",
      description: "Provider topology overview",
      icon: "home",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app" || pathname === "/app/endpoint",
    info: {
      title: "Endpoint",
      description: "API endpoint and protocol configuration",
      icon: "app_window",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/providers",
    info: {
      title: "Providers",
      description: "Manage your AI provider connections",
      icon: "network",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/providers/new",
    info: {
      title: "Add Provider",
      description: "Create a new provider connection",
      icon: "add_circle",
      breadcrumbs: [
        { label: "Providers", href: "/app/providers" },
        { label: "Add Provider" },
      ],
    },
  },
  {
    match: (pathname) => pathname === "/app/combos",
    info: {
      title: "Combos",
      description: "Model combos with fallback",
      icon: "layers",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/usage",
    info: {
      title: "Usage",
      description: "Monitor live provider activity, token consumption, and request logs",
      icon: "chart_column",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/analytics",
    info: {
      title: "Analytics",
      description: "Explore historical usage, token trends, and backend-calculated spend",
      icon: "data_object",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/quota",
    info: {
      title: "Quota Tracker",
      description: "Track and manage your API quota limits",
      icon: "gauge",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/mitm",
    info: {
      title: "MITM Proxy",
      description: "Intercept CLI tool traffic and route through AxonRouter",
      icon: "shield",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/cli-tools",
    info: {
      title: "CLI Tools",
      description: "Configure CLI tools",
      icon: "terminal",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/morph",
    info: {
      title: "Morph",
      description: "Monitor Morph routing usage and request activity",
      icon: "route",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/caveman",
    info: {
      title: "Caveman",
      description: "Configure caveman prompt compression and routing behavior",
      icon: "swords",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/skills",
    info: {
      title: "Skills",
      description: "Copy capability-specific skill prompts for AxonRouter workflows",
      icon: "sparkles",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/mcp",
    info: {
      title: "MCP",
      description: "Monitor the MCP runtime, transports, tool inventory, and audit activity",
      icon: "route",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/proxy-pools",
    info: {
      title: "Proxy Pools",
      description: "Manage your proxy pool configurations",
      icon: "folder_cog",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/settings" || pathname === "/app/profile",
    info: {
      title: "Settings",
      description: "Manage your preferences",
      icon: "settings",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/settings/pricing",
    info: {
      title: "Settings",
      description: "Manage your preferences",
      icon: "settings",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/translator",
    info: {
      title: "Translator",
      description: "Debug translation flow between formats",
      icon: "languages",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/console-log",
    info: {
      title: "Console Log",
      description: "Live server console output",
      icon: "scroll_text",
      breadcrumbs: [],
    },
  },
  {
    match: (pathname) => pathname === "/app/basic-chat",
    info: {
      title: "Basic Chat",
      description: "Test chat flows directly from the dashboard",
      icon: "chat",
      breadcrumbs: [],
    },
  },
];

export const EMPTY_DASHBOARD_PAGE_INFO = { title: "", description: "", breadcrumbs: [] };

export function isDashboardNavItemActive(pathname, href) {
  if (!pathname || !href) return false;
  if (href === "/app/home") {
    return pathname === "/app/home";
  }
  if (href === "/app/endpoint") {
    return pathname === "/app" || pathname.startsWith("/app/endpoint");
  }
  if (href === DASHBOARD_SETTINGS_NAV_ITEM.href) {
    return pathname === "/app/profile" || pathname.startsWith("/app/settings");
  }
  if (href === DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.href) {
    return pathname.startsWith(DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.href);
  }
  return pathname.startsWith(href);
}

export function isDashboardMediaKindActive(pathname, kindId) {
  if (!pathname || !kindId) return false;
  return pathname.startsWith(`${DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.href}/${kindId}`);
}

export function getDashboardPageInfo(pathname) {
  if (!pathname) return EMPTY_DASHBOARD_PAGE_INFO;

  const mediaDetailMatch = pathname.match(/^\/app\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetailMatch) {
    const kindId = mediaDetailMatch[1];
    const providerId = mediaDetailMatch[2];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((kind) => kind.id === kindId);
    const provider = AI_PROVIDERS[providerId];
    return {
      title: provider?.name || providerId,
      description: "",
      breadcrumbs: [
        { label: DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.label, href: `/app/media-providers/${kindId}` },
        { label: kindConfig?.label || kindId, href: `/app/media-providers/${kindId}` },
        { label: provider?.name || providerId, image: `/providers/${providerId}.png` },
      ],
    };
  }

  const mediaKindMatch = pathname.match(/^\/app\/media-providers\/([^/]+)$/);
  if (mediaKindMatch) {
    const kindId = mediaKindMatch[1];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((kind) => kind.id === kindId);
    return {
      title: kindConfig?.label || kindId,
      description: `Manage your ${kindConfig?.label || kindId} providers`,
      icon: kindConfig?.icon || DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.icon,
      breadcrumbs: [],
    };
  }

  const providerMatch = pathname.match(/^\/app\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const provider = OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (provider) {
      return {
        title: provider.name,
        description: "",
        breadcrumbs: [
          { label: "Providers", href: "/app/providers" },
          { label: provider.name, image: `/providers/${provider.id}.png` },
        ],
      };
    }
  }

  const staticMatch = DASHBOARD_STATIC_PAGE_INFO.find((entry) => entry.match(pathname));
  return staticMatch?.info || EMPTY_DASHBOARD_PAGE_INFO;
}
