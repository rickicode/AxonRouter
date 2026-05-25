"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean
  defaultChecked?: boolean
  onToggle?: (checked: boolean) => void
  size?: "sm" | "default"
}

function Switch({
  className,
  size = "default",
  checked,
  defaultChecked = false,
  disabled,
  onToggle,
  onClick,
  ...rawProps
}: SwitchProps) {
  const { onCheckedChange: _ignoredOnCheckedChange, onToggleChecked: _ignoredOnToggleChecked, onToggle: _ignoredOnToggle, ...props } = rawProps as SwitchProps & { onCheckedChange?: unknown; onToggleChecked?: unknown; onToggle?: unknown }
  const isControlled = checked !== undefined
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked)
  const currentChecked = isControlled ? checked : internalChecked

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)
      if (event.defaultPrevented || disabled) return

      const nextChecked = !currentChecked
      if (!isControlled) setInternalChecked(nextChecked)
      onToggle?.(nextChecked)
    },
    [currentChecked, disabled, isControlled, onClick, onToggle]
  )

  return (
    <button
      type="button"
      role="switch"
      aria-checked={currentChecked}
      data-state={currentChecked ? "checked" : "unchecked"}
      data-disabled={disabled ? "" : undefined}
      data-slot="switch"
      data-size={size}
      disabled={disabled}
      className={cn(
        "peer group/switch relative inline-flex cursor-pointer shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      onClick={handleClick}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        data-state={currentChecked ? "checked" : "unchecked"}
        className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-[state=checked]:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[calc(100%-2px)] dark:data-[state=checked]:bg-primary-foreground group-data-[size=default]/switch:data-[state=unchecked]:translate-x-0 group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-0 dark:data-[state=unchecked]:bg-foreground"
      />
    </button>
  )
}

export { Switch }
