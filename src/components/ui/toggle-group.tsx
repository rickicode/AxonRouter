"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const ToggleGroupContext = React.createContext<{ value?: string | string[]; setValue?: (value: string) => void; type?: "single" | "multiple" }>({});

function ToggleGroup({ className, value, defaultValue, onValueChange, type = "single", children, ...props }: React.ComponentProps<"div"> & { value?: string | string[]; defaultValue?: string | string[]; onValueChange?: (value: any) => void; type?: "single" | "multiple"; spacing?: number; orientation?: string; variant?: string; size?: string }) {
  const [internal, setInternal] = React.useState(defaultValue);
  const current = value ?? internal;
  const setValue = (next: string) => {
    let out: string | string[] = next;
    if (type === "multiple") {
      const arr = Array.isArray(current) ? current : [];
      out = arr.includes(next) ? arr.filter((item) => item !== next) : [...arr, next];
    }
    setInternal(out);
    onValueChange?.(out);
  };
  return <ToggleGroupContext.Provider value={{ value: current, setValue, type }}><div className={cn("inline-flex items-center gap-1 rounded-[4px] border border-border bg-secondary/75 p-1", className)} {...props}>{children}</div></ToggleGroupContext.Provider>;
}

function ToggleGroupItem({ className, value, ...props }: React.ComponentProps<"button"> & { value: string; variant?: string; size?: string }) {
  const ctx = React.useContext(ToggleGroupContext);
  const active = Array.isArray(ctx.value) ? ctx.value.includes(value) : ctx.value === value;
  return <button type="button" data-state={active ? "on" : "off"} className={cn("inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] px-3 py-1.5 text-sm font-bold text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60 hover:bg-primary/10 hover:text-foreground", active && "bg-primary/15 text-primary", className)} onClick={() => ctx.setValue?.(value)} {...props} />;
}

export { ToggleGroup, ToggleGroupItem };
