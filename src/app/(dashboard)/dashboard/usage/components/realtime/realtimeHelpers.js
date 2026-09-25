"use client";

import { useState, useEffect } from "react";
import { formatTokens } from "@/shared/utils/formatTokens";

export function timeAgo(timestamp) {
  if (!timestamp) return "-";
  const ms = new Date(timestamp).getTime();
  if (isNaN(ms)) return "-";
  const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export function TimeAgo({ timestamp }) {
 const [, setTick] = useState(0);
 useEffect(() => {
 const timer = setInterval(() => {
 if (typeof document !== "undefined" && document.hidden) return; // pause hidden
 setTick((t) => t + 1);
    }, 5000);
 const onVisibility = () => {
 if (typeof document !== "undefined" && !document.hidden) setTick((t) => t + 1); // catch-up on return
 };
 if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
 return () => {
 clearInterval(timer);
 if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
 };
 }, []);
 return <>{timeAgo(timestamp)}</>;
}

export const fmt = (n) => {
  if (n === null || n === undefined || n === "" || n === "-") return "0";
  const clean = typeof n === "string" ? n.replace(/,/g, "") : n;
  const num = Number(clean);
  if (isNaN(num)) return "0";
  return formatTokens(num);
};
