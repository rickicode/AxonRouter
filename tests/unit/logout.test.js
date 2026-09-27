import { describe, it, expect } from "vitest";
import { POST } from "../../src/app/api/auth/logout/route.js";
import { runWithRequestContext, cookies } from "../../src/lib/http/headers.js";

describe("POST /api/auth/logout", () => {
  it("clears auth_token and returns set-cookie deletion headers", async () => {
    const req = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "auth_token=valid-jwt-token; oidc_state=123" },
    });

    const res = await runWithRequestContext(req, () => POST());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
    const joined = setCookies.join("; ");
    expect(joined).toContain("auth_token=");
    expect(joined).toContain("Max-Age=0");
    expect(joined).toContain("Path=/");
  });

  it("handles cross-realm response objects in runWithRequestContext", async () => {
    const req = new Request("http://localhost/test", { method: "POST" });
    const res = await runWithRequestContext(req, async () => {
      const jar = await cookies();
      jar.set("test_cookie", "deleted", { maxAge: 0, path: "/" });
      // Plain Response object mimicking external realm
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    });

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    expect(setCookies.some((c) => c.includes("test_cookie="))).toBe(true);
  });
});
