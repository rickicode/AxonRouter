// Guards the reverse-engineered OpenCode CLI identity (2026-09-17): the
// keyless free-tier gate rejects bare "opencode" UAs and non-conforming
// ses_/msg_ ids with 403 FreeTierError. No network access in this file.
import { describe, it, expect } from "vitest";
import { OpenCodeExecutor, OPENCODE_SESSION_RE, OPENCODE_REQUEST_RE } from "../../open-sse/executors/opencode.js";

describe("opencode parseError pool scoping (keyless => quota is per-egress)", () => {
  const ex = new OpenCodeExecutor();
  it("bare 429 is pool-scoped (rotate egress, never lock)", () => {
    const p = ex.parseError({ status: 429 }, "Rate limit exceeded. Please try again later.");
    expect(p?.poolScoped?.reason).toBe("egress-rate-limit");
  });
  it("explicit egress markers keep their specific reasons", () => {
    expect(ex.parseError({ status: 429 }, "too many requests from this ip")?.poolScoped?.reason).toBe("ip-limit");
    expect(ex.parseError({ status: 403 }, "free tier can only be used from within OpenCode")?.poolScoped?.reason).toBe("free-tier-gate");
  });
  it("non-429 passes through to default parsing", () => {
    expect(ex.parseError({ status: 200 }, "ok")).toBeNull();
    expect(ex.parseError({ status: 500 }, "boom")).toBeNull();
  });
});

const creds = (rawHeaders = {}) => ({ connectionId: "noauth", rawHeaders });

describe("opencode client identity masquerade", () => {
  it("synthesizes a versioned UA by default", () => {
    const h = new OpenCodeExecutor().buildHeaders(creds(), false);
    expect(h["User-Agent"]).toMatch(/^opencode\/\d+\.\d+/i);
  });

  it("mints conforming session/request ids (20 samples)", () => {
    const ex = new OpenCodeExecutor();
    for (let i = 0; i < 20; i++) {
      ex.transformRequest("mimo-v2.5-free", { messages: [] }, false, creds());
      const h = ex.buildHeaders(creds(), false);
      expect(h["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
      expect(h["x-opencode-request"]).toMatch(OPENCODE_REQUEST_RE);
    }
  });

  it("forwards a genuine downstream CLI UA, replaces a bare one", () => {
    const ex = new OpenCodeExecutor();
    const genuine = "opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14";
    expect(ex.buildHeaders(creds({ "user-agent": genuine }), false)["User-Agent"]).toBe(genuine);
    expect(ex.buildHeaders(creds({ "user-agent": "opencode" }), false)["User-Agent"]).toMatch(/^opencode\/\d+\.\d+/i);
    expect(ex.buildHeaders(creds({ "user-agent": "curl/8.5.0" }), false)["User-Agent"]).toMatch(/^opencode\/\d+\.\d+/i);
  });

  it("replaces non-conforming downstream ids, keeps conforming ones", () => {
    const ex = new OpenCodeExecutor();
    const bad = ex.buildHeaders(creds({ "x-opencode-session": "ses_abcdef", "x-opencode-request": "zzz" }), false);
    expect(bad["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
    expect(bad["x-opencode-request"]).toMatch(OPENCODE_REQUEST_RE);
    const goodSes = "ses_88eace740ba32HQP4N6FgPkrtV";
    const goodReq = "msg_23a32080a7e8JFnCIPWivI4GFQ";
    const good = ex.buildHeaders(creds({ "x-opencode-session": goodSes, "x-opencode-request": goodReq }), false);
    expect(good["x-opencode-session"]).toBe(goodSes);
    expect(good["x-opencode-request"]).toBe(goodReq);
  });
});

describe("opencode gate decoy cloaking (upstream v0.5.81)", () => {
  const toolNames = (tools) => tools.map((t) => t?.function?.name || t?.name);
  const stubs = (...names) => names.map((n) => ({
    type: "function", function: { name: n, description: n, parameters: { type: "object", properties: {} } },
  }));

  it("appends missing decoy tools (bash, read) to client tools, keeps client tools", () => {
    const ex = new OpenCodeExecutor();
    const body = { model: "mimo-v2.5-free", messages: [], tool_choice: "none", tools: stubs("A", "B") };
    ex.transformRequest("mimo-v2.5-free", body, true, creds());
    const names = toolNames(body.tools);
    expect(names).toContain("bash");
    expect(names).toContain("read");
    expect(names).toContain("A");
    expect(names).toContain("B");
  });

  it("does not duplicate decoy tools already present", () => {
    const ex = new OpenCodeExecutor();
    const body = { model: "mimo-v2.5-free", messages: [], tools: stubs("read", "bash") };
    ex.transformRequest("mimo-v2.5-free", body, true, creds());
    const names = toolNames(body.tools);
    expect(names.filter((n) => n === "read")).toHaveLength(1);
    expect(names.filter((n) => n === "bash")).toHaveLength(1);
  });

  it("injects decoy tools when tools are empty", () => {
    const ex = new OpenCodeExecutor();
    const body = { model: "mimo-v2.5-free", messages: [] };
    ex.transformRequest("mimo-v2.5-free", body, true, creds());
    expect(toolNames(body.tools).sort()).toEqual(["bash", "read"]);
    expect(body.tool_choice).toBe("none");
  });

  it("matches free-tier ids with thinking suffix and families", async () => {
    const { isFreeTierGateModel } = await import("../../open-sse/config/opencodeAgentTools.js");
    expect(isFreeTierGateModel("mimo-v2.5-free")).toBe(true);
    expect(isFreeTierGateModel("muse-spark-1.3-contributor-free")).toBe(true);
    expect(isFreeTierGateModel("union-alpha")).toBe(true);
    expect(isFreeTierGateModel("mimo-v2.5-free(high)")).toBe(true);
    expect(isFreeTierGateModel("gpt-6-astra")).toBe(false);
    expect(isFreeTierGateModel("deepseek-v4-flash")).toBe(false);
    expect(isFreeTierGateModel("")).toBe(false);
  });
});
