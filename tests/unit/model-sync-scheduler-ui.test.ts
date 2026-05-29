import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("model sync scheduler UI wiring", () => {
  it("surfaces scheduler status in settings and provider detail", () => {
    const settingsFile = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/app/settings/SettingsPageClient.tsx"),
      "utf8"
    );
    const providerFile = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../src/app/(dashboard)/app/providers/[id]/page.tsx"),
      "utf8"
    );

    expect(settingsFile).toContain('Worker active:');
    expect(settingsFile).toContain('Next run:');
    expect(settingsFile).toContain('Sync every N days');
    expect(providerFile).toContain('Scheduler running');
    expect(providerFile).toContain('Next scheduled run');
    expect(providerFile).toContain('const [modelSyncScheduler, setModelSyncScheduler] = useState(null)');
  });
});
