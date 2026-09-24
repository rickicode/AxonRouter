// Browser regression against real AnalyticsTab + production Tailwind CSS.
// Synthetic API fixture; no production authentication or database access.
// npm install --prefix /tmp/axonrouter-responsive-tools esbuild playwright-core
// node scripts/check-analytics-responsive.mjs
import { createRequire } from "node:module";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const tools = createRequire("/tmp/axonrouter-responsive-tools/package.json");
const { build } = tools("esbuild");
const { chromium } = tools("playwright-core");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const root = process.cwd();
const dir = await mkdtemp(path.join(tmpdir(), "analytics-responsive-"));
await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import AnalyticsTab from './src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js'; createRoot(document.getElementById('root')).render(<main style={{padding:16, minWidth:0}}><AnalyticsTab period="today" /></main>);`,
    resolveDir: root,
    loader: "jsx",
  },
  bundle: true,
  jsx: "automatic",
  loader: { ".js": "jsx" },
  alias: { "@": path.join(root, "src") },
  outfile: path.join(dir, "app.js"),
  define: { "process.env.NODE_ENV": '"production"' },
});
const cssFile = path.join(root, "src/app/globals.css");
const css = await postcss([tailwind({ base: root })]).process(
  await readFile(cssFile, "utf8"),
  { from: cssFile },
);
await writeFile(path.join(dir, "app.css"), css.css);
const row = {
  provider: "fixture-provider",
  model: "very-long-model-identifier-".repeat(8),
  count: 100,
  success_count: 90,
  failure_count: 10,
  p50_latency_ms: 200,
  p95_latency_ms: 1500,
  latency_samples: 100,
  total_input_tokens: 10000,
  total_output_tokens: 2000,
};
const fixture = {
  summary: {
    totalEvents: 100,
    successCount: 90,
    failureCount: 10,
    successRate: 90,
    p50LatencyMs: 200,
    p95LatencyMs: 1500,
    totalInputTokens: 10000,
    totalOutputTokens: 2000,
  },
  byModel: [row],
  timeline: Array.from({ length: 12 }, (_, i) => ({
    ...row,
    bucket: new Date(Date.UTC(2026, 8, 9, i)).toISOString(),
  })),
  errorDistribution: [
    { error_category: "upstream", count: 5 },
    { error_category: "rate_limit", count: 5 },
  ],
};
const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/usage/analytics")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(fixture));
      return;
    }
    if (req.url === "/app.js" || req.url === "/app.css") {
      res.setHeader(
        "content-type",
        req.url.endsWith(".js") ? "text/javascript" : "text/css",
      );
      res.end(await readFile(path.join(dir, req.url.slice(1))));
      return;
    }
    res.end(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>',
    );
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/sbin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function check(label) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  if (sizes.document > sizes.viewport + 1)
    console.log(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter(
            (e) => e.scrollWidth > e.clientWidth + 1 && !e.closest("table"),
          )
          .map((e) => ({
            tag: e.tagName,
            cls: e.getAttribute("class"),
            client: e.clientWidth,
            scroll: e.scrollWidth,
            overflow: getComputedStyle(e).overflowX,
          }))
          .slice(0, 30),
      ),
    );
  assert.ok(
    sizes.document <= sizes.viewport + 1,
    `${label}: overflow ${JSON.stringify(sizes)}`,
  );
  return sizes;
}
try {
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page
      .getByText("Model Performance Breakdown", { exact: true })
      .waitFor();
    await check("initial " + width);
    for (const label of [
      "Traffic Breakdown",
      "Success Rate %",
      "Latency (P50 / P95)",
      "Token Volume",
    ]) {
      await page
        .getByRole("button", {
          name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        })
        .click();
      await check(label + " " + width);
    }
    await page.getByLabel("Model filter", { exact: true }).fill(row.model);
    await page.getByLabel("Remove model filter").waitFor();
    await check("long filter " + width);
    await page.getByLabel("Remove model filter").click();
    await page.getByLabel("Auto refresh interval").selectOption("30");
    await page.getByRole("button", { name: /refresh.*Refresh/i }).click();
    await page.locator("table").waitFor();
    const table = await page
      .locator("table")
      .evaluate((el) => ({
        client: el.parentElement.clientWidth,
        scroll: el.parentElement.scrollWidth,
        overflow: getComputedStyle(el.parentElement).overflowX,
      }));
    assert.equal(table.overflow, "auto");
    if (width < 768) assert.ok(table.scroll > table.client);
    await page
      .getByRole("button")
      .filter({ hasText: "Rate Limit / Quota Exceeded" })
      .click();
    await page.getByLabel("Remove error category filter").waitFor();
    await check("error filter " + width);
    await page.getByLabel("Remove error category filter").click();
    await page.locator(".recharts-wrapper > svg.recharts-surface").first().waitFor();
    assert.ok(
      await page
        .locator(".recharts-wrapper > svg.recharts-surface")
        .first()
        .evaluate((el) => el.getBoundingClientRect().width > 100),
    );
    console.log(
      JSON.stringify({ width, status: "PASS", fixture: true, table }),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 6 widths, 4 chart modes, long filter, error filter, refresh, table containment; synthetic fixture.",
  );
} finally {
  await browser.close();
  server.close();
}
