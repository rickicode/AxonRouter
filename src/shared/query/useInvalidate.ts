"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryKeys } from "./queryKeys";

/**
 * Hook that returns helpers to invalidate TanStack Query cache after raw fetch mutations.
 * Use this in components that haven't been migrated to useMutation yet.
 */
export function useInvalidate() {
  const qc = useQueryClient();

  const invalidate = useCallback((...keys: readonly (readonly unknown[])[]) => {
    for (const key of keys) {
      void qc.invalidateQueries({ queryKey: key as unknown[] });
    }
  }, [qc]);

  return {
    invalidate,
    providers: () => invalidate(queryKeys.providers()),
    providerDetail: (id: string) => invalidate(queryKeys.providerDetail(id)),
    providerNodes: () => invalidate(queryKeys.providerNodes()),
    providerModels: () => invalidate(queryKeys.providerModels()),
    settings: () => invalidate(queryKeys.settings()),
    modelAliases: () => invalidate(queryKeys.modelAliases()),
    modelSync: () => invalidate(queryKeys.modelSync()),
    proxyPools: () => invalidate(queryKeys.proxyPools()),
    combos: () => invalidate(queryKeys.combos()),
    keys: () => invalidate(queryKeys.keys()),
    goRouter: () => invalidate(queryKeys.goRouter()),
    r2Settings: () => invalidate(queryKeys.r2Settings()),
    cliTools: () => invalidate(queryKeys.cliToolsBootstrap()),
    openCode: () => invalidate(queryKeys.openCodeBootstrap()),
    disabledModels: () => invalidate(queryKeys.disabledModels()),
    /** Invalidate all provider-related caches */
    allProviders: (id?: string) => {
      void qc.invalidateQueries({ queryKey: queryKeys.providers() });
      void qc.invalidateQueries({ queryKey: queryKeys.providerNodes() });
      void qc.invalidateQueries({ queryKey: queryKeys.providerModels() });
      if (id) void qc.invalidateQueries({ queryKey: queryKeys.providerDetail(id) });
    },
  };
}
