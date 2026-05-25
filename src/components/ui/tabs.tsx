"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const TabsContext = React.createContext<{ value?: string; setValue?: (value: string) => void }>({});

function Tabs({ className, value, defaultValue, onValueChange, children, ...props }: React.ComponentProps<"div"> & { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; orientation?: string }) {
  const [internal, setInternal] = React.useState(defaultValue);
  const current = value ?? internal;
  const setValue = (next: string) => { setInternal(next); onValueChange?.(next); };
  return <TabsContext.Provider value={{ value: current, setValue }}><div className={cn("flex flex-col gap-4", className)} {...props}>{children}</div></TabsContext.Provider>;
}
function TabsList({ className, ...props }: React.ComponentProps<"div"> & { variant?: string }) { return <div role="tablist" className={cn("inline-flex items-center gap-1 rounded-[4px] border border-border bg-secondary/75 p-1", className)} {...props} />; }
function TabsTrigger({ className, value, ...props }: React.ComponentProps<"button"> & { value: string }) {
  const ctx = React.useContext(TabsContext); const active = ctx.value === value;
  return <button type="button" role="tab" aria-selected={active} data-active={active || undefined} className={cn("inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] px-3 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:cursor-not-allowed", active && "bg-primary/15 text-primary", className)} onClick={() => ctx.setValue?.(value)} {...props} />;
}
function TabsContent({ className, value, ...props }: React.ComponentProps<"div"> & { value: string }) {
  const ctx = React.useContext(TabsContext); if (ctx.value && ctx.value !== value) return null;
  return <div role="tabpanel" className={cn("min-w-0", className)} {...props} />;
}
export { Tabs, TabsList, TabsTrigger, TabsContent };
