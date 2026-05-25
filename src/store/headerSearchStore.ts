import { create } from "zustand";

export const useHeaderSearchStore = create((set) => ({
  query: "",
  setQuery: (query) => set({ query: typeof query === "string" ? query : "" }),
  clearQuery: () => set({ query: "" }),
}));
