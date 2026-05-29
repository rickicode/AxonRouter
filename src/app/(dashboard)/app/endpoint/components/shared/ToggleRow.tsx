import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export default function ToggleRow({ label, description, checked, onChange, disabled = false }) {
  return (
    <Field orientation="horizontal" className="items-center justify-between rounded-[4px] border border-border bg-card px-4 py-4" data-disabled={disabled || undefined}>
      <div className="flex-1">
        <FieldLabel>{label}</FieldLabel>
        {description && <FieldDescription className="mt-1 leading-5">{description}</FieldDescription>}
      </div>
      <Switch checked={checked} onToggle={onChange} disabled={disabled} />
    </Field>
  );
}
