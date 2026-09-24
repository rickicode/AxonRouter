"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

/**
 * Switch control.
 *
 * Visual: pill track with an inset groove, a raised thumb carrying a check /
 * close glyph so the state reads even without color, and a spring-style
 * position transition. The thumb is translated inside the track padding, not
 * with magic margins, so every size keeps its geometry.
 *
 * Touch: the interactive surface keeps a 44px hit area below sm, with the
 * visual track centered inside it, so a thumb-tip tap lands on the switch.
 */
export default function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  className,
  title,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}) {
  const sizes = {
    sm: { track: "w-9 h-5", thumb: "size-3.5", travel: "translate-x-4", icon: 9, pad: "px-0.75" },
    md: { track: "w-11 h-6", thumb: "size-4.5", travel: "translate-x-5", icon: 11, pad: "px-0.75" },
    lg: { track: "w-14 h-7", thumb: "size-5.5", travel: "translate-x-7", icon: 13, pad: "px-1" },
  };
  const s = sizes[size];

  const handleClick = () => {
    if (!disabled && onChange) onChange(!checked);
  };

  return (
    <div
      className={cn("flex items-center gap-3", disabled && "opacity-50 cursor-not-allowed", className)}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || (title && !label ? title : undefined)}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        title={title}
        onClick={handleClick}
        className={cn(
          "group/sw relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full",
          "min-h-11 min-w-11 sm:min-h-0 sm:min-w-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          disabled && "cursor-not-allowed"
        )}
      >
        {/* Visual track sits inside the hit surface */}
        <span
          className={cn(
            "relative inline-flex items-center rounded-full border transition-colors duration-200",
            s.track,
            s.pad,
            checked
              ? "bg-primary/90 border-primary/60 group-hover/sw:bg-primary"
              : "bg-surface-3 border-border group-hover/sw:bg-surface-2",
            disabled && "opacity-60"
          )}
        >
          {/* Groove shading */}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 rounded-full",
              checked
                ? "bg-gradient-to-b from-white/15 to-black/10"
                : "bg-gradient-to-b from-black/10 to-black/20"
            )}
          />

          {/* Raised thumb with state glyph */}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none relative inline-flex items-center justify-center rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-black/15",
              s.thumb,
              checked ? s.travel : "translate-x-0"
            )}
          >
            <Icon
              name={checked ? "check" : "close"}
              size={s.icon}
              className={cn(
                "leading-none",
                checked ? "text-primary" : "text-text-muted"
              )}
            />
          </span>
        </span>
      </button>

      {(label || description) && (
        <div className="flex flex-col">
          {label && <span className="text-sm font-medium text-text-main">{label}</span>}
          {description && <span className="text-xs text-text-muted">{description}</span>}
        </div>
      )}
    </div>
  );
}

Toggle.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func,
  label: PropTypes.string,
  description: PropTypes.string,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  className: PropTypes.string,
  title: PropTypes.string,
  "aria-label": PropTypes.string,
  "aria-labelledby": PropTypes.string,
};