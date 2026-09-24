"use client";

import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

const variants = {
 default: "bg-surface text-text-muted",
 primary: "bg-primary/10 text-primary",
 success: "bg-success/10 text-success",
 warning: "bg-warning/10 text-warning",
 error: "bg-danger/10 text-danger",
 info: "bg-primary/10 text-primary",
};

const sizes = {
 sm: "h-5 px-1.5 text-[11px]",
 md: "h-5 px-1.5 text-[11px]",
 lg: "h-5 px-2 text-[11px]",
};

export default function Badge({
 children,
 variant = "default",
 size = "md",
 dot = false,
 icon,
 className,
}) {
 return (
 <span
 className={cn(
 "inline-flex items-center gap-1 rounded-sm font-medium",
 variants[variant],
 sizes[size],
 className
 )}
 >
 {dot && (
 <span
 className={cn(
 "size-1.5 rounded-full",
 variant === "success" && "bg-success",
 variant === "warning" && "bg-warning",
 variant === "error" && "bg-danger",
 variant === "info" && "bg-primary",
 variant === "primary" && "bg-primary",
 variant === "default" && "bg-text-muted"
 )}
 />
 )}
{icon && (
<Icon name={icon} size={18} className="shrink-0" />
)}
 {children}
 </span>
 );
}
