import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

export default function DeltaBadge({
 diff,
 pct,
 unit = "",
 invert = false,
 label = "vs yesterday",
}) {
 if (diff == null && pct == null) return null;
 const hasPct = pct != null;
 const isZero = hasPct ? pct === 0 : diff === 0;
 const isPositive = hasPct ? pct > 0 : diff > 0;

 const isGood = invert ? !isPositive && !isZero : isPositive && !isZero;

 const colorClass = isZero
 ? "text-text-muted bg-surface-2"
 : isGood
 ? "text-success bg-success/10"
 : "text-danger bg-danger/10";

 const icon = isZero
 ? "horizontal_rule"
 : isPositive
 ? "arrow_upward"
 : "arrow_downward";

 const formattedText =
 hasPct
 ? `${isPositive ? "+" : ""}${pct.toFixed(1)}%`
 : `${isPositive ? "+" : ""}${typeof diff === "number" ? (Number.isInteger(diff) ? diff : diff.toFixed(1)) : diff}${unit ? " " + unit : ""}`;

 return (
 <span
 className={cn(
 "inline-flex items-center gap-0.5 rounded-sm px-1.5 py-1 text-[11px] font-medium mt-0.5 self-start",
 colorClass,
 )}
 title={`Yesterday delta: ${hasPct ? pct.toFixed(1) + "%" : diff ?? ""}`}
 >
<Icon name={icon} size={18} />
 <span>{formattedText}</span>
 <span className="text-text-muted text-[11px] ml-0.5">{label}</span>
 </span>
 );
}
