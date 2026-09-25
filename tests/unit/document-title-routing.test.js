import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BASE_TITLE,
  TITLE_SUFFIX,
  titleForRoute,
  setRouteTitle,
  useDocumentTitle,
} from "../../src/lib/ui/documentTitle.js";

describe("documentTitle routing contracts", () => {
  it("derives distinct page titles across all main dashboard routes", () => {
    const routeTitles = new Map([
      ["/dashboard", "Overview · AxonRouter"],
      ["/dashboard/app", "Overview · AxonRouter"],
      ["/dashboard/providers", "Providers · AxonRouter"],
      ["/dashboard/providers/new", "Add Provider · AxonRouter"],
      ["/dashboard/combos", "Combo Adapter · AxonRouter"],
      ["/dashboard/quota", "Quota Tracker · AxonRouter"],
      ["/dashboard/usage", "Usage & Analytics · AxonRouter"],
      ["/dashboard/benchmark", "Benchmark · AxonRouter"],
      ["/dashboard/cli-tools", "CLI Tools · AxonRouter"],
      ["/dashboard/proxy-pools", "Proxy Pools · AxonRouter"],
      ["/dashboard/console-log", "Console Log · AxonRouter"],
      ["/dashboard/settings", "Settings · AxonRouter"],
      ["/dashboard/settings/pricing", "Pricing Settings · AxonRouter"],
      ["/dashboard/media-providers/web", "Web Fetch & Search · AxonRouter"],
    ]);

    for (const [route, expected] of routeTitles) {
      expect(titleForRoute(route)).toBe(expected);
    }
  });

  it("handles sub-tab query params cleanly", () => {
    expect(titleForRoute("/dashboard", "?tab=endpoint")).toBe("Endpoint & Key · AxonRouter");
    expect(titleForRoute("/dashboard", "?tab=settings")).toBe("Settings · AxonRouter");
    expect(titleForRoute("/dashboard", "?tab=unknown")).toBe("Overview · AxonRouter");
    expect(titleForRoute("/dashboard/proxy-pools", "?tab=fitness")).toBe("Proxy Fitness · AxonRouter");
    expect(titleForRoute("/dashboard/proxy-pools", "?tab=other")).toBe("Proxy Pools · AxonRouter");
  });

  it("handles dynamic detail routes with descriptive titles", () => {
    expect(titleForRoute("/dashboard/providers/prov-123")).toBe("Provider Detail · AxonRouter");
    expect(titleForRoute("/dashboard/cli-tools/codex")).toBe("CLI Tool · AxonRouter");
    expect(titleForRoute("/dashboard/media-providers/tts")).toBe("Text To Speech · AxonRouter");
    expect(titleForRoute("/dashboard/media-providers/tts/tts-node-1")).toBe("Text To Speech Provider · AxonRouter");
    expect(titleForRoute("/dashboard/media-providers/combo/audio-combo")).toBe("Media Combo Provider · AxonRouter");
  });

  it("normalizes trailing slashes", () => {
    expect(titleForRoute("/dashboard/usage/")).toBe("Usage & Analytics · AxonRouter");
    expect(titleForRoute("/dashboard///")).toBe("Overview · AxonRouter");
  });

  it("distinguishes auth pages and landing page", () => {
    expect(titleForRoute("/login")).toBe("Sign In · AxonRouter");
    expect(titleForRoute("/callback")).toBe("Completing Sign In · AxonRouter");
    expect(titleForRoute("/landing")).toBe(BASE_TITLE);
    expect(titleForRoute("/")).toBe(BASE_TITLE);
  });

  it("falls back to BASE_TITLE for unknown paths", () => {
    expect(titleForRoute("/some/random/unmapped/path")).toBe(BASE_TITLE);
  });
});
