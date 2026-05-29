import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function StatusBadge({ status, className = "" }) {
  const normalized = String(status || "").toLowerCase();
  const variant = normalized === "running" || normalized === "enabled" ? "default" : normalized === "error" ? "destructive" : "secondary";

  return (
    <Badge variant={variant} className={cn("uppercase tracking-[0.04em]", className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}
