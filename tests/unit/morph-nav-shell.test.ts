import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sidebarPath = path.resolve(import.meta.dirname, "../../src/shared/components/sidebar/SidebarNav.tsx");
const sidebarMediaPath = path.resolve(import.meta.dirname, "../../src/shared/components/sidebar/SidebarMediaSection.tsx");
const morphPagePath = path.resolve(
  import.meta.dirname,
  "../../src/app/(dashboard)/app/morph/MorphPageClient.tsx"
);
const dashboardNavigationPath = path.resolve(
  import.meta.dirname,
  "../../src/shared/constants/dashboardNavigation.ts"
);

describe("Morph dashboard nav shell", () => {
  it("adds Morph as a top-level sidebar destination", async () => {
    const source = await fs.readFile(dashboardNavigationPath, "utf8");

    expect(source).toContain('{ href: "/app/morph", label: "Morph", icon: "route" }');
  });

  it("keeps the shared pathname-based active-state logic intact", async () => {
    const source = await fs.readFile(dashboardNavigationPath, "utf8");

    expect(source).toContain("return pathname.startsWith(href);");
    expect(source).toContain('if (href === "/app/endpoint")');
    expect(source).toContain('if (href === DASHBOARD_SETTINGS_NAV_ITEM.href)');
  });

  it("sidebar still delegates active-state checks to the shared navigation helper", async () => {
    const source = await fs.readFile(sidebarPath, "utf8");
    const mediaSource = await fs.readFile(sidebarMediaPath, "utf8");

    expect(source).toContain("isDashboardNavItemActive(pathname, href)");
    expect(mediaSource).toContain("isDashboardMediaKindActive(pathname, kind.id)");
  });

  it("renders a Morph page shell with local routing and endpoint guidance", async () => {
    const source = await fs.readFile(morphPagePath, "utf8");

    expect(source).toContain("Manage the single Morph configuration surface for key rotation, native `/morphllm/*` access, and shared fast-model routing into `/v1/*` and `/v1/messages`.");
    expect(source).toContain("Connection Info");
    expect(source).toContain("Available endpoints");
    expect(source).not.toContain("Back to Settings");
    expect(source).toContain('className="flex w-full max-w-6xl flex-col gap-5"');
    expect(source).toContain("/morphllm/v1/chat/completions");
    expect(source).toContain("/morphllm/v1/compact");
    expect(source).toContain("/morphllm/v1/models");
    expect(source).toContain("window.location.origin");
    expect(source).toContain("/morphllm");
  });

  it("renders a dedicated Morph usage workspace", async () => {
    const source = await fs.readFile(morphPagePath, "utf8");

    expect(source).toContain('<TabsTrigger value="usage">Usage</TabsTrigger>');
    expect(source).toContain("Morph usage");
    expect(source).toContain("Combined Morph Core");
    expect(source).toContain("and Fast Models");
    expect(source).toContain("Official Morph pricing");
    expect(source).toContain("By email");
  });
});
