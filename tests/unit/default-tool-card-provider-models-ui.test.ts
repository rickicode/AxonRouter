import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("DefaultToolCard provider-models wiring", () => {
  it("fetches aggregate provider models and threads them into ModelSelectModal activeProviders", () => {
    const file = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/app/cli-tools/components/DefaultToolCard.tsx"),
      "utf8"
    );

    expect(file).toContain('fetch("/api/provider-models")');
    expect(file).toContain('const [providerModelsByProvider, setProviderModelsByProvider] = useState({})');
    expect(file).toContain('availableImportedModels: providerModelsByProvider?.[provider.provider] || []');
  });
});
