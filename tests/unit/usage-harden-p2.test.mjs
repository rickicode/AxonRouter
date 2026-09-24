import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAnalyticsCsv,
  downloadBlobCsv,
  formatMetric,
  fmtNumber,
} from "../../src/app/(dashboard)/dashboard/usage/components/analyticsData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

describe("[axonrouter-X usage] P2 harden silent fetch + Blob CSV + bilingual single-locale + tables a11y", () => {
  describe("1. Blob CSV Generation & Export Logic", () => {
    it("generates CSV with UTF-8 BOM, standard headers, and CRLF line breaks", () => {
      const sampleModels = [
        {
          provider: "openai",
          model: "gpt-4o",
          requests: 120,
          successes: 118,
          failures: 2,
          successRate: 0.9833,
          latencyMs: 420,
          p95: 850,
          inputTokens: 54000,
          outputTokens: 12000,
        },
      ];

      const csv = buildAnalyticsCsv(sampleModels);
      assert.ok(
        csv.startsWith("\uFEFF"),
        "CSV must start with UTF-8 BOM \\uFEFF",
      );
      assert.ok(
        csv.includes(
          "Provider,Model,Requests,Success,Failed,SuccessRate,P50_ms,P95_ms,InputTokens,OutputTokens",
        ),
      );
      assert.ok(
        csv.includes(
          '"openai","gpt-4o",120,118,2,"98.33%",420,850,54000,12000',
        ),
      );
    });

    it("escapes quotes, commas, and special characters inside cells", () => {
      const edgeModels = [
        {
          provider: 'custom, "special" provider',
          model: 'model/with, comma and "quotes"',
          requests: 5,
          successes: 5,
          failures: 0,
          successRate: 1.0,
          latencyMs: 150,
          p95: 200,
          inputTokens: 1000,
          outputTokens: 500,
        },
      ];

      const csv = buildAnalyticsCsv(edgeModels);
      assert.ok(csv.includes('""special""'));
      assert.ok(csv.includes('""quotes""'));
    });

    it("handles empty or missing model lists safely", () => {
      const emptyCsv = buildAnalyticsCsv([]);
      assert.ok(emptyCsv.startsWith("\uFEFF"));
      assert.ok(emptyCsv.includes("Provider,Model,Requests"));

      const nullCsv = buildAnalyticsCsv(null);
      assert.ok(nullCsv.startsWith("\uFEFF"));
    });

    it("downloadBlobCsv creates Blob with text/csv;charset=utf-8, creates and revokes ObjectURL", () => {
      let createdBlob = null;
      let createdUrl = null;
      let revokedUrl = null;
      let clicked = false;
      let appendedChild = null;
      let removedChild = null;

      const origBlob = globalThis.Blob;
      const origURL = globalThis.URL;
      const origDocument = globalThis.document;

      globalThis.Blob = class MockBlob {
        constructor(parts, options) {
          this.parts = parts;
          this.options = options;
          createdBlob = this;
        }
      };

      globalThis.URL = {
        createObjectURL: (blob) => {
          createdUrl = "blob:mock-url-" + Math.random();
          return createdUrl;
        },
        revokeObjectURL: (url) => {
          revokedUrl = url;
        },
      };

      const mockLink = {
        setAttribute: (k, v) => {
          mockLink[k] = v;
        },
        click: () => {
          clicked = true;
        },
      };

      globalThis.document = {
        createElement: (tag) => {
          assert.equal(tag, "a");
          return mockLink;
        },
        body: {
          appendChild: (el) => {
            appendedChild = el;
          },
          removeChild: (el) => {
            removedChild = el;
          },
        },
      };

      try {
        downloadBlobCsv(
          "\uFEFFheader1,header2\r\nval1,val2",
          "analytics-test.csv",
        );
        assert.ok(createdBlob, "Blob must be constructed");
        assert.equal(createdBlob.options?.type, "text/csv;charset=utf-8;");
        assert.equal(mockLink.href, createdUrl);
        assert.equal(mockLink.download, "analytics-test.csv");
        assert.equal(clicked, true);
        assert.equal(appendedChild, mockLink);
        assert.equal(removedChild, mockLink);
        assert.equal(
          revokedUrl,
          createdUrl,
          "ObjectURL must be revoked after download trigger",
        );
      } finally {
        globalThis.Blob = origBlob;
        globalThis.URL = origURL;
        globalThis.document = origDocument;
      }
    });
  });

  describe("2. Silent Fetch Hardening & Retry State", () => {
    it("RequestDetailsTab implements fetchError state and non-silent error catch", () => {
      const file = fs.readFileSync(
        path.join(
          ROOT,
          "src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js",
        ),
        "utf8",
      );
      assert.ok(
        file.includes("const [fetchError, setFetchError] = useState(null)"),
        "Must track fetchError state",
      );
      assert.ok(
        file.includes("if (!res.ok)"),
        "Must check res.ok on request-details",
      );
      assert.ok(
        file.includes('role="alert"'),
        "Must render accessible alert role for errors",
      );
      assert.ok(
        file.includes("Retry"),
        "Must provide user-clickable Retry button",
      );
    });

    it("UsageChart implements error state and non-silent error catch", () => {
      const file = fs.readFileSync(
        path.join(
          ROOT,
          "src/app/(dashboard)/dashboard/usage/components/UsageChart.js",
        ),
        "utf8",
      );
      assert.ok(
        file.includes("const [error, setError] = useState(null)"),
        "Must track chart error state",
      );
      assert.ok(
        file.includes("if (!res.ok)"),
        "Must check res.ok on chart fetch",
      );
      assert.ok(
        file.includes('role="alert"'),
        "Must render alert role on error",
      );
      assert.ok(
        file.includes("Retry"),
        "Must provide user-clickable Retry button",
      );
    });

    it("UsageStats implements statsError state and user-visible retry for initial and period failures", () => {
      const file = fs.readFileSync(
        path.join(ROOT, "src/shared/components/UsageStats.js"),
        "utf8",
      );
      assert.ok(
        file.includes("const [statsError, setStatsError] = useState(null)"),
        "Must track statsError state",
      );
      assert.ok(file.includes("if (!r.ok)"), "Must check r.ok on stats fetch");
      assert.ok(
        file.includes('role="alert"'),
        "Must render alert role for failed stats load",
      );
      assert.ok(file.includes("Retry"), "Must provide Retry button");
    });

    it("AnalyticsTab implements Retry button on analytics error", () => {
      const file = fs.readFileSync(
        path.join(
          ROOT,
          "src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js",
        ),
        "utf8",
      );
      assert.ok(
        file.includes("Retry"),
        "Must provide Retry button in error banner",
      );
      assert.ok(
        file.includes("setRefresh"),
        "Retry button must trigger refresh",
      );
    });
  });

  describe("3. Bilingual Single-Locale Standardization", () => {
    it("usage dashboard components contain ZERO Indonesian phrases", () => {
      const indoWords = [
        "Sedang Stream",
        "Lihat Detail",
        "Tidak ada request",
        "memantau request",
        "Tutup modal",
        "Selesai",
      ];
      const dir = path.join(
        ROOT,
        "src/app/(dashboard)/dashboard/usage/components",
      );
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));

      for (const f of files) {
        const content = fs.readFileSync(path.join(dir, f), "utf8");
        for (const w of indoWords) {
          assert.equal(
            content.toLowerCase().includes(w.toLowerCase()),
            false,
            `File ${f} still contains Indonesian phrase: "${w}"`,
          );
        }
      }
    });

    it("formats dates and numbers with consistent en-US single-locale", () => {
      assert.equal(formatMetric(1234567, "count"), "1,234,567");
      assert.equal(fmtNumber(9876543), "9,876,543");
      assert.equal(formatMetric(0.985, "successRate"), "98.5%");
      assert.equal(formatMetric(350, "latencyMs"), "350 ms");
    });
  });

  describe("4. Tables Accessibility (a11y)", () => {
    it("all data tables have aria-label attributes", () => {
      const tableFiles = [
        "src/app/(dashboard)/dashboard/usage/components/RealtimeRequestsCard.js",
        "src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js",
        "src/app/(dashboard)/dashboard/usage/components/AnalyticsModelTable.js",
        "src/app/(dashboard)/dashboard/usage/components/UsageTable.js",
        "src/app/(dashboard)/dashboard/usage/components/TopProvidersCard.js",
        "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.js",
      ];

      for (const rel of tableFiles) {
        const content = fs.readFileSync(path.join(ROOT, rel), "utf8");
        const tableMatches = [...content.matchAll(/<table[^>]*>/g)];
        assert.ok(tableMatches.length > 0, `Expected tables in ${rel}`);
        for (const match of tableMatches) {
          assert.ok(
            match[0].includes("aria-label="),
            `Table in ${rel} missing aria-label: ${match[0]}`,
          );
        }
      }
    });

    it("all table header elements (th) have explicit scope='col' or scope='row'", () => {
      const tableFiles = [
        "src/app/(dashboard)/dashboard/usage/components/RealtimeRequestsCard.js",
        "src/app/(dashboard)/dashboard/usage/components/RequestDetailsTab.js",
        "src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js",
        "src/app/(dashboard)/dashboard/usage/components/UsageTable.js",
        "src/app/(dashboard)/dashboard/usage/components/TopProvidersCard.js",
        "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.js",
      ];

      for (const rel of tableFiles) {
        const content = fs.readFileSync(path.join(ROOT, rel), "utf8");
        const thMatches = [
          ...content.matchAll(/<th\b(?![^>]*\bscope=)[^>]*>/g),
        ];
        assert.equal(
          thMatches.length,
          0,
          `Found <th> without scope in ${rel}: ${thMatches.map((m) => m[0]).join(", ")}`,
        );
      }
    });

    it("UsageTable headers implement aria-sort and interactive group rows have role='button'", () => {
      const file = fs.readFileSync(
        path.join(
          ROOT,
          "src/app/(dashboard)/dashboard/usage/components/UsageTable.js",
        ),
        "utf8",
      );
      assert.ok(
        file.includes("aria-sort="),
        "UsageTable must have aria-sort on sortable headers",
      );
      assert.ok(
        file.includes('role="button"'),
        "UsageTable group summary row must have role='button'",
      );
      assert.ok(
        file.includes("tabIndex={0}"),
        "UsageTable group summary row must be keyboard focusable",
      );
      assert.ok(
        file.includes("onKeyDown="),
        "UsageTable group summary row must handle keyboard interaction",
      );
    });

    it("AnalyticsTab model breakdown table rows are keyboard accessible with role='button'", () => {
      const file = fs.readFileSync(
        path.join(
          ROOT,
          "src/app/(dashboard)/dashboard/usage/components/AnalyticsModelTable.js",
        ),
        "utf8",
      );
      assert.ok(
        file.includes('role="button"'),
        "Clickable model row must have role='button'",
      );
      assert.ok(
        file.includes("tabIndex={0}"),
        "Clickable model row must be keyboard focusable",
      );
      assert.ok(
        file.includes("onKeyDown="),
        "Clickable model row must handle Enter/Space keys",
      );
      assert.ok(
        file.includes('<th scope="row"'),
        "First cell in row must be row header",
      );
    });
  });
});
