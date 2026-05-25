import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const workerSource = fs.readFileSync(path.join(repoRoot, "cloud/src/index.ts"), "utf8");

describe("cloud Morph worker routes", () => {
  it("exposes the same morphllm endpoints as the local app", () => {
    expect(workerSource).toContain('path === "/morphllm/v1/chat/completions"');
    expect(workerSource).toContain('path === "/morphllm/v1/compact"');
    expect(workerSource).toContain('path === "/morphllm/v1/embeddings"');
    expect(workerSource).toContain('path === "/morphllm/v1/rerank"');
    expect(workerSource).toContain('path === "/morphllm/v1/models"');
    expect(workerSource).toContain('path === "/morphllm/chat/completions"');
    expect(workerSource).toContain('path === "/morphllm/compact"');
    expect(workerSource).toContain('path === "/morphllm/embeddings"');
    expect(workerSource).toContain('path === "/morphllm/rerank"');
    expect(workerSource).toContain('path === "/morphllm/models"');
  });

  it("uses runtime morph settings and shared-runtime Morph key failover", () => {
    expect(workerSource).toContain('const morph = runtimeConfig?.settings?.morph;');
    expect(workerSource).toContain('function getMorphKeyOrder(runtimeId: string, morphSettings: MorphSettings)');
    expect(workerSource).toContain('morphRotationCursors');
    expect(workerSource).toContain('const apiKeys = getMorphKeyOrder(runtimeId, morph);');
    expect(workerSource).toContain('AbortSignal.timeout(timeoutMs)');
  });

  it("aligns cloud bridge reasoning normalization with local shared helpers", () => {
    const bridgeSource = fs.readFileSync(path.join(repoRoot, "cloud/src/morphBridge.ts"), "utf8");

    expect(bridgeSource).toContain('splitMorphThinkBlocks');
    expect(bridgeSource).toContain('MORPH_FAST_MODELS');
    expect(bridgeSource).toContain('type: "reasoning"');
    expect(bridgeSource).toContain('reasoning_content');
    expect(bridgeSource).toContain('normalizeOpenAIChatResponse');
    expect(bridgeSource).toContain('createClaudeStreamingBridge');
    expect(bridgeSource).toContain('createResponsesStreamingBridge');
  });

  it("uses think normalization for cloud shared and native Morph chat routes", () => {
    expect(workerSource).toContain('createClaudeStreamingBridge');
    expect(workerSource).toContain('createResponsesStreamingBridge');
    expect(workerSource).toContain('normalizeOpenAIChatResponse(response)');
  });

  it("publishes the updated Morph fast model catalog in worker model discovery", () => {
    expect(workerSource).toContain('MORPH_FAST_MODELS');
    expect(workerSource).toContain('context_window: model.contextWindow');
    expect(workerSource).toContain('modalities: model.modalities');
    expect(workerSource).not.toContain('morph-embedding-v4", owned_by: "morph", name: "Morph Embedding v4"');
  });
});
