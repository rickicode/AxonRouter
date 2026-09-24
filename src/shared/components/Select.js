"use client";

import { useId } from "react";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

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
  id: idProp,
  ...props
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-text-muted">
          {label}
          {required && <span className="text-danger ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId || hintId}
          className={cn(
            "h-11 w-full appearance-none border border-border bg-surface px-2 pr-8 text-sm text-text-main",
            "outline-none focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "ring-1 ring-danger border-danger/30",
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
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-text-muted">
          <Icon name="expand_more" size={18} />
        </div>
      </div>
      {error && (
        <p id={errorId} className="text-xs text-danger flex items-center gap-1">
          <Icon name="error" size={18} />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}
