"use client";

import { useState, useEffect } from "react";
import { formatTokens } from "@/shared/utils/formatTokens";
import { getProviderAlias } from "@/shared/constants/providers";

/**
 * Format provider and model together with slash (e.g. "ag/gemini-2.5-flash")
 */
export function formatProviderModel(provider, model) {
  const p = (provider || "").toLowerCase();
  const alias = (p ? getProviderAlias(p) : "") || p || "";
  let cleanModel = model || "";
  if (alias && cleanModel.toLowerCase().startsWith(`${alias.toLowerCase()}/`)) {
    cleanModel = cleanModel.slice(alias.length + 1);
  } else if (p && cleanModel.toLowerCase().startsWith(`${p}/`)) {
    cleanModel = cleanModel.slice(p.length + 1);
  }
  return { alias, cleanModel, full: alias ? `${alias}/${cleanModel}` : cleanModel };
}

// Capability shown per request in Recent Requests. The column this backs used to
// render a hardcoded "Completed" dot — identical for every row, so it carried no
// information at all.
//
// meta.callKind is authoritative when present. Rows written before the capability
// ledgers existed carry no callKind, so the endpoint is the fallback; that keeps
// older history readable instead of collapsing every row to "LLM".
const CAPABILITY_BY_CALL_KIND = {
  chat: { label: "LLM", icon: "smart_toy", tone: "primary" },
  classifier: { label: "LLM", icon: "route", tone: "primary" },
  judge: { label: "LLM", icon: "route", tone: "primary" },
  embedding: { label: "Embedding", icon: "grid_view", tone: "info" },
  image: { label: "Image", icon: "image", tone: "warning" },
  video: { label: "Video", icon: "movie", tone: "warning" },
  search: { label: "Search", icon: "travel_explore", tone: "success" },
  fetch: { label: "Fetch", icon: "download", tone: "success" },
  tts: { label: "Audio", icon: "graphic_eq", tone: "info" },
  stt: { label: "Speech", icon: "mic", tone: "info" },
};

const CAPABILITY_BY_ENDPOINT = [
  [/\/embeddings?\b/i, CAPABILITY_BY_CALL_KIND.embedding],
  [/\/images?\b|\/image\//i, CAPABILITY_BY_CALL_KIND.image],
  [/\/videos?\b|\/video\//i, CAPABILITY_BY_CALL_KIND.video],
  [/\/search\b/i, CAPABILITY_BY_CALL_KIND.search],
  [/\/fetch\b/i, CAPABILITY_BY_CALL_KIND.fetch],
  [/\/audio\/speech|\/tts\b/i, CAPABILITY_BY_CALL_KIND.tts],
  [/\/audio\/transcriptions|\/stt\b/i, CAPABILITY_BY_CALL_KIND.stt],
  [/\/chat\/completions|\/responses\b/i, CAPABILITY_BY_CALL_KIND.chat],
];

/**
 * Resolve a request's capability kind.
 * @param {object} req usage row (callKind and/or endpoint)
 * @returns {{label: string, icon: string, tone: string}|null} null only when nothing is known
 */
export function capabilityOf(req) {
  if (!req) return null;
  const byKind = req.callKind && CAPABILITY_BY_CALL_KIND[req.callKind];
  if (byKind) return byKind;
  const endpoint = req.endpoint || "";
  for (const [pattern, capability] of CAPABILITY_BY_ENDPOINT) {
    if (pattern.test(endpoint)) return capability;
  }
  if (!req.callKind && !endpoint) return null;
  return CAPABILITY_BY_CALL_KIND.chat;
}

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
    }, 30000);
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
