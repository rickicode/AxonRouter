"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ChangelogModal from "./ChangelogModal";
import NineRemotePromoModal from "./NineRemotePromoModal";
import LanguageSwitcher from "./LanguageSwitcher";
import SidebarShutdownControl from "./SidebarShutdownControl";

const LOCALE_INFO = {
  en: { name: "English", code: "EN" },
  vi: { name: "Tieng Viet", code: "VI" },
  "zh-CN": { name: "Simplified Chinese", code: "ZH" },
  "zh-TW": { name: "Traditional Chinese", code: "ZH" },
  ja: { name: "Japanese", code: "JA" },
  "pt-BR": { name: "Portuguese (BR)", code: "PT" },
  "pt-PT": { name: "Portuguese (PT)", code: "PT" },
  ko: { name: "Korean", code: "KO" },
  es: { name: "Spanish", code: "ES" },
  de: { name: "German", code: "DE" },
  fr: { name: "French", code: "FR" },
  he: { name: "Hebrew", code: "HE" },
  ar: { name: "Arabic", code: "AR" },
  ru: { name: "Russian", code: "RU" },
  pl: { name: "Polish", code: "PL" },
  cs: { name: "Czech", code: "CS" },
  nl: { name: "Dutch", code: "NL" },
  tr: { name: "Turkish", code: "TR" },
  uk: { name: "Ukrainian", code: "UK" },
  tl: { name: "Tagalog", code: "TL" },
  id: { name: "Indonesia", code: "ID" },
  th: { name: "Thai", code: "TH" },
  hi: { name: "Hindi", code: "HI" },
  bn: { name: "Bangla", code: "BN" },
  ur: { name: "Urdu", code: "UR" },
  ro: { name: "Romanian", code: "RO" },
  sv: { name: "Swedish", code: "SV" },
  it: { name: "Italian", code: "IT" },
  el: { name: "Greek", code: "EL" },
  hu: { name: "Hungarian", code: "HU" },
  fi: { name: "Finnish", code: "FI" },
  da: { name: "Danish", code: "DA" },
  no: { name: "Norwegian", code: "NO" },
};

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie.split(";").find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

export default function HeaderMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [locale, setLocale] = useState("en");
  useEffect(() => { void Promise.resolve().then(() => setLocale(getLocaleFromCookie())); }, [langOpen]);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) return;
      queryClient.clear();
      router.replace("/login");
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  const localeInfo = LOCALE_INFO[locale] || { name: locale, code: locale.slice(0, 2).toUpperCase() };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="icon-sm" aria-label="Open dashboard menu">
            <AppIcon name="grid_view" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>AxonRouter</span>
              <span className="text-xs font-normal text-muted-foreground">Control menu</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setChangelogOpen(true)}>
            <AppIcon name="history" />
            <span>Change Log</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLangOpen(true)}>
            <AppIcon name="language" />
            <span>{localeInfo.name}</span>
            <kbd className="ml-auto rounded-[4px] border border-border px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">{localeInfo.code}</kbd>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <AppIcon name="dark_mode" />
            <span>Dark theme only</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRemoteOpen(true)}>
            <AppIcon name="computer" />
            <span>Remote</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <SidebarShutdownControl variant="menu" />
          <DropdownMenuItem onClick={() => void handleLogout()} className="text-destructive focus:text-destructive">
            <AppIcon name="logout" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangelogModal isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <NineRemotePromoModal isOpen={remoteOpen} onClose={() => setRemoteOpen(false)} />
      <LanguageSwitcher hideTrigger isOpen={langOpen} onClose={() => setLangOpen(false)} />
    </>
  );
}
