"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import ProviderIcon from "@/shared/components/ProviderIcon";
import HeaderMenu from "@/shared/components/HeaderMenu";
import { getDashboardPageInfo } from "@/shared/constants/dashboardNavigation";
import { translate } from "@/i18n/runtime";
import { useHeaderSearchStore } from "@/store/headerSearchStore";

export default function Header({ trigger }: { trigger?: React.ReactNode }) {
  const pathname = usePathname();
  const searchQuery = useHeaderSearchStore((state: any) => state.query);
  const setSearchQuery = useHeaderSearchStore((state: any) => state.setQuery);
  const clearSearchQuery = useHeaderSearchStore((state: any) => state.clearQuery);
  const pageInfo = useMemo(() => getDashboardPageInfo(pathname), [pathname]);
  const { title, description, breadcrumbs } = pageInfo;

  useEffect(() => { clearSearchQuery(); }, [pathname, clearSearchQuery]);

  return (
    <header key={pathname} className="flex min-h-18 items-center gap-3 border-b border-border/80 bg-background/82 px-5 shadow-[0_16px_42px_rgba(0,0,0,0.16)] backdrop-blur-xl max-sm:min-h-16 max-sm:px-3">
      <div className="hidden shrink-0 max-lg:block">{trigger}</div>

      <div className="min-w-0 flex-1">
        {breadcrumbs.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <div key={`${crumb.label}-${crumb.href || "current"}`} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 && <ChevronRight size={14} />}
                  {crumb.href ? (
                    <Button asChild variant="link" className="h-auto min-h-0 p-0 text-xs text-muted-foreground hover:text-foreground">
                      <Link href={crumb.href}>{translate(crumb.label)}</Link>
                    </Button>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      {crumb.image && <ProviderIcon src={crumb.image} alt={crumb.label} size={24} className="max-h-6 max-w-6 rounded object-contain" fallbackText={crumb.label.slice(0, 2).toUpperCase()} fallbackColor="bg-muted text-muted-foreground" />}
                      <h1 className="truncate text-xl font-bold leading-tight tracking-[-0.035em] text-foreground max-[640px]:text-base">{translate(crumb.label)}</h1>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : title ? (
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold leading-tight tracking-[-0.035em] text-foreground max-[640px]:text-base">{translate(title)}</h1>
            {description && <p className="mt-0.5 truncate text-xs text-muted-foreground max-[760px]:hidden">{translate(description)}</p>}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-10 w-[min(28vw,22rem)] items-center gap-2 rounded-[4px] border border-border/80 bg-secondary/60 px-3 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] max-[900px]:hidden">
        <Search size={16} />
        <Input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search routes..." className="h-auto min-h-0 border-0 bg-transparent px-0 text-sm text-foreground focus-visible:ring-0" />
        {searchQuery ? <Button type="button" variant="ghost" size="icon-xs" onClick={clearSearchQuery} aria-label="Clear header search"><X size={15} /></Button> : null}
      </div>

      <Separator orientation="vertical" className="h-7 w-px max-sm:hidden" />
      <HeaderMenu />
    </header>
  );
}
