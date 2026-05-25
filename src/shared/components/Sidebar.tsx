"use client";

import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import SidebarBrand from "./sidebar/SidebarBrand";
import SidebarHealth from "./sidebar/SidebarHealth";
import SidebarNav from "./sidebar/SidebarNav";

function SidebarContents() {
  return (
    <>
      <SidebarHeader className="px-3 pb-3 pt-3">
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent className="px-3 py-2" aria-label="Dashboard navigation">
        <SidebarNav />
      </SidebarContent>
      <SidebarFooter className="px-3 pb-4 pt-3">
        <SidebarHealth />
      </SidebarFooter>
    </>
  );
}

export default function Sidebar() {
  return (
    <ShadcnSidebar collapsible="icon" className="border-sidebar-border/80 text-sidebar-foreground [&_[data-sidebar=sidebar-inner]]:bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--sidebar-primary)_20%,transparent),transparent_30%),linear-gradient(180deg,color-mix(in_srgb,var(--sidebar)_88%,var(--sidebar-primary)_12%),var(--sidebar)_42%)]">
      <SidebarContents />
      <SidebarRail />
    </ShadcnSidebar>
  );
}
