import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const usageStatsPath = path.resolve(import.meta.dirname, "../../src/shared/components/UsageStats.tsx");

describe("usage provider topology morph fast", () => {
  it("merges stats.byProvider into provider topology so morph-fast appears like a normal provider", async () => {
    const source = await fs.readFile(usageStatsPath, "utf8");

    expect(source).toContain("const topologyProviders = useMemo(() => {");
    expect(source).toContain("for (const providerId of Object.keys(stats?.byProvider || {}))");
    expect(source).toContain('if (providerId === MORPH_MANAGED_PROVIDER_ID)');
    expect(source).toContain('providers={topologyProviders}');
  });
});
