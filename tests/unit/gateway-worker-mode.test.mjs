import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveGatewayMode } from "../../gateway/workerMode.mjs";

describe("Gateway Worker Mode Topology", () => {
  it("defaults to cluster mode when env is empty", () => {
    const res = resolveGatewayMode({}, 8);
    assert.equal(res.useCluster, true);
    assert.equal(res.mode, "cluster");
    assert.equal(res.workers, 8);
  });

  it("respects explicit GATEWAY_WORKERS count clamped to cores", () => {
    const res = resolveGatewayMode({ GATEWAY_WORKERS: "4" }, 8);
    assert.equal(res.useCluster, true);
    assert.equal(res.mode, "cluster");
    assert.equal(res.workers, 4);

    const clamped = resolveGatewayMode({ GATEWAY_WORKERS: "32" }, 4);
    assert.equal(clamped.workers, 4);
  });

  it("disables cluster mode when GATEWAY_CLUSTER=false", () => {
    for (const val of ["false", "0", "off", "no"]) {
      const res = resolveGatewayMode({ GATEWAY_CLUSTER: val, GATEWAY_WORKERS: "4" }, 8);
      assert.equal(res.useCluster, false);
      assert.equal(res.mode, "standalone");
      assert.equal(res.workers, 4);
    }
  });

  it("collapses to standalone when workers is 1 even if cluster is not explicitly off", () => {
    const res = resolveGatewayMode({ GATEWAY_WORKERS: "1" }, 8);
    assert.equal(res.useCluster, false);
    assert.equal(res.mode, "standalone");
    assert.equal(res.workers, 1);
  });

  it("handles 1 CPU machines by collapsing to standalone", () => {
    const res = resolveGatewayMode({}, 1);
    assert.equal(res.useCluster, false);
    assert.equal(res.mode, "standalone");
    assert.equal(res.workers, 1);
  });
});
