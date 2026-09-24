"use client";

import { useId } from "react";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

export default function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  hint,
  icon,
  disabled = false,
  required = false,
  className,
  inputClassName,
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
        {icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
            <Icon name={icon} size={18} />
          </div>
        )}
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId || hintId}
          className={cn(
            "h-11 w-full border border-border bg-surface px-2 text-sm text-text-main",
            "placeholder:text-text-subtle",
            "outline-none focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            icon && "pl-10",
            error && "ring-1 ring-danger border-danger/30",
            inputClassName
          )}
          {...props}
        />
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
