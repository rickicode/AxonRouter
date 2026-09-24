"use client";

import PropTypes from "prop-types";
import { Input } from "@/shared/components";
import Icon from "@/shared/components/Icon";

/** Reusable endpoint row component */
export default function EndpointRow({
 label,
 url,
 copyId,
 copied,
 onCopy,
 badge = false,
 actions,
}) {
 const isCopied = copied === copyId;
 const isHighlighted = Boolean(badge);

 return (
 <div className="flex flex-col sm:flex-row sm:items-center gap-2">
 <div className="flex items-center justify-between sm:justify-start">
 <span
 className={`text-xs font-mono px-1.5 py-1 rounded-sm shrink-0 min-w-[88px] text-center ${
 isHighlighted
  ? "bg-primary/10 text-primary font-medium"
 : "bg-surface text-text-muted"
 }`}
 >
 {label}
 </span>
 </div>
 <div className="flex-1 min-w-0 w-full">
 <Input value={url} readOnly className="w-full font-mono text-sm" />
 </div>
 <div className="flex items-center justify-end gap-1 shrink-0">
 <button
 type="button"
 onClick={() => onCopy(url, copyId)}
 aria-label={isCopied ? "Copied" : `Copy ${label} URL`}
  className="size-11 shrink-0 rounded-sm text-text-muted hover:bg-surface-2 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
 >
<Icon name={isCopied ? "check" : "content_copy"} size={18} />
 </button>
 {actions}
 </div>
 </div>
 );
}

EndpointRow.propTypes = {
 label: PropTypes.string.isRequired,
 url: PropTypes.string.isRequired,
 copyId: PropTypes.string.isRequired,
 copied: PropTypes.string,
 onCopy: PropTypes.func.isRequired,
 badge: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
 actions: PropTypes.node,
};
