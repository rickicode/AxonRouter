import { ChevronRight } from "lucide-react";
import AppIcon from "@/shared/components/AppIcon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM,
  isDashboardMediaKindActive,
  isDashboardNavItemActive,
} from "@/shared/constants/dashboardNavigation";
import SidebarNavLink from "./SidebarNavLink";

type MediaKind = { id: string; icon: string; label: string };

type SidebarMediaSectionProps = {
  pathname: string;
  mediaKinds: MediaKind[];
  mediaOpen: boolean;
  onToggle: () => void;
  onClose?: () => void;
};

export default function SidebarMediaSection(props: SidebarMediaSectionProps) {
  const { pathname, mediaKinds, mediaOpen, onToggle, onClose } = props;
  if (!mediaKinds.length) return null;
  const active = isDashboardNavItemActive(pathname, DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.href);

  return (
    <Collapsible asChild open={mediaOpen} onOpenChange={onToggle} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={active} tooltip={DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.label} className="relative h-9 cursor-pointer rounded-lg !bg-transparent px-2 text-sm font-medium text-sidebar-foreground/78 shadow-none transition-colors before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity hover:!bg-sidebar-accent/70 hover:text-sidebar-foreground data-[active=true]:!bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:before:opacity-100 [&>svg]:text-sidebar-foreground/60 hover:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-primary">
            <AppIcon name={DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.icon} />
            <span>{DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            <span className="sr-only">Toggle media providers</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarNavLink href={DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.href} icon={DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.icon} label="All media" active={active && pathname === DASHBOARD_MEDIA_PROVIDERS_NAV_ITEM.href} onClose={onClose} dense />
            {mediaKinds.map((kind) => (
              <SidebarNavLink key={kind.id} href={`/app/media-providers/${kind.id}`} icon={kind.icon} label={kind.label} active={isDashboardMediaKindActive(pathname, kind.id)} onClose={onClose} dense />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
