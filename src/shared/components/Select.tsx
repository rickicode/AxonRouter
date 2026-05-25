"use client";

import AppIcon from "@/shared/components/AppIcon";
import { cn } from "@/shared/utils/cn";
import type { ChangeEvent, SelectHTMLAttributes } from "react";

type Option = { value: string; label: string };
type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "placeholder"> & {
  label?: string;
  options?: Option[];
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  selectClassName?: string;
};

export default function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = "Select an option",
  error,
  hint,
  disabled = false,
  required = false,
  className,
  selectClassName,
  ...props
}: SelectProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-sm font-medium text-[var(--color-text-main)]">
          {label}
          {required && <span className="ml-1 text-[var(--color-danger)]">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "w-full py-2 px-3 pr-10 text-sm text-[var(--color-text-main)]",
            "appearance-none rounded border border-[var(--color-border)] bg-[var(--color-surface)]",
            "focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]/50",
            "transition-all disabled:opacity-50 disabled:cursor-not-allowed",
            "text-[16px] sm:text-sm",
            error
              ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20"
              : "",
            selectClassName
          )}
          {...props}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-text-muted)]">
          <AppIcon name="expand_more" size={20} />
        </div>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-[var(--color-danger)]">
          <AppIcon name="error" size={14} />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
      )}
    </div>
  );
}
