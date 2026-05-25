"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ThemeStoreState = {
  theme: "dark";
  setTheme: (_nextTheme?: "light" | "dark" | "system") => void;
  toggleTheme: () => void;
  initTheme: () => void;
};

const useThemeStore = create<ThemeStoreState>()(
  persist(
    (set) => ({
      theme: "dark",

      setTheme: () => {
        set({ theme: "dark" });
        applyTheme();
      },

      toggleTheme: () => {
        set({ theme: "dark" });
        applyTheme();
      },

      initTheme: () => {
        set({ theme: "dark" });
        applyTheme();
      },
    }),
    {
      name: "theme",
    }
  )
);

// AxonRouter is dark-theme only.
function applyTheme() {
  if (typeof window === "undefined") return;

  const root = document.documentElement;
  root.classList.add("dark");
  root.style.colorScheme = "dark";
}

export default useThemeStore;

