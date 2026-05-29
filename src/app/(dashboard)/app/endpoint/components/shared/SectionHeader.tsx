import { CardDescription, CardTitle } from "@/components/ui/card";

export default function SectionHeader({ label, title, subtitle, badge }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {label && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>}
        <CardTitle>{title}</CardTitle>
        {subtitle && <CardDescription className="mt-2 max-w-2xl leading-6">{subtitle}</CardDescription>}
      </div>
      {badge}
    </div>
  );
}
