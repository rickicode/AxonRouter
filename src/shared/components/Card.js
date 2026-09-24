"use client";

import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

export default function Card({
 children,
 title,
 subtitle,
 icon,
 action,
 padding = "md",
 hover = false,
 elev = false,
 className,
 ...props
}) {
 const paddings = {
 none: "",
 xs: "p-2",
 sm: "p-3",
 md: "p-3",
 lg: "p-5",
 };

 return (
 <div
 className={cn(
 "min-w-0 max-w-full border border-border bg-surface rounded-sm",
 elev && "shadow-soft",
 hover &&
 "hover:border-primary/30 cursor-pointer",
 paddings[padding],
 className,
 )}
 {...props}
 >
 {(title || action) && (
 <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-3 min-w-0">
 {icon && (
 <div className="flex size-8 items-center justify-center rounded-sm bg-bg text-text-muted shrink-0">
<Icon name={icon} size={18} className="size-5 overflow-hidden flex items-center justify-center" />
 </div>
 )}
 <div className="min-w-0">
 {title && (
 <h3 className="text-sm font-semibold text-text-main [overflow-wrap:anywhere]">
 {title}
 </h3>
 )}
 {subtitle && (
 <p className="text-sm text-text-muted">{subtitle}</p>
 )}
 </div>
 </div>
 {action && <div className="min-w-0 max-w-full">{action}</div>}
 </div>
 )}
 {children}
 </div>
 );
}

Card.Section = function CardSection({ children, className, ...props }) {
 return (
 <div
 className={cn(
 "p-3 rounded-sm",
 "bg-bg border border-border",
 className,
 )}
 {...props}
 >
 {children}
 </div>
 );
};

Card.Row = function CardRow({ children, className, ...props }) {
 return (
 <div
 className={cn(
 "px-3 py-2",
 "border-b border-border last:border-b-0",
 "hover:bg-surface-2",
 className,
 )}
 {...props}
 >
 {children}
 </div>
 );
};

Card.ListItem = function CardListItem({
 children,
 actions,
 className,
 ...props
}) {
 return (
 <div
 className={cn(
 "group flex items-center justify-between p-3 -mx-3 px-3",
 "border-b border-border last:border-b-0",
 "hover:bg-surface-2",
 className,
 )}
 {...props}
 >
 <div className="flex-1 min-w-0">{children}</div>
 {actions && (
 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 {actions}
 </div>
 )}
 </div>
 );
};
