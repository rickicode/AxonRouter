"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import {
  DASHBOARD_DEBUG_NAV_ITEMS,
  DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM,
  DASHBOARD_PRIMARY_NAV_ITEMS,
  DASHBOARD_SETTINGS_NAV_ITEM,
  DASHBOARD_SYSTEM_NAV_ITEMS,
  isDashboardNavItemActive,
} from "@/shared/constants/dashboardNavigation";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import SidebarMediaSection from "./SidebarMediaSection";
import SidebarNavLink from "./SidebarNavLink";
import { matchesHeaderSearch, VISIBLE_MEDIA_KINDS } from "./sidebarSearch";

function active(pathname: string, href: string) {
  return isDashboardNavItemActive(pathname, href);
}

export default function SidebarNav({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const searchQuery = useHeaderSearchStore((state: any) => state.query);
  const [mediaOpen, setMediaOpen] = useState(false);

  const hasSearch = Boolean((searchQuery || "").trim());
  const mediaExpanded = hasSearch || mediaOpen;
  const primary = DASHBOARD_PRIMARY_NAV_ITEMS.filter((item) => matchesHeaderSearch(searchQuery, item.label, item.href));
  const system = DASHBOARD_SYSTEM_NAV_ITEMS.filter((item) => matchesHeaderSearch(searchQuery, item.label, item.href));
  const debug = DASHBOARD_DEBUG_NAV_ITEMS.filter((item) => item.href !== "/dashboard/translator" && matchesHeaderSearch(searchQuery, item.label, item.href));
  const mediaKinds = MEDIA_PROVIDER_KINDS.filter((kind) => VISIBLE_MEDIA_KINDS.includes(kind.id) && matchesHeaderSearch(searchQuery, kind.label, kind.id));
  const showMedia = mediaKinds.length > 0 || matchesHeaderSearch(searchQuery, DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.label);

  return (
    <div className="flex flex-col gap-5">
      <SidebarGroup className="px-0 py-0">
        <SidebarGroupLabel className="h-7 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Platform</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1.5">
            {primary.map((item) => <SidebarNavLink key={item.href} {...item} active={active(pathname, item.href)} onClose={onClose} />)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="px-0 py-0">
        <SidebarGroupLabel className="h-7 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Projects</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1.5">
            {showMedia ? <SidebarMediaSection pathname={pathname} mediaKinds={mediaKinds} mediaOpen={mediaExpanded} onToggle={() => setMediaOpen((value) => !value)} onClose={onClose} /> : null}
            {[...system, ...debug].map((item) => <SidebarNavLink key={item.href} {...item} active={active(pathname, item.href)} onClose={onClose} />)}
            {matchesHeaderSearch(searchQuery, DASHBOARD_SETTINGS_NAV_ITEM.label, DASHBOARD_SETTINGS_NAV_ITEM.href) ? <SidebarNavLink {...DASHBOARD_SETTINGS_NAV_ITEM} active={active(pathname, DASHBOARD_SETTINGS_NAV_ITEM.href)} onClose={onClose} /> : null}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  );
}
