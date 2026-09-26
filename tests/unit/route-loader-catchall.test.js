import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { toHonoPath, buildParamsObject, getRouteScore, API_ROOT } from "../../src/server/routeLoader.mjs";
import path from "node:path";

describe("routeLoader Hono path conversion and param extraction", () => {
  it("converts catch-all [...slug] to Hono regex pattern :slug{.+}", () => {
    const combosCatchAll = path.join(API_ROOT, "combos", "[...id]", "route.js");
    const modelsCatchAll = path.join(API_ROOT, "v1", "models", "[...model]", "route.js");
    const geminiCatchAll = path.join(API_ROOT, "v1beta", "models", "[...path]", "route.js");

    expect(toHonoPath(combosCatchAll)).toBe("/api/combos/:id{.+}");
    expect(toHonoPath(modelsCatchAll)).toBe("/api/v1/models/:model{.+}");
    expect(toHonoPath(geminiCatchAll)).toBe("/api/v1beta/models/:path{.+}");
  });

  it("converts single dynamic segment [id] to :id", () => {
    const providerRoute = path.join(API_ROOT, "providers", "[id]", "route.js");
    expect(toHonoPath(providerRoute)).toBe("/api/providers/:id");
  });

  it("converts static route without params", () => {
    const combosRoute = path.join(API_ROOT, "combos", "route.js");
    expect(toHonoPath(combosRoute)).toBe("/api/combos");
  });

  it("builds params object with array for catch-all params and string for single params", () => {
    const honoParams1 = { id: "9e0ce51e-7437-4021-aa9f-1acf097cf963" };
    const parsed1 = buildParamsObject(honoParams1, "/api/combos/:id{.+}");
    expect(parsed1).toEqual({ id: ["9e0ce51e-7437-4021-aa9f-1acf097cf963"] });

    const honoParams2 = { id: "auto/coding" };
    const parsed2 = buildParamsObject(honoParams2, "/api/combos/:id{.+}");
    expect(parsed2).toEqual({ id: ["auto", "coding"] });

    const honoParams3 = { id: "prov_123" };
    const parsed3 = buildParamsObject(honoParams3, "/api/providers/:id");
    expect(parsed3).toEqual({ id: "prov_123" });
  });

  it("routes UUID and nested paths correctly in Hono instance", async () => {
    const app = new Hono();

    app.get("/api/combos", (c) => c.json({ route: "list" }));
    app.put("/api/combos/:id{.+}", (c) => {
      const params = buildParamsObject(c.req.param(), "/api/combos/:id{.+}");
      return c.json({ route: "update", params });
    });

    // Test GET collection
    const resList = await app.fetch(new Request("http://localhost/api/combos"));
    expect(resList.status).toBe(200);
    expect(await resList.json()).toEqual({ route: "list" });

    // Test PUT with UUID (the exact user bug scenario)
    const testUuid = "9e0ce51e-7437-4021-aa9f-1acf097cf963";
    const resPutUuid = await app.fetch(
      new Request(`http://localhost/api/combos/${testUuid}`, { method: "PUT" })
    );
    expect(resPutUuid.status).toBe(200);
    expect(await resPutUuid.json()).toEqual({
      route: "update",
      params: { id: [testUuid] },
    });

    // Test PUT with nested path
    const resPutNested = await app.fetch(
      new Request("http://localhost/api/combos/auto/coding", { method: "PUT" })
    );
    expect(resPutNested.status).toBe(200);
    expect(await resPutNested.json()).toEqual({
      route: "update",
      params: { id: ["auto", "coding"] },
    });
  });

  it("prioritizes literal subpaths before catch-all routes", async () => {
    const app = new Hono();

    // Literal route registered first
    app.get("/api/v1/models/info", (c) => c.json({ type: "info" }));
    // Catch-all route registered after
    app.get("/api/v1/models/:model{.+}", (c) => {
      const params = buildParamsObject(c.req.param(), "/api/v1/models/:model{.+}");
      return c.json({ type: "model", params });
    });

    const resInfo = await app.fetch(new Request("http://localhost/api/v1/models/info"));
    expect(resInfo.status).toBe(200);
    expect(await resInfo.json()).toEqual({ type: "info" });

    const resModel = await app.fetch(new Request("http://localhost/api/v1/models/openai/gpt-4"));
    expect(resModel.status).toBe(200);
    expect(await resModel.json()).toEqual({
      type: "model",
      params: { model: ["openai", "gpt-4"] },
    });
  });

  it("calculates route scores giving catch-all highest score to register last", () => {
    const staticRoute = path.join(API_ROOT, "combos", "route.js");
    const singleParamRoute = path.join(API_ROOT, "providers", "[id]", "route.js");
    const multiParamRoute = path.join(API_ROOT, "oauth", "[provider]", "[action]", "route.js");
    const catchAllRoute = path.join(API_ROOT, "combos", "[...id]", "route.js");

    const staticScore = getRouteScore(staticRoute);
    const singleScore = getRouteScore(singleParamRoute);
    const multiScore = getRouteScore(multiParamRoute);
    const catchAllScore = getRouteScore(catchAllRoute);

    expect(staticScore).toBe(2); // "api" (1) + "combos" (1)
    expect(singleScore).toBe(102); // "api" (1) + "providers" (1) + ":id" (100)
    expect(multiScore).toBe(202); // "api" (1) + "oauth" (1) + ":provider" (100) + ":action" (100)
    expect(catchAllScore).toBe(10002); // "api" (1) + "combos" (1) + ":id{.+} " (10000)

    expect(staticScore).toBeLessThan(singleScore);
    expect(singleScore).toBeLessThan(multiScore);
    expect(multiScore).toBeLessThan(catchAllScore);
  });

  it("handles path rewrites from /v1/* and /v1beta/* with catch-all params", async () => {
    const app = new Hono();

    app.get("/api/v1/models/:model{.+}", (c) => {
      const params = buildParamsObject(c.req.param(), "/api/v1/models/:model{.+}");
      return c.json({ matched: "models", params });
    });

    app.post("/api/v1beta/models/:path{.+}", (c) => {
      const params = buildParamsObject(c.req.param(), "/api/v1beta/models/:path{.+}");
      return c.json({ matched: "v1beta", params });
    });

    const rewriteToApi = async (c) => {
      let targetPath = c.req.path;
      if (targetPath.startsWith("/v1/")) targetPath = "/api" + targetPath;
      else if (targetPath.startsWith("/v1beta/")) targetPath = "/api" + targetPath;

      const url = new URL(c.req.url);
      url.pathname = targetPath;
      const newReq = new Request(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.raw.body,
        duplex: "half",
      });
      return app.fetch(newReq, c.env);
    };

    app.all("/v1/*", rewriteToApi);
    app.all("/v1beta/*", rewriteToApi);

    // Deep model path through rewrite
    const resV1 = await app.fetch(new Request("http://localhost/v1/models/openrouter/deepseek/deepseek-v4-flash-0731:free"));
    expect(resV1.status).toBe(200);
    expect(await resV1.json()).toEqual({
      matched: "models",
      params: { model: ["openrouter", "deepseek", "deepseek-v4-flash-0731:free"] },
    });

    // Native Gemini model path through rewrite
    const resV1beta = await app.fetch(new Request("http://localhost/v1beta/models/google/gemini-1.5-flash:generateContent", {
      method: "POST",
    }));
    expect(resV1beta.status).toBe(200);
    expect(await resV1beta.json()).toEqual({
      matched: "v1beta",
      params: { path: ["google", "gemini-1.5-flash:generateContent"] },
    });
  });

  it("handles combo names with special characters (dots, underscores, hyphens, slashes)", async () => {
    const complexName = "test.combo-1_v2/sub-model.fast";
    const honoParams = { id: complexName };
    const parsed = buildParamsObject(honoParams, "/api/combos/:id{.+}");
    expect(parsed).toEqual({ id: ["test.combo-1_v2", "sub-model.fast"] });
  });

  it("handles capability filter routes as single-element array in v1/models/[...model]", () => {
    const kinds = ["image", "tts", "stt", "embedding", "image-to-text", "web"];
    for (const kind of kinds) {
      const parsed = buildParamsObject({ model: kind }, "/api/v1/models/:model{.+}");
      expect(parsed).toEqual({ model: [kind] });
    }
  });
});
