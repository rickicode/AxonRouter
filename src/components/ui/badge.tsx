import * as React from "react";
import { cn } from "@/lib/utils";

const variantClass = {
  default: "border-primary/25 bg-primary/15 text-primary",
  secondary: "border-border bg-foreground/10 text-muted-foreground",
  destructive: "border-destructive/25 bg-destructive/15 text-destructive",
  outline: "border-border bg-transparent text-muted-foreground",
  ghost: "border-transparent bg-transparent text-muted-foreground",
  link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
} as const;

const badgeBase = "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-bold tracking-[0.01em]";

function Badge({ className, variant = "default", asChild: _asChild, ...props }: React.ComponentProps<"span"> & { variant?: keyof typeof variantClass; asChild?: boolean }) {
  return <span className={cn(badgeBase, variantClass[variant], className)} {...props} />;
}

function badgeVariants({ variant = "default", className }: { variant?: keyof typeof variantClass; className?: string } = {}) {
  return cn(badgeBase, variantClass[variant], className);
}

export { Badge, badgeVariants };
