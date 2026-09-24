"use client";

import { useState, useRef, useEffect, useMemo, useId, useCallback } from "react";
import { cn } from "@/shared/utils/cn";
import Icon from "@/shared/components/Icon";

export default function Combobox({
 id,
 label,
 value = "",
 onChange,
 options = [],
 placeholder = "Select or type...",
 "aria-label": ariaLabel,
 disabled = false,
 required = false,
 allowCustom = true,
 clearable = true,
 loading = false,
 error,
 hint,
 icon,
 className,
 inputClassName,
 emptyMessage = "No matching options",
 onBlur,
 onFocus,
 onKeyDown,
 ...props
}) {
 const generatedId = useId();
 const comboboxId = id || generatedId;
 const listboxId = `${comboboxId}-listbox`;

 const [isOpen, setIsOpen] = useState(false);
 const [query, setQuery] = useState(value || "");
 const [activeIndex, setActiveIndex] = useState(-1);

 const containerRef = useRef(null);
 const inputRef = useRef(null);
 const listboxRef = useRef(null);

 // Sync internal query whenever controlled value prop changes externally
 useEffect(() => {
 let cancelled = false;
 queueMicrotask(() => {
 if (!cancelled) setQuery(value || "");
 });
 return () => { cancelled = true; };
 }, [value]);

 // Normalize options array into structured items
 const normalizedOptions = useMemo(() => {
 if (!Array.isArray(options)) return [];
 return options.map((opt) => {
 if (typeof opt === "string") {
 return { value: opt, label: opt };
 }
 return {
 value: opt.value ?? "",
 label: opt.label ?? opt.value ?? "",
 subtitle: opt.subtitle,
 badge: opt.badge,
 icon: opt.icon,
 isCustom: Boolean(opt.isCustom),
 };
 });
 }, [options]);

 // Filter options based on query
 const filteredOptions = useMemo(() => {
 const q = (query || "").trim().toLowerCase();
 let matches = normalizedOptions;

 if (q) {
 matches = normalizedOptions.filter((opt) => {
 const valMatch = opt.value.toLowerCase().includes(q);
 const labelMatch = opt.label.toLowerCase().includes(q);
 const subMatch = opt.subtitle ? opt.subtitle.toLowerCase().includes(q) : false;
 return valMatch || labelMatch || subMatch;
 });
 }

 // If allowCustom is enabled and query is not an exact match to an existing option
 const exactMatch = normalizedOptions.some(
 (opt) => opt.value.toLowerCase() === q || opt.label.toLowerCase() === q,
 );
 if (allowCustom && q && !exactMatch) {
 return [
 ...matches,
 {
 value: query.trim(),
 label: query.trim(),
 subtitle: "Use custom ID",
 isCustom: true,
 },
 ];
 }

 return matches;
 }, [normalizedOptions, query, allowCustom]);

 // Selection handler
 const selectOption = useCallback(
 (opt) => {
 const nextVal = typeof opt === "string" ? opt : opt.value;
 onChange?.(nextVal);
 setQuery(nextVal);
 setIsOpen(false);
 setActiveIndex(-1);
 },
 [onChange],
 );

 // Clear handler
 const handleClear = useCallback(
 (e) => {
 e.stopPropagation();
 e.preventDefault();
 onChange?.("");
 setQuery("");
 setIsOpen(false);
 setActiveIndex(-1);
 inputRef.current?.focus();
 },
 [onChange],
 );

 // Close when clicking outside and commit typed value if allowCustom
 useEffect(() => {
 const handleClickOutside = (event) => {
 if (containerRef.current && !containerRef.current.contains(event.target)) {
 setIsOpen(false);
 setActiveIndex(-1);
 if (allowCustom && query.trim() !== (value || "").trim()) {
 onChange?.(query.trim());
 } else if (!allowCustom) {
 setQuery(value || "");
 }
 }
 };
 document.addEventListener("mousedown", handleClickOutside);
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }, [allowCustom, query, value, onChange]);

 // Keyboard navigation
 const handleKeyDown = (e) => {
 onKeyDown?.(e);
 if (e.defaultPrevented || disabled) return;

 if (e.altKey && e.key === "ArrowDown") {
 e.preventDefault();
 setIsOpen(true);
 return;
 }
 if (e.altKey && e.key === "ArrowUp") {
 e.preventDefault();
 setIsOpen(false);
 return;
 }

 if (e.key === "ArrowDown") {
 e.preventDefault();
 if (!isOpen) {
 setIsOpen(true);
 setActiveIndex(0);
 } else if (filteredOptions.length > 0) {
 setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
 }
 } else if (e.key === "ArrowUp") {
 e.preventDefault();
 if (!isOpen) {
 setIsOpen(true);
 setActiveIndex(filteredOptions.length - 1);
 } else if (filteredOptions.length > 0) {
 setActiveIndex(
 (prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length,
 );
 }
 } else if (e.key === "Enter") {
 if (isOpen) {
 e.preventDefault();
 if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
 selectOption(filteredOptions[activeIndex]);
 } else if (allowCustom && query.trim()) {
 selectOption({ value: query.trim(), label: query.trim() });
 }
 }
 } else if (e.key === "Escape") {
 if (isOpen) {
 e.preventDefault();
 setIsOpen(false);
 setActiveIndex(-1);
 }
 } else if (e.key === "Tab") {
 if (isOpen) {
 if (allowCustom && query.trim() !== (value || "").trim()) {
 onChange?.(query.trim());
 }
 setIsOpen(false);
 setActiveIndex(-1);
 }
 }
 };

 // Scroll active item into view
 useEffect(() => {
 if (isOpen && activeIndex >= 0 && listboxRef.current) {
 const activeEl = listboxRef.current.children[activeIndex];
 if (activeEl) {
 activeEl.scrollIntoView({ block: "nearest" });
 }
 }
 }, [activeIndex, isOpen]);

 const errorId = error ? `${comboboxId}-error` : undefined;
 const hintId = hint ? `${comboboxId}-hint` : undefined;
 const describedBy = [props["aria-describedby"], errorId, hintId].filter(Boolean).join(" ") || undefined;

 return (
 <div ref={containerRef} className={cn("relative flex flex-col gap-1.5", className)}>
 {label && (
 <label
 htmlFor={comboboxId}
 className="font-medium flex items-center justify-between text-xs text-text-muted"
 >
 <span>
 {label}
 {required && <span className="text-danger ml-1">*</span>}
 </span>
 </label>
 )}

 <div className="relative flex items-center">
 {icon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
              <Icon name={icon} size={18} />
            </div>
 )}

 <input
 ref={inputRef}
 id={comboboxId}
 type="text"
 role="combobox"
 aria-label={ariaLabel || label || placeholder}
 aria-expanded={isOpen}
 aria-haspopup="listbox"
 aria-autocomplete="list"
 aria-controls={isOpen ? listboxId : undefined}
 aria-activedescendant={
 isOpen && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
 }
 aria-invalid={Boolean(error)}
 aria-required={required || undefined}
 aria-describedby={describedBy}
 placeholder={placeholder}
 value={query}
 disabled={disabled}
 autoComplete="off"
 onChange={(e) => {
 setQuery(e.target.value);
 if (!isOpen) setIsOpen(true);
 setActiveIndex(-1);
 if (allowCustom) {
 onChange?.(e.target.value);
 }
 }}
 onFocus={(e) => {
 setIsOpen(true);
 onFocus?.(e);
 }}
 onBlur={onBlur}
 onKeyDown={handleKeyDown}
 className={cn(
 "w-full h-8 px-3 text-sm text-text-main bg-surface rounded-sm",
 "border border-transparent placeholder-text-muted/70",
 "focus:outline-none focus:border-primary/30",
 " ease-out disabled:opacity-50 disabled:cursor-not-allowed",
 "text-[16px] sm:text-sm",
 icon ? "pl-9" : "pl-3",
 clearable && value ? "pr-14" : "pr-8",
 error && "ring-1 ring-danger border-danger/30",
 inputClassName,
 )}
 {...props}
 />

 {/* Right action icons (Loading / Clear / Chevron) */}
 <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-0.5">
 {loading && (
 <Icon name="progress_activity" size={18} className="text-text-muted animate-spin mr-1" />
 )}

 {clearable && Boolean(value) && !disabled && (
 <button
 type="button"
 onClick={handleClear}
 aria-label="Clear selection"
 tabIndex={-1}
 className="size-8 text-text-muted hover:text-text-main rounded-sm hover:bg-surface-2 cursor-pointer"
 >
 <Icon name="close" size={18} className="block" />
 </button>
 )}

 <button
 type="button"
 onClick={() => {
 if (disabled) return;
 setIsOpen((prev) => !prev);
 inputRef.current?.focus();
 }}
 aria-label="Toggle options"
 aria-expanded={isOpen}
 aria-controls={isOpen ? listboxId : undefined}
 tabIndex={-1}
 className="size-8 text-text-muted hover:text-text-main rounded-sm hover:bg-surface-2 cursor-pointer"
 >
            <Icon
              name="expand_more"
              size={18}
              className={cn(
                "block transition-transform",
                isOpen && "rotate-180",
              )}
            />
 </button>
 </div>
 </div>

 {/* Dropdown Options Listbox */}
 {isOpen && (
 <ul
 ref={listboxRef}
 id={listboxId}
 role="listbox"
 aria-label={label || ariaLabel || placeholder || "Options"}
 tabIndex={-1}
 className={cn(
 "absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto",
 "rounded-sm border border-border bg-surface p-1",
 "focus:outline-none transition-opacity",
 )}
 >
 {filteredOptions.length === 0 ? (
 <li role="status" aria-live="polite" className="px-3 h-8 text-xs text-text-muted text-center select-none">
 {emptyMessage}
 </li>
 ) : (
 filteredOptions.map((opt, index) => {
 const isSelected = (value || "").trim() === opt.value.trim();
 const isActive = activeIndex === index;

 return (
 <li
 key={`${opt.value}-${index}`}
 id={`${listboxId}-opt-${index}`}
 role="option"
 aria-selected={isSelected}
 onMouseEnter={() => setActiveIndex(index)}
 onClick={() => selectOption(opt)}
 className={cn(
 "px-3 h-8 text-xs rounded-sm flex items-center justify-between gap-2 cursor-pointer select-none",
 isActive
 ? "bg-surface text-text-main"
 : "text-text-main hover:bg-surface-2",
 isSelected && "text-primary font-semibold bg-primary/10",
 )}
 >
 <div className="flex items-center gap-2 min-w-0 flex-1">
              {opt.icon ? (
                <Icon name={opt.icon} size={18} className="text-text-muted shrink-0" />
              ) : opt.isCustom ? (
 <Icon name="edit_note" size={18} className="text-primary shrink-0" />
 ) : null}

 <div className="flex flex-col min-w-0">
 <span className="truncate font-medium">{opt.label}</span>
 {opt.subtitle && opt.subtitle !== opt.label && (
 <span className="text-[11px] font-mono text-text-muted truncate">
 {opt.subtitle}
 </span>
 )}
 </div>
 </div>

 <div className="flex items-center gap-1.5 shrink-0 ml-2">
 {opt.badge && (
 <span className="text-[11px] px-1.5 py-1 rounded-sm bg-surface-3 text-text-muted font-mono">
 {opt.badge}
 </span>
 )}
 {isSelected && (
 <Icon name="check" size={18} className="text-primary" />
 )}
 </div>
 </li>
 );
 })
 )}
 </ul>
 )}

 {error && (
 <p id={errorId} role="alert" className="text-xs text-danger flex items-center gap-1 mt-0.5">
 <Icon name="error" size={18} />
 <span>{error}</span>
 </p>
 )}

 {hint && !error && (
 <p id={hintId} className="text-xs text-text-muted mt-0.5">{hint}</p>
 )}
 </div>
 );
}
