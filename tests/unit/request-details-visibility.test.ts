import { beforeEach, describe, expect, it, vi } from "vitest";

const SHUTDOWN_HANDLER_REGISTRY_KEY = Symbol.for("axonrouterPlus.requestDetailsDb.shutdownHandlers");

const getSettings = vi.fn(async () => ({
  enableObservability: true,
  observabilityBatchSize: 20,
  observabilityFlushIntervalMs: 60_000,
  observabilityMaxRecords: 200,
  observabilityMaxJsonSize: 5,
}));

vi.mock("@/lib/localDb", () => ({
  getSettings,
}));

vi.mock("@/lib/dataDir", () => ({
  getDataDir: () => "/tmp/axonrouter-tests",
}));

const state = {
  records: [],
  writeCalls: 0,
  writeImpl: async () => {},
};

vi.mock("lowdb", () => ({
  Low: class {
    constructor() {
      this.data = { records: state.records };
    }

    async read() {
      this.data = { records: state.records };
    }

    async write() {
      state.records = [...this.data.records];
      state.writeCalls += 1;
      await state.writeImpl();
    }
  },
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, maxTicks = 100) {
  for (let i = 0; i < maxTicks; i += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Timed out waiting for condition");
}

vi.mock("lowdb/node", () => ({
  JSONFile: class {
    constructor() {}
  },
}));

describe("requestDetailsDb visibility", () => {
  beforeEach(() => {
    const shutdownHandlers = globalThis[SHUTDOWN_HANDLER_REGISTRY_KEY];
    if (shutdownHandlers?.beforeExit) process.off("beforeExit", shutdownHandlers.beforeExit);
    if (shutdownHandlers?.SIGINT) process.off("SIGINT", shutdownHandlers.SIGINT);
    if (shutdownHandlers?.SIGTERM) process.off("SIGTERM", shutdownHandlers.SIGTERM);
    delete globalThis[SHUTDOWN_HANDLER_REGISTRY_KEY];

    vi.resetModules();
    getSettings.mockClear();
    state.records = [];
    state.writeCalls = 0;
    state.writeImpl = async () => {};
  });

  async function importRequestDetailsDbWithSignalHandlers() {
    const sigtermHandlersBefore = new Set(process.listeners("SIGTERM"));
    const requestDetailsDbModule = await import("../../src/lib/requestDetailsDb.ts");
    const sigtermHandler = process.listeners("SIGTERM").find((handler) => !sigtermHandlersBefore.has(handler));

    if (!sigtermHandler) {
      throw new Error("Failed to locate requestDetailsDb SIGTERM handler");
    }

    return { ...requestDetailsDbModule, sigtermHandler };
  }

  it("returns buffered records in read results before the next flush", async () => {
    const { saveRequestDetail, getRequestDetails, getRequestDetailById } = await import("../../src/lib/requestDetailsDb.ts");

    await saveRequestDetail({
      id: "detail-buffered",
      provider: "openai",
      model: "gpt-4.1",
      timestamp: "2026-04-25T00:00:00.000Z",
      status: 200,
    });

    const results = await getRequestDetails({ page: 1, pageSize: 10 });

    expect(results.details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "detail-buffered",
        provider: "openai",
        model: "gpt-4.1",
      }),
    ]));
    await expect(getRequestDetailById("detail-buffered")).resolves.toMatchObject({
      id: "detail-buffered",
      provider: "openai",
      model: "gpt-4.1",
    });
  });

  it("keeps force-flushed records visible through read APIs", async () => {
    const { saveRequestDetail, getRequestDetails, getRequestDetailById } = await import("../../src/lib/requestDetailsDb.ts");

    await saveRequestDetail({
      id: "detail-in-flight",
      provider: "openai",
      model: "gpt-4.1",
      timestamp: "2026-04-25T00:00:00.000Z",
      status: 200,
    }, { propagateError: true });

    const results = await getRequestDetails({ page: 1, pageSize: 10 });
    expect(results.details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "detail-in-flight",
        provider: "openai",
        model: "gpt-4.1",
      }),
    ]));
    await expect(getRequestDetailById("detail-in-flight")).resolves.toMatchObject({
      id: "detail-in-flight",
      provider: "openai",
      model: "gpt-4.1",
    });
  });

  it("keeps queued summary rows honest about missing usage and trace", async () => {
    const { saveRequestDetail, getRequestDetails } = await import("../../src/lib/requestDetailsDb.ts");

    await saveRequestDetail({
      id: "detail-queued-summary",
      provider: "openai",
      model: "gpt-4.1",
      timestamp: "2026-04-25T00:00:00.000Z",
      status: "success",
      tokens: {},
      request: {
        trace: {
          mode: "fallback",
          correlation_id: "corr-queued",
          events: [{ type: "route-picked" }],
        },
      },
      response: null,
      providerResponse: null,
    });

    const results = await getRequestDetails({ page: 1, pageSize: 10 });
    expect(results.details[0]).toMatchObject({
      id: "detail-queued-summary",
      provider: "openai",
      model: "gpt-4.1",
      correlationId: "corr-queued",
      tokens: {},
      traceSummary: {
        mode: "fallback",
        lastEventType: "route-picked",
        eventCount: 1,
      },
      request: expect.objectContaining({
        trace: expect.objectContaining({ correlation_id: "corr-queued" }),
      }),
      providerRequest: null,
      providerResponse: null,
      response: null,
    });
  });

  it("flushes queued records during shutdown", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined);

    try {
      const { saveRequestDetail, getRequestDetailById, sigtermHandler } = await importRequestDetailsDbWithSignalHandlers();

      await saveRequestDetail({
        id: "detail-shutdown-in-flight",
        provider: "openai",
        model: "gpt-4.1",
        timestamp: "2026-04-25T00:00:00.000Z",
        status: 200,
      });

      await sigtermHandler();

      expect(exitSpy).toHaveBeenCalledWith(143);
      await expect(getRequestDetailById("detail-shutdown-in-flight")).resolves.toMatchObject({
        id: "detail-shutdown-in-flight",
        provider: "openai",
        model: "gpt-4.1",
      });
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("keeps shutdown listener counts stable across module reloads", async () => {
    const baselineCounts = {
      beforeExit: process.listeners("beforeExit").length,
      SIGINT: process.listeners("SIGINT").length,
      SIGTERM: process.listeners("SIGTERM").length,
    };

    await import("../../src/lib/requestDetailsDb.ts");

    const countsAfterFirstImport = {
      beforeExit: process.listeners("beforeExit").length,
      SIGINT: process.listeners("SIGINT").length,
      SIGTERM: process.listeners("SIGTERM").length,
    };

    expect(countsAfterFirstImport).toEqual({
      beforeExit: baselineCounts.beforeExit + 1,
      SIGINT: baselineCounts.SIGINT + 1,
      SIGTERM: baselineCounts.SIGTERM + 1,
    });

    vi.resetModules();
    await import("../../src/lib/requestDetailsDb.ts");

    expect({
      beforeExit: process.listeners("beforeExit").length,
      SIGINT: process.listeners("SIGINT").length,
      SIGTERM: process.listeners("SIGTERM").length,
    }).toEqual(countsAfterFirstImport);

    vi.resetModules();
    await import("../../src/lib/requestDetailsDb.ts");

    expect({
      beforeExit: process.listeners("beforeExit").length,
      SIGINT: process.listeners("SIGINT").length,
      SIGTERM: process.listeners("SIGTERM").length,
    }).toEqual(countsAfterFirstImport);
  });
});
