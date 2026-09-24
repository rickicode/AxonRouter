"use client";

import { useState, useEffect } from "react";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { LOCALE_FLAGS } from "@/shared/constants/locales";
import LanguageSwitcher from "./LanguageSwitcher";

function getLocaleFromCookie() {
 if (typeof document === "undefined") return "en";
 const cookie = document.cookie
 .split(";")
 .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
 const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
 return normalizeLocale(value);
}

export default function HeaderLanguage() {
 const [open, setOpen] = useState(false);
 const [locale, setLocale] = useState("en");

 useEffect(() => {
 let cancelled = false;
 queueMicrotask(() => {
 if (!cancelled) setLocale(getLocaleFromCookie());
 });
 return () => { cancelled = true; };
 }, [open]);

 return (
 <>
 <button
 onClick={() => setOpen(true)}
className="flex size-10 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text-main"
 title="Language"
 data-i18n-skip="true"
 >
 <span className="text-sm">{LOCALE_FLAGS[locale] || "EN"}</span>
 </button>

 <LanguageSwitcher
 hideTrigger
 isOpen={open}
 onClose={(next) => {
 setOpen(false);
 setLocale(next);
 }}
 />
 </>
 );
}
