"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Drawer({
 isOpen,
 onClose,
 title,
 children,
 width = "md",
 className
}) {
 const titleId = useId();
 const panelRef = useRef(null);
 const restoreFocusRef = useRef(null);
 const onCloseRef = useRef(onClose);
 onCloseRef.current = onClose;

 const widths = {
 sm: "w-full sm:w-[400px] max-w-[100vw]",
 md: "w-full sm:w-[500px] max-w-[100vw]",
 lg: "w-full sm:w-[600px] max-w-[100vw]",
 xl: "w-full sm:w-[800px] max-w-[100vw]",
 full: "w-full max-w-[100vw]",
 };

 useEffect(() => {
 if (isOpen) {
 document.body.style.overflow = "hidden";
 } else {
 document.body.style.overflow = "";
 }
 return () => { document.body.style.overflow = ""; };
 }, [isOpen]);

 useEffect(() => {
 if (!isOpen) return;
 restoreFocusRef.current = document.activeElement;

 const panel = panelRef.current;
 const first = panel?.querySelector(FOCUSABLE);
 (first || panel)?.focus();

 const handleKeyDown = (e) => {
 if (e.key === "Escape") {
 e.stopPropagation();
 onCloseRef.current?.();
 return;
 }
 if (e.key !== "Tab" || !panel) return;
 const focusable = [...panel.querySelectorAll(FOCUSABLE)].filter(
 (el) => el.offsetParent !== null || el === document.activeElement
 );
 if (focusable.length === 0) {
 e.preventDefault();
 panel.focus();
 return;
 }
 const firstEl = focusable[0];
 const lastEl = focusable[focusable.length - 1];
 if (e.shiftKey && document.activeElement === firstEl) {
 e.preventDefault();
 lastEl.focus();
 } else if (!e.shiftKey && document.activeElement === lastEl) {
 e.preventDefault();
 firstEl.focus();
 }
 };

 document.addEventListener("keydown", handleKeyDown, true);
 return () => {
 document.removeEventListener("keydown", handleKeyDown, true);
 document.body.style.overflow = "";
 const restore = restoreFocusRef.current;
 if (restore && typeof restore.focus === "function") restore.focus();
 };
 }, [isOpen]);

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 overscroll-contain">
 {/* Overlay */}
 <div
 className="absolute inset-0 bg-black/80 fade-in cursor-pointer"
 onClick={onClose}
 aria-hidden="true"
 />

 {/* Drawer panel */}
 <div
 ref={panelRef}
 role="dialog"
 aria-modal="true"
 aria-labelledby={title ? titleId : undefined}
 aria-label={title ? undefined : "Drawer"}
 tabIndex={-1}
 className={cn(
 "absolute right-0 bottom-0 sm:top-0 w-full max-w-[100vw] h-[90vh] sm:h-full max-h-[90vh] sm:max-h-none bg-surface flex flex-col outline-none",
 "rounded-none",
 "shadow-none",
 "slide-in-right",
 "border-t sm:border-t-0 sm:border-l border-border",
 "overscroll-contain",
 widths[width] || widths.md,
 className
 )}
 >
 {/* Header */}
 <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
 <div className="flex items-center gap-2">
 {title && (
 <h2 id={titleId} className="text-sm font-semibold text-text-main">{title}</h2>
 )}
 </div>
 <button
 type="button"
 onClick={onClose}
 aria-label="Close drawer"
className="size-10 -mr-2 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-2 hover:text-text-main focus-visible:ring-2 focus-visible:ring-primary/40"
 >
 <Icon name="close" size={18} />
 </button>
 </div>

 {/* Body */}
 <div className="flex-1 overflow-y-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] custom-scrollbar overscroll-contain">
 {children}
 </div>
 </div>
 </div>
 );
}
