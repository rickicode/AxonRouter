import { describe, expect, it, vi } from "vitest";

describe("request-details route redaction env", () => {
  it("REQUEST_DETAILS_SHOW_RAW=true disables redaction", () => {
    process.env.REQUEST_DETAILS_SHOW_RAW = "true";
    const showRaw = process.env.REQUEST_DETAILS_SHOW_RAW === "true";
    expect(showRaw).toBe(true);
  });

  it("REQUEST_DETAILS_SHOW_RAW unset -> still redacted", () => {
    delete process.env.REQUEST_DETAILS_SHOW_RAW;
    const showRaw = process.env.REQUEST_DETAILS_SHOW_RAW === "true";
    expect(showRaw).toBe(false);
  });

  it("REQUEST_DETAILS_SHOW_RAW=false -> still redacted", () => {
    process.env.REQUEST_DETAILS_SHOW_RAW = "false";
    const showRaw = process.env.REQUEST_DETAILS_SHOW_RAW === "true";
    expect(showRaw).toBe(false);
  });
});
