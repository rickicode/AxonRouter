"use client";

import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

const variants = {
  primary: "bg-primary text-black hover:bg-primary-hover disabled:bg-surface-3 disabled:text-text-muted",
  secondary: "border border-border bg-surface text-text-main hover:bg-surface-2 disabled:opacity-50",
  outline: "border border-border text-text-main hover:bg-surface-2",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text-main",
  danger: "bg-danger text-black hover:bg-danger disabled:bg-surface-3 disabled:text-text-muted",
  success: "bg-success text-black hover:bg-success disabled:bg-surface-3 disabled:text-text-muted",
};

const sizes = {
  xs: "h-6 min-w-6 px-2 text-[11px] gap-1",
  sm: "h-7 min-w-7 px-2.5 text-xs gap-1.5",
  md: "h-8 min-w-8 px-3 text-xs gap-1.5",
  lg: "h-9 px-3.5 text-sm gap-2",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium rounded-sm",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Icon name="progress_activity" size={size === "xs" ? 15 : 18} className="animate-spin" />
      ) : icon ? (
        <Icon name={icon} size={size === "xs" ? 15 : 18} />
      ) : null}
      {children}
      {iconRight && !loading && (
        <Icon name={iconRight} size={size === "xs" ? 15 : 18} />
      )}
    </button>
  );
}
