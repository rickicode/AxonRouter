import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderGatewayLandingHtml } from "../../gateway/landingPage.mjs";

describe("Gateway Landing Page", () => {
  it("renders valid HTML with responsive meta viewport", () => {
    const html = renderGatewayLandingHtml({ mode: "cluster", workers: 4, port: 3778 });
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /name="viewport"/);
    assert.match(html, /content="width=device-width, initial-scale=1"/);
  });

  it("does NOT mention or leak dashboard URL", () => {
    const html = renderGatewayLandingHtml({ mode: "cluster", workers: 4, port: 3778 });
    assert.doesNotMatch(html, /3777/);
    assert.doesNotMatch(html, /dashboard/i);
    assert.doesNotMatch(html, /AxonRouter Web/i);
  });

  it("clearly informs user that this is not a browsing destination", () => {
    const html = renderGatewayLandingHtml({ mode: "cluster", workers: 4, port: 3778 });
    assert.match(html, /Not a browsing destination/i);
    assert.match(html, /Machine-to-Machine Gateway/i);
    assert.match(html, /\/v1\/chat\/completions/);
    assert.match(html, /\/v1\/messages/);
    assert.match(html, /\/v1\/models/);
  });

  it("includes dynamic topology indicators", () => {
    const html = renderGatewayLandingHtml({ mode: "standalone", workers: 1, port: 3778 });
    assert.match(html, /standalone \(1w\)/);
  });
});
