import * as React from "react";
import { cn } from "@/lib/utils";

function Alert({ className, variant = "default", ...props }: React.ComponentProps<"div"> & { variant?: "default" | "destructive" }) {
  return (
    <div
      role="alert"
      data-slot="alert"
      data-variant={variant}
      className={cn(
        "relative grid w-full gap-1 rounded-[4px] border border-border bg-card p-3 text-sm text-card-foreground",
        variant === "destructive" && "border-destructive/35 bg-destructive/15 text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-bold leading-none tracking-tight", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-action" className={cn("mt-2 flex justify-end", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
