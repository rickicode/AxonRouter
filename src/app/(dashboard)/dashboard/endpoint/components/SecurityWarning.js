"use client";

import PropTypes from "prop-types";
import Icon from "@/shared/components/Icon";

/** Security warning banner with optional action link */
export default function SecurityWarning({ message, action }) {
  return (
    <div className="flex items-start sm:items-center gap-2.5 px-3 py-2.5 rounded-sm bg-warning/10 border border-warning/30 text-warning min-h-11 sm:min-h-9 sm:py-1.5">
      <Icon name="warning" size={18} className="shrink-0 mt-0.5 sm:mt-0" />
      <p className="text-xs flex-1 leading-relaxed">{message}</p>
      {action && (
        <a
          href={action.href}
          className="text-xs font-medium underline shrink-0 hover:opacity-80 inline-flex items-center min-h-11 sm:min-h-0"
          onClick={
            action.href.startsWith("#")
              ? (e) => {
                  e.preventDefault();
                  document.getElementById(action.href.slice(1))?.scrollIntoView({ behavior: "smooth" });
                }
              : undefined
          }
        >
          {action.label}
        </a>
      )}
    </div>
  );
}

SecurityWarning.propTypes = {
  message: PropTypes.string.isRequired,
  action: PropTypes.shape({
    label: PropTypes.string.isRequired,
    href: PropTypes.string.isRequired,
  }),
};
