"use client";

import { useEffect, useMemo, useState } from "react";
import { formatFreebucksPrice, formatResetTime, getRemainingPercentage } from "./utils";
import Icon from "@/shared/components/Icon";

const PAGE_SIZE = 10;

/**
 * Format reset time display (Today, 12:00 PM)
 */
function formatResetTimeDisplay(resetTime) {
 if (!resetTime) return null;

 try {
 const date = new Date(resetTime);
 const now = new Date();
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 const tomorrow = new Date(today);
 tomorrow.setDate(tomorrow.getDate() + 1);

 let dayStr = "";
 if (date >= today && date < tomorrow) {
 dayStr = "Today";
 } else if (date >= tomorrow && date < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
 dayStr = "Tomorrow";
 } else {
 dayStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
 }

 const timeStr = date.toLocaleTimeString("en-US", {
 hour: "numeric",
 minute: "2-digit",
 hour12: true,
 });

 return `${dayStr}, ${timeStr}`;
 } catch {
 return null;
 }
}

/**
 * Get color classes based on remaining percentage
 */
function getColorClasses(remainingPercentage) {
 if (remainingPercentage > 70) {
 return {
 text: "text-success",
 bg: "bg-success",
 bgLight: "bg-success/10",
 emoji: "🟢",
 };
 }

 if (remainingPercentage >= 30) {
 return {
 text: "text-warning",
 bg: "bg-warning",
 bgLight: "bg-warning/10",
 emoji: "🟡",
 };
 }

 return {
 text: "text-danger",
 bg: "bg-danger",
 bgLight: "bg-danger/10",
 emoji: "🔴",
 };
}

function sortQuotas(quotas, sortMode) {
 if (sortMode === "remaining-asc") {
 return [...quotas].sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name));
 }

 if (sortMode === "remaining-desc") {
 return [...quotas].sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
 }

 return quotas;
}

/**
 * Quota Table Component - Table-based display for quota data
 */
