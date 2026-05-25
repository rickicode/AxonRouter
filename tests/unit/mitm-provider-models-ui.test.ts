import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("MitmPageClient provider-models wiring", () => {
  it("fetches aggregate provider models and uses them when checking active providers", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/dashboard/mitm/MitmPageClient.tsx"),
      "utf8"
    );

    expect(file).toContain('fetch("/api/provider-models")');
    expect(file).toContain('const [providerModelsByProvider, setProviderModelsByProvider] = useState({})');
    expect(file).toContain('(providerModelsByProvider?.[conn.provider] || []).length > 0');
  });
});
