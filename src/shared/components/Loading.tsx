"use client";

import AppIcon from "@/shared/components/AppIcon";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton as ShadcnSkeleton } from "@/components/ui/skeleton";
import { Spinner as ShadcnSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const spinnerSizes = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
  xl: "size-12",
} as const;

export function Spinner({ size = "md", className }: { size?: keyof typeof spinnerSizes; className?: string }) {
  return <ShadcnSpinner className={cn(spinnerSizes[size], className)} />;
}

export function PageLoading({ message = "Loading..." }: { message?: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <Card className="max-w-sm p-4 text-center">
        <div className="flex flex-col items-center justify-center">
          <div className="flex size-12 items-center justify-center rounded-[4px] border border-border bg-primary/15 text-primary">
            <Spinner size="lg" />
          </div>
          <h2 className="mt-4 text-base font-bold text-foreground">{message}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Preparing the AxonRouter control surface.</p>
        </div>
      </Card>
    </div>
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<typeof ShadcnSkeleton>) {
  return <ShadcnSkeleton className={className} {...props} />;
}

export function CardSkeleton() {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-10" />
      </div>
      <Skeleton className="mb-2 h-8 w-16" />
      <Skeleton className="h-3 w-20" />
    </Card>
  );
}

export function EmptyState({ title = "Nothing here yet", description = "Once data is available, it will appear here.", icon = "info", className }: { title?: React.ReactNode; description?: React.ReactNode; icon?: string; className?: string }) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia>
          <AppIcon name={icon} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export default function Loading({ type = "spinner", ...props }: { type?: "spinner" | "page" | "skeleton" | "card" | "empty"; [key: string]: unknown }) {
  switch (type) {
    case "page":
      return <PageLoading {...props} />;
    case "skeleton":
      return <Skeleton {...props} />;
    case "card":
      return <CardSkeleton />;
    case "empty":
      return <EmptyState {...props} />;
    default:
      return <Spinner {...props} />;
  }
}
