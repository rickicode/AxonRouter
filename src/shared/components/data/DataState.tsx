import AppIcon from "@/shared/components/AppIcon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

type DataStateProps = {
  title: string;
  description?: string;
  icon?: string;
  variant?: "empty" | "error" | "loading";
  className?: string;
};

export function DataState({ title, description, icon = "search", variant = "empty", className = "" }: DataStateProps) {
  if (variant === "error") {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTitle>{title}</AlertTitle>
        {description ? <AlertDescription>{description}</AlertDescription> : null}
      </Alert>
    );
  }

  if (variant === "loading") {
    return (
      <div className={`flex flex-col gap-3 rounded border border-dashed border-border bg-card/40 p-6 ${className}`}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  return (
    <Empty className={`border border-dashed bg-card/40 py-10 ${className}`}>
      <EmptyHeader>
        <EmptyMedia>
          <AppIcon name={icon} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}
