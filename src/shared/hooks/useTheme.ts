"use client";

import { useEffect } from "react";
import useThemeStore from "@/store/themeStore";

export function useTheme() {
  const { theme, setTheme, toggleTheme, initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark: true,
  };
}
