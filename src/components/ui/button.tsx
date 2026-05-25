import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const variantClass = {
  default: "border-transparent bg-primary text-primary-foreground hover:border-primary/45 hover:bg-primary/80",
  outline: "border-border bg-transparent text-foreground hover:border-primary/45 hover:bg-primary/15",
  secondary: "border-border bg-secondary text-secondary-foreground hover:border-primary/45 hover:bg-primary/15",
  ghost: "border-transparent bg-transparent text-muted-foreground hover:border-primary/45 hover:bg-primary/15 hover:text-foreground",
  destructive: "border-transparent bg-destructive/15 text-destructive hover:border-destructive/45 hover:bg-destructive/20",
  link: "border-transparent bg-transparent p-0 text-primary underline-offset-4 hover:underline",
} as const;

const sizeClass = {
  default: "min-h-10 px-3.5 py-2 text-sm",
  xs: "min-h-8 px-2.5 py-1.5 text-[0.8125rem]",
  sm: "min-h-8 px-2.5 py-1.5 text-[0.8125rem]",
  lg: "min-h-11 px-4 py-2.5 text-base",
  icon: "size-8 p-0",
  "icon-xs": "size-7 p-0",
  "icon-sm": "size-8 p-0",
  "icon-lg": "size-11 p-0",
} as const;

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: keyof typeof variantClass;
  size?: keyof typeof sizeClass;
  asChild?: boolean;
  loading?: boolean;
};

function getButtonAriaDisabled(disabled?: boolean, loading?: boolean) {
  return disabled || loading || undefined;
}

const buttonBase =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[4px] border font-medium transition-[background,border-color,color,transform] duration-150 active:not-disabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:shrink-0";

function Button({ className, variant = "default", size = "default", asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const classes = cn(buttonBase, variantClass[variant], sizeClass[size], className);

  if (asChild) {
    return (
      <Slot
        className={classes}
        aria-disabled={getButtonAriaDisabled(disabled, loading)}
        data-disabled={disabled || loading ? "true" : undefined}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function buttonVariants({ variant = "default", size = "default", className }: { variant?: keyof typeof variantClass; size?: keyof typeof sizeClass; className?: string } = {}) {
  return cn(buttonBase, variantClass[variant], sizeClass[size], className);
}

export { Button, buttonVariants };
