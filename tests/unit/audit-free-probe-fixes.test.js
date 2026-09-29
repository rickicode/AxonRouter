import { describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the batch-add and SSE-probe audit fixes.
 * These are structural / contract tests — they verify the code shape rather
 * than requiring a running server or browser.
 */

describe("Fix 1 — handleAddCustomModelsBatch exists and is exported", () => {
  it("useProviderDetail exports handleAddCustomModelsBatch", async () => {
    // Read the source and verify the function is defined and returned.
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/providers/[id]/useProviderDetail.js"),
      "utf8"
    );
    expect(src).toContain("handleAddCustomModelsBatch");
    expect(src).toMatch(/const handleAddCustomModelsBatch\s*=\s*async/);
    // Exactly 1 fetchCustomModels and 1 dispatchEvent inside batch handler
    const batchBlock = src.slice(src.indexOf("handleAddCustomModelsBatch"));
    const batchEnd = batchBlock.indexOf("};");
    const body = batchBlock.slice(0, batchEnd);
    const fetchCalls = (body.match(/fetchCustomModels\(\)/g) || []).length;
    const dispatchCalls = (body.match(/customModelChanged/g) || []).length;
    expect(fetchCalls).toBe(1);
    expect(dispatchCalls).toBe(1);
  });

  it("ModelsSection.onAddModels uses batch instead of sequential loop", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/providers/[id]/ModelsSection.js"),
      "utf8"
    );
    // Should call batch, not loop
    expect(src).toContain("handleAddCustomModelsBatch");
    expect(src).not.toMatch(/for\s*\(\s*const\s+mId\s+of\s+modelIds\)/);
  });
});

describe("Fix 3 — SSE probe sends events per result, not per chunk", () => {
  it("scan-free-models route uses probeAndEmit pattern in SSE stream", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../src/app/api/providers/[id]/scan-free-models/route.js"),
      "utf8"
    );
    // The SSE streaming section should use probeAndEmit (sendEvent inside each probe)
    expect(src).toContain("probeAndEmit");
    // The SSE section should NOT have the old chunkResults pattern.
    // Extract just the SSE wantsStream block to avoid matching the non-stream JSON path.
    const sseStart = src.indexOf("if (wantsStream)");
    const sseEnd = src.indexOf("// Run probes in chunks");
    const sseSection = src.slice(sseStart, sseEnd > sseStart ? sseEnd : undefined);
    expect(sseSection).toContain("probeAndEmit");
    expect(sseSection).not.toMatch(/const chunkResults\s*=\s*await Promise\.all/);
  });
});

describe("Fix 4 — ScanFreeModelsModal uses isFreeNoAuth prop for warning", () => {
  it("accepts isFreeNoAuth prop and uses it in the warning condition", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js"),
      "utf8"
    );
    expect(src).toContain("isFreeNoAuth");
    // Old pattern: !providerId.includes("free")
    expect(src).not.toMatch(/!providerId\.includes\(["']free["']\)/);
    // New pattern: !isFreeNoAuth && !providerId.endsWith("-free")
    expect(src).toMatch(/!isFreeNoAuth/);
    expect(src).toMatch(/providerId\.endsWith\(["']-free["']\)/);
  });
});