export default function QuotaTable({
 quotas = [],
 compact = false,
 sortMode = "default",
 showSortLabel = false,
 onHideQuota = null,
}) {
 const [page, setPage] = useState(1);

 const normalizedQuotas = useMemo(
 () => quotas.map((quota, index) => ({
 ...quota,
 index,
 remaining: getRemainingPercentage(quota),
 })),
 [quotas],
 );

 const sortedQuotas = useMemo(
 () => sortQuotas(normalizedQuotas, sortMode),
 [normalizedQuotas, sortMode],
 );

 const totalPages = Math.max(1, Math.ceil(sortedQuotas.length / PAGE_SIZE));

 const [prevSortMode, setPrevSortMode] = useState(sortMode);
 const [prevQuotas, setPrevQuotas] = useState(quotas);

 if (sortMode !== prevSortMode || quotas !== prevQuotas) {
 setPrevSortMode(sortMode);
 setPrevQuotas(quotas);
 setPage(1);
 }

 const safePage = Math.min(Math.max(1, page), totalPages);
 if (page > totalPages) {
 setPage(totalPages);
 }

 if (!quotas || quotas.length === 0) {
 return null;
 }

 const currentPageRows = sortedQuotas.slice(
 (page - 1) * PAGE_SIZE,
 page * PAGE_SIZE,
 );
 const pageStart = sortedQuotas.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
 const pageEnd = Math.min(page * PAGE_SIZE, sortedQuotas.length);

 const cellPad = compact ? "py-1.5 px-2.5 sm:px-1.5" : "px-3 py-2.5 sm:h-8 sm:py-0";
 const nameText = compact ? "text-[11px]" : "text-sm";
 const resetPrimary = compact ? "text-[11px]" : "text-sm";
 const resetSecondary = compact ? "text-[11px]" : "text-xs";
 const sortLabel = "Sorted by account remaining";
 const hasHideAction = typeof onHideQuota === "function";

 return (
 <div className="space-y-3">
 <div className="flex items-center justify-between gap-2">
 <div className="text-[11px] text-text-muted">
 {sortedQuotas.length} quota{sortedQuotas.length > 1 ? "s" : ""}
 </div>
 {showSortLabel && (
 <div className="rounded-sm border border-border bg-surface px-2 py-1 text-[11px] text-text-muted">
 {sortLabel}
 </div>
 )}
 </div>

 <div className="space-y-px">
 {currentPageRows.map((quota) => {
 const isUnlimited = quota.unlimited === true;
 const colors = getColorClasses(quota.remaining);
 const countdown = formatResetTime(quota.resetAt);
 const resetDisplay = formatResetTimeDisplay(quota.resetAt);
 // recurring defaults true: a missing flag means the quota
 // refreshes at resetAt. Bonus/one-shot packs set recurring:false
 // and their resetAt is a hard expiry, so word it as "expires".
 const recurring = quota.recurring !== false;
 const countdownLabel = recurring ? `in ${countdown}` : `expires in ${countdown}`;

 return (
 <div
 key={`${quota.name}-${quota.index}`}
 className={`relative flex flex-col gap-1.5 border-b border-border hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-2 ${cellPad}`}
 >
 {/* Name + identity */}
 <div className="flex min-w-0 items-center gap-1.5 sm:w-36 sm:shrink-0">
 <span className="text-[11px] shrink-0">{colors.emoji}</span>
 <div className="min-w-0">
 <div className={`${nameText} font-medium text-text-main truncate`}>
 {quota.name}
 </div>
 {quota.price !== undefined && (
 <div
 className="text-[11px] text-text-muted truncate"
 title={quota.priceNote || ""}
 >
 {formatFreebucksPrice(quota.price)}
 {quota.priceNote ? ` · ${quota.priceNote}` : ""}
 </div>
 )}
 </div>
 {/* Reset time rides the name row on mobile so the value column keeps its width */}
 <span className={`${resetPrimary} ml-auto shrink-0 truncate text-text-muted sm:hidden`}>
 {countdown !== "-" ? countdownLabel : resetDisplay || "N/A"}
 </span>
 </div>

 {/* Progress + used/total. On mobile this owns a full row, because at 360 the
     fixed 144px name column plus the reset column left it 0-27px wide and the
     used/total string was cut to two glyphs. */}
 <div className="min-w-0 flex-1 sm:min-w-[7rem]">
 {!isUnlimited && (
 <div className={`${compact ? "h-1" : "h-1.5"} mb-1 rounded-full overflow-hidden border ${colors.bgLight} ${
 quota.remaining === 0 ? "border-border" : "border-transparent"
 }`}>
 <div
 className={`h-full ${colors.bg}`}
 style={{ width: `${Math.min(quota.remaining, 100)}%` }}
 />
 </div>
 )}

 <div className={`flex items-center justify-between gap-1 min-w-0 ${compact ? "text-[11px]" : "text-xs"}`}>
 <span
 className="text-text-muted truncate"
 title={
 isUnlimited
 ? `${quota.used.toLocaleString("en-US")} used · Unlimited`
 : `${quota.used.toLocaleString("en-US")} / ${quota.total > 0 ? quota.total.toLocaleString("en-US") : "∞"}`
 }
 >
 {isUnlimited
 ? `${quota.used.toLocaleString("en-US")} used · Unlimited`
 : `${quota.used.toLocaleString("en-US")} / ${quota.total > 0 ? quota.total.toLocaleString("en-US") : "∞"}`}
 </span>
 <span className={`font-medium ${isUnlimited ? "text-success" : colors.text} shrink-0`}>
 {isUnlimited ? "Unlimited" : `${quota.remaining}%`}
 </span>
 </div>
 </div>

 {/* Reset time (desktop only; mobile shows it on the name row) */}
 <div className="hidden min-w-0 shrink sm:block">
 {countdown !== "-" || resetDisplay ? (
 compact ? (
 <div
 className={`${resetPrimary} text-text-main font-medium truncate`}
 title={resetDisplay || ""}
 >
 {countdown !== "-" ? countdownLabel : resetDisplay}
 </div>
 ) : (
 <div className="min-w-0 space-y-3">
 {countdown !== "-" && (
 <div className={`${resetPrimary} text-text-main font-medium truncate`}>
 {countdownLabel}
 </div>
 )}
 {resetDisplay && (
 <div className={`${resetSecondary} text-text-muted truncate`}>
 {resetDisplay}
 </div>
 )}
 </div>
 )
 ) : (
 <div className={`${resetPrimary} text-text-muted italic`}>N/A</div>
 )}
 </div>

 {/* Hide action */}
 {hasHideAction && (
 <button
 type="button"
 onClick={() => onHideQuota(quota)}
 className="absolute right-1 top-1 inline-flex size-11 items-center justify-center rounded-sm text-text-muted hover:bg-surface-2 hover:text-text-main sm:static sm:size-8"
 title="Hide this quota row"
 aria-label={`Hide quota ${quota.name}`}
 >
 <Icon name="visibility_off" size={18} />
 </button>
 )}
 </div>
 );
 })}
 </div>

 {totalPages > 1 && (
 <div className="rounded-sm border border-border bg-surface px-2 py-2">
 <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
 <span>
 Showing {pageStart}-{pageEnd} of {sortedQuotas.length}
 </span>
 <span>
 Page {page} / {totalPages}
 </span>
 </div>
 <div className="mt-1.5 flex items-center justify-end gap-1">
 <button
 type="button"
 onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
 disabled={page === 1}
 className="flex min-h-11 items-center rounded-sm border border-border px-3 text-[11px] text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-8 sm:px-2"
 >
 Prev
 </button>
 <button
 type="button"
 onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
 disabled={page === totalPages}
 className="flex min-h-11 items-center rounded-sm border border-border px-3 text-[11px] text-text-main hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-8 sm:px-2"
 >
 Next
 </button>
 </div>
 </div>
 )}
 </div>
 );
}
