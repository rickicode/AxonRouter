import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function GlassCard({ children, className = "" }) {
  return (
    <Card className={cn("relative overflow-hidden bg-card/95 backdrop-blur", className)}>
      <CardContent className="p-5 md:p-6">
        {children}
      </CardContent>
    </Card>
  );
}
