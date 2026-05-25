import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-[4px] bg-foreground/10", className)} {...props} />;
}

export { Skeleton };
