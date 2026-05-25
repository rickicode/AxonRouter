"use client";

import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "./config";

type TranslationMap = Record<string, string>;
type TranslationParams = Record<string, string | number | boolean | null | undefined>;
type TranslateOptions = {
  count?: number;
  one?: string;
  other?: string;
  params?: TranslationParams;
  fallback?: string;
};

type TextNodeWithOriginal = Text & { _originalText?: string };

let translationMap: TranslationMap = {};
let currentLocale = DEFAULT_LOCALE;
let reloadCallbacks: Array<() => void> = [];
let observer: MutationObserver | null = null;
const warnedMissingKeys = new Set<string>();

function isDev() {
  return process.env.NODE_ENV !== "production";
}

function warnMissingKey(key: string) {
  if (!isDev() || warnedMissingKeys.has(key)) return;
  warnedMissingKeys.add(key);
  console.warn(`[i18n] Missing translation for locale ${currentLocale}: ${key}`);
}

function applyParams(template: string, params: TranslationParams = {}) {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function resolveTranslation(text: string, options: TranslateOptions = {}) {
  const trimmed = text.trim();
  if (!trimmed || currentLocale === "en") {
    return applyParams(options.fallback || text, options.params);
  }

  const direct = translationMap[trimmed];
  const pluralKey = typeof options.count === "number"
    ? translationMap[`${trimmed}.${options.count === 1 ? "one" : "other"}`]
    : undefined;
  const fallbackTemplate = typeof options.count === "number"
    ? (options.count === 1 ? options.one : options.other) || options.fallback || text
    : options.fallback || text;
  const template = direct || pluralKey || fallbackTemplate;

  if (!direct && !pluralKey) {
    warnMissingKey(trimmed);
  }

  return applyParams(template, {
    ...options.params,
    count: options.count,
  });
}

// Read locale from cookie
function getLocaleFromCookie() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : DEFAULT_LOCALE;
  return normalizeLocale(value);
}

// Load translation map
async function loadTranslations(locale: string) {
  if (locale === "en") {
    translationMap = {};
    return;
  }

  try {
    const response = await fetch(`/i18n/literals/${locale}.json`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    translationMap = json && typeof json === "object" ? json : {};
  } catch (err) {
    console.error("Failed to load translations:", err);
    translationMap = {};
  }
}

// Translate text - exported for use in components
export function translate(text: string, options: TranslateOptions = {}) {
  if (!text || typeof text !== "string") return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  return resolveTranslation(text, options);
}

export function translatePlural(base: string, count: number, options: Omit<TranslateOptions, "count"> = {}) {
  return translate(base, { ...options, count });
}

export function translateWithParams(text: string, params: TranslationParams, options: Omit<TranslateOptions, "params"> = {}) {
  return translate(text, { ...options, params });
}

// Get current locale - exported for use in components
export function getCurrentLocale() {
  return currentLocale;
}

// Register callback for locale changes
export function onLocaleChange(callback: () => void) {
  reloadCallbacks.push(callback);
  return () => {
    reloadCallbacks = reloadCallbacks.filter((cb) => cb !== callback);
  };
}

// Process text node
function processTextNode(node: Node) {
  const textNode = node as TextNodeWithOriginal;
  if (!textNode.nodeValue || !textNode.nodeValue.trim()) return;

  // Skip if parent is script, style, code, or structural elements
  const parent = textNode.parentElement;
  if (!parent) return;

  // Skip if parent or any ancestor has data-i18n-skip attribute
  let element: HTMLElement | null = parent;
  while (element) {
    if (element.hasAttribute?.("data-i18n-skip")) {
      return;
    }
    element = element.parentElement;
  }

  const tagName = parent.tagName?.toLowerCase();

  // Skip elements that don't allow text nodes
  const skipTags = [
    "script", "style", "code", "pre",
    "colgroup", "table", "thead", "tbody", "tfoot", "tr",
    "select", "datalist", "optgroup",
  ];

  if (skipTags.includes(tagName)) return;

  // Store original text if not already stored
  if (!textNode._originalText) {
    textNode._originalText = textNode.nodeValue;
  }

  // Use original text for translation
  const original = textNode._originalText;
  const translated = translate(original);

  // Only update if different to avoid unnecessary DOM mutations
  if (translated !== textNode.nodeValue) {
    textNode.nodeValue = translated;
  }
}

// Process all text nodes in element
function processElement(element: Node | null) {
  if (!element || typeof document === "undefined") return;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

  let node: Node | null;
  const nodesToProcess: Node[] = [];

  // Collect all nodes first to avoid live collection issues
  while ((node = walker.nextNode())) {
    nodesToProcess.push(node);
  }

  // Process collected nodes
  nodesToProcess.forEach(processTextNode);
}

// Initialize runtime i18n
export async function initRuntimeI18n() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  currentLocale = getLocaleFromCookie();
  await loadTranslations(currentLocale);

  // Process existing DOM
  processElement(document.body);

  if (observer) {
    observer.disconnect();
  }

  // Watch for new nodes
  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processElement(node);
        } else if (node.nodeType === Node.TEXT_NODE) {
          processTextNode(node);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Reload translations when locale changes
export async function reloadTranslations() {
  if (typeof document === "undefined") return;

  currentLocale = getLocaleFromCookie();
  warnedMissingKeys.clear();
  await loadTranslations(currentLocale);

  // Notify all registered callbacks
  reloadCallbacks.forEach((callback) => callback());

  // Re-process entire DOM (will use stored original text)
  processElement(document.body);
}
