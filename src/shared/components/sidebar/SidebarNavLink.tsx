import Link from "next/link";
import AppIcon from "@/shared/components/AppIcon";
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSubButton, SidebarMenuSubItem } from "@/components/ui/sidebar";

export type SidebarNavLinkProps = {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  onClose?: () => void;
  dense?: boolean;
};

const navButtonClass = "relative h-9 rounded-lg !bg-transparent px-2 text-sm font-medium text-sidebar-foreground/78 shadow-none transition-colors before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity hover:!bg-sidebar-accent/70 hover:text-sidebar-foreground data-[active=true]:!bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:before:opacity-100 [&>svg]:text-sidebar-foreground/60 hover:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-primary";

export default function SidebarNavLink(props: SidebarNavLinkProps) {
  const { href, icon, label, active, onClose, dense = false } = props;

  if (dense) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild isActive={active} size="sm" className="h-7 rounded-lg !bg-transparent text-sidebar-foreground/68 shadow-none transition-colors hover:!bg-transparent hover:text-sidebar-foreground data-[active=true]:!bg-transparent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>svg]:text-sidebar-primary/80 hover:[&>svg]:text-sidebar-primary data-[active=true]:[&>svg]:text-sidebar-primary">
          <Link href={href} onClick={onClose} aria-current={active ? "page" : undefined}>
            <AppIcon name={icon} />
            <span>{label}</span>
          </Link>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label} className={navButtonClass}>
        <Link href={href} onClick={onClose} aria-current={active ? "page" : undefined}>
          <AppIcon name={icon} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
