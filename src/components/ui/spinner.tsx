import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return <span role="status" aria-label="Loading" className={cn("inline-block size-4 animate-spin rounded-full border border-current border-t-transparent text-primary", className)} {...props} />;
}

export { Spinner };
