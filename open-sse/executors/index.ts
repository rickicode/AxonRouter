import { AntigravityExecutor } from "./antigravity";
import { AzureExecutor } from "./azure";
import { GeminiCLIExecutor } from "./gemini-cli";
import { GithubExecutor } from "./github";
import { IFlowExecutor } from "./iflow";
import { QoderExecutor } from "./qoder";
import { KiroExecutor } from "./kiro";
import { CodexExecutor } from "./codex";
import { CursorExecutor } from "./cursor";
import { VertexExecutor } from "./vertex";
import { QwenExecutor } from "./qwen";
import { OpenCodeExecutor } from "./opencode";
import { OpenCodeGoExecutor } from "./opencode-go";
import { OpenCodeZenExecutor } from "./opencode-zen";
import { OpenCodeProviderExecutor } from "./opencode-provider";
import { GrokWebExecutor } from "./grok-web";
import { PerplexityWebExecutor } from "./perplexity-web";
import { FreebuffExecutor } from "./freebuff";
import { DefaultExecutor } from "./default";

const executors = {
  antigravity: new AntigravityExecutor(),
  azure: new AzureExecutor(),
  "gemini-cli": new GeminiCLIExecutor(),
  github: new GithubExecutor(),
  iflow: new IFlowExecutor(),
  qoder: new QoderExecutor(),
  kiro: new KiroExecutor(),
  "amazon-q": new KiroExecutor("amazon-q"),
  codex: new CodexExecutor(),
  cursor: new CursorExecutor(),
  cu: new CursorExecutor(), // Alias for cursor
  vertex: new VertexExecutor("vertex"),
  "vertex-partner": new VertexExecutor("vertex-partner"),
  qwen: new QwenExecutor(),
  opencode: new OpenCodeExecutor(),
  "opencode-go": new OpenCodeGoExecutor(),
  "opencode-zen": new OpenCodeZenExecutor(),
  "opencode-provider": new OpenCodeProviderExecutor(),
  "grok-web": new GrokWebExecutor(),
  "perplexity-web": new PerplexityWebExecutor(),
  freebuff: new FreebuffExecutor(),
};

const defaultCache = new Map();

export function getExecutor(provider) {
  if (executors[provider]) return executors[provider];
  if (!defaultCache.has(provider)) defaultCache.set(provider, new DefaultExecutor(provider));
  return defaultCache.get(provider);
}

export function hasSpecializedExecutor(provider) {
  return !!executors[provider];
}

export { BaseExecutor } from "./base";
export { AntigravityExecutor } from "./antigravity";
export { AzureExecutor } from "./azure";
export { GeminiCLIExecutor } from "./gemini-cli";
export { GithubExecutor } from "./github";
export { IFlowExecutor } from "./iflow";
export { QoderExecutor } from "./qoder";
export { KiroExecutor } from "./kiro";
export { CodexExecutor } from "./codex";
export { CursorExecutor } from "./cursor";
export { VertexExecutor } from "./vertex";
export { DefaultExecutor } from "./default";
export { QwenExecutor } from "./qwen";
export { OpenCodeExecutor } from "./opencode";
export { OpenCodeGoExecutor } from "./opencode-go";
export { OpenCodeZenExecutor } from "./opencode-zen";
export { OpenCodeProviderExecutor } from "./opencode-provider";
export { GrokWebExecutor } from "./grok-web";
export { PerplexityWebExecutor } from "./perplexity-web";
export { FreebuffExecutor } from "./freebuff";
