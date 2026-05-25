import { cn } from "@/lib/utils";

function Separator({ className, orientation = "horizontal", decorative: _decorative = true, ...props }: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical"; decorative?: boolean }) {
  return <div role="separator" data-orientation={orientation} className={cn("shrink-0 bg-border", orientation === "vertical" ? "h-full w-px" : "h-px w-full", className)} {...props} />;
}

export { Separator };
