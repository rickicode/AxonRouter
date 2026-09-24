"use client";

import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

export default function ThemeToggle({ className, variant = "default" }) {
 const { isDark, toggleTheme } = useTheme();

 const variants = {
 default: cn(
 "flex size-8 items-center justify-center",
 "text-text-muted hover:bg-surface-2 hover:text-text-main",
 ""
 ),
 card: cn(
 "flex size-8 items-center justify-center rounded-sm",
 "bg-surface/60 hover:bg-surface-2",
 "border border-border",
 " hover:border-primary/30",
 "text-text-muted hover:text-primary",
 " group"
 ),
 };

 return (
 <button
 onClick={toggleTheme}
 className={cn(variants[variant], className)}
 aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
 title={`Switch to ${isDark ? "light" : "dark"} mode`}
 >
<Icon
name={isDark ? "light_mode" : "dark_mode"}
size={18}
className={cn(
variant === "card" && "transition-transform group-hover:rotate-12"
)}
/>
 </button>
 );
}
