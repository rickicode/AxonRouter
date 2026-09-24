"use client";

import { useState, useEffect, useId, useRef } from "react";
import Icon from "@/shared/components/Icon";

export default function Tooltip({
 text,
 children,
 position = "top",
 color,
 className = "",
}) {
 const [isOpen, setIsOpen] = useState(false);
 const [dismissed, setDismissed] = useState(false);
 const id = useId();
 const containerRef = useRef(null);

 const posClass = {
 top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
 bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
 left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
 right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
 }[position] || "bottom-full left-1/2 -translate-x-1/2 mb-1.5";

 const bgStyle = color ? { backgroundColor: color } : {};
 const bgClass = color ? "" : "border border-border bg-surface text-text-main";

 useEffect(() => {
 const handleOutside = (e) => {
 if (containerRef.current && !containerRef.current.contains(e.target)) {
 setIsOpen(false);
 setDismissed(false);
 }
 };
 const handleEsc = (e) => {
 if (e.key === "Escape") {
 setIsOpen(false);
 setDismissed(true);
 }
 };
 document.addEventListener("pointerdown", handleOutside);
 document.addEventListener("keydown", handleEsc);
 return () => {
 document.removeEventListener("pointerdown", handleOutside);
 document.removeEventListener("keydown", handleEsc);
 };
 }, []);

 const handleKeyDown = (e) => {
 if (e.key === "Escape") {
 e.stopPropagation();
 setIsOpen(false);
 setDismissed(true);
 } else if (!children && (e.key === "Enter" || e.key === " ")) {
 e.preventDefault();
 setDismissed(false);
 setIsOpen((prev) => !prev);
 }
 };

 const handleFocus = () => {
 setDismissed(false);
 };

 const handleBlur = (e) => {
 if (containerRef.current && !containerRef.current.contains(e.relatedTarget)) {
 setDismissed(false);
 }
 };

 const visibleClass = dismissed
 ? "opacity-0"
 : isOpen
 ? "opacity-100"
 : "opacity-0 group-hover/tt:opacity-100 focus-within:opacity-100";

 return (
 <span
 ref={containerRef}
 className={`group/tt relative inline-flex ${
 children
 ? ""
 : "min-h-11 min-w-11 items-center justify-center rounded-sm cursor-help focus-visible:outline-none sm:min-h-0 sm:min-w-0"
 } ${className}`.trim()}
 aria-describedby={text ? id : undefined}
 tabIndex={children ? undefined : 0}
 role={children ? undefined : "button"}
 aria-label={children ? undefined : "More information"}
 aria-expanded={children ? undefined : isOpen}
 onClick={() => {
 setDismissed(false);
 setIsOpen((prev) => !prev);
 }}
 onKeyDown={handleKeyDown}
 onFocus={handleFocus}
 onBlur={handleBlur}
 onPointerLeave={() => setDismissed(false)}
 >
 {children || (
 <Icon name="help" size={18} className="text-text-muted" />
 )}
 <span
 id={id}
 role="tooltip"
 aria-hidden={dismissed ? true : undefined}
 className={`pointer-events-none absolute ${posClass} z-50 w-max max-w-64 rounded-sm px-2 py-1 text-xs ${bgClass} transition-opacity whitespace-normal ${visibleClass}`}
 style={bgStyle}
 >
 {text}
 </span>
 </span>
 );
}
