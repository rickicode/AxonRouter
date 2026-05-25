import * as React from "react";
import { cn } from "@/lib/utils";

function Empty({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("flex flex-col items-center justify-center rounded-[4px] border border-dashed border-border bg-card p-8 text-center", className)} {...props} />; }
function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("flex flex-col items-center gap-2", className)} {...props} />; }
function EmptyMedia({ className, ...props }: React.ComponentProps<"div"> & { variant?: string }) { return <div className={cn("flex size-12 items-center justify-center rounded-[4px] border border-border bg-primary/15 text-primary", className)} {...props} />; }
function EmptyTitle({ className, ...props }: React.ComponentProps<"h2">) { return <h2 className={cn("mt-4 text-base font-bold text-foreground", className)} {...props} />; }
function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) { return <p className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />; }
function EmptyContent({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("mt-4", className)} {...props} />; }
function EmptyActions({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("mt-4 flex items-center justify-center gap-2", className)} {...props} />; }

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent, EmptyActions };
