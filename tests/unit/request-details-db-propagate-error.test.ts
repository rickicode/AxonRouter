import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("lowdb/node", () => ({
  JSONFile: class {
    constructor() {}
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

describe("requestDetailsDb propagateError durability", () => {
  beforeEach(() => {
    vi.resetModules();
    getSettings.mockClear();
    state.records = [];
    state.writeCalls = 0;
    state.writeImpl = async () => {};
  });

  it("durably persists forced request details", async () => {
    const { saveRequestDetail, getRequestDetailById } = await import("../../src/lib/requestDetailsDb.ts");

    await saveRequestDetail({ id: "detail-1", model: "gpt-4" }, { propagateError: true });
    await saveRequestDetail({ id: "detail-2", model: "gpt-4" }, { propagateError: true });

    await expect(getRequestDetailById("detail-1")).resolves.toMatchObject({ id: "detail-1" });
    await expect(getRequestDetailById("detail-2")).resolves.toMatchObject({ id: "detail-2" });
  });

  it("returns buffered request details before the next scheduled flush", async () => {
    const { saveRequestDetail, getRequestDetailById } = await import("../../src/lib/requestDetailsDb.ts");

    await saveRequestDetail({ id: "detail-buffered-force", model: "gpt-4" });

    await expect(getRequestDetailById("detail-buffered-force")).resolves.toMatchObject({
      id: "detail-buffered-force",
    });
  });
});
