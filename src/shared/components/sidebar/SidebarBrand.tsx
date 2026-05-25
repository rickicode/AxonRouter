"use client";

import Link from "next/link";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import ProviderIcon from "../ProviderIcon";

export default function SidebarBrand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex h-16 items-center gap-3 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/55 px-2.5 text-sidebar-foreground shadow-[0_14px_34px_rgba(0,0,0,0.22)] group-data-[collapsible=icon]:h-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1.5">
          <Link href="/dashboard" aria-label="AxonRouter dashboard" className="grid size-10 shrink-0 place-items-center group-data-[collapsible=icon]:size-8">
            <ProviderIcon src="/axonrouter-logo.svg" alt="AxonRouter" size={32} className="size-8 object-contain group-data-[collapsible=icon]:size-7" fallbackText="RR" fallbackColor="#ffffff" />
          </Link>
          <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">AxonRouter</span>
            <span className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-primary">Local Router</span>
          </div>
          <span className="rounded-md border border-sidebar-border/70 bg-sidebar/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">Core</span>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
