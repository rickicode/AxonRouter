"use client";

import { CAPACITY_META } from "@/shared/constants/models";
import Icon from "@/shared/components/Icon";

// Render small icon badges for a model's capabilities (only those set true).
//
// These render inside cards that carry `overflow-hidden`, and a positioned
// tooltip popover would be clipped by that ancestor (measurably inflating the
// card's scrollWidth by 50-90px and never becoming visible). A native `title`
// carries the same label and description without a positioned descendant, and
// it works on touch press-hold as well as hover.
//
// colorOverride: force a single color class for all badges (default: per-cap color).
// size: icon font-size in px (default 16).
export default function CapacityBadges({ caps, className = "", colorOverride, size = 16 }) {
  if (!caps) return null;
  const active = Object.keys(CAPACITY_META).filter((k) => caps[k]);
  if (active.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {active.map((k) => {
        const meta = CAPACITY_META[k];
        return (
          <Icon
            key={k}
            name={meta.icon}
            size={size}
            title={`${meta.label} — ${meta.desc}`}
            className={`cursor-help ${colorOverride || meta.color}`}
            role="img"
            aria-label={`${meta.label}: ${meta.desc}`}
            aria-hidden={false}
          />
        );
      })}
    </span>
  );
}
