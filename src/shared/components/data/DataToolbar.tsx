import { type ReactNode } from "react";

import { cn } from "@/shared/utils/cn";

type DataToolbarProps = {
  title?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function DataToolbar({ title, description, meta, actions, className }: DataToolbarProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        {title ? <div className="text-sm font-semibold uppercase tracking-[0.14em] text-text-main">{title}</div> : null}
        {description ? <div className="mt-1 text-sm text-text-muted">{description}</div> : null}
        {meta ? <div className="mt-1 text-xs text-text-muted">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
