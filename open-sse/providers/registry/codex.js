import { withCodexReviewModels } from "../models/helpers.js";

// Codex CLI version seen by OpenAI's backend — single source for the Version /
// User-Agent identity headers. Bump when the installed codex CLI is upgraded.
const CODEX_CLI_VERSION = "0.159.0";
const GPT_6_LITE_THINKING_LEVELS = ["low", "medium", "high", "xhigh", "max"];

export default {
  id: "codex",
  priority: 30,
  alias: "cx",
  uiAlias: "cx",
  display: {
    name: "OpenAI Codex",
    icon: "code",
    color: "#3B82F6",
    website: "https://chatgpt.com/codex",
    notice: {
      signupUrl: "https://chatgpt.com/codex",
    },
    deprecated: true,
    deprecationNotice: "RISK_NOTICE",
    kindNotice: {
      image: "Requires a ChatGPT Plus (or higher) account. Free accounts are not supported for image generation.",
    },
  },
  category: "oauth",
  thinkingConfig: {
    options: [
      "auto",
      "none",
      "low",
      "medium",
      "high",
    ],
    defaultMode: "auto",
  },
  transport: {
    baseUrl: "https://chatgpt.com/backend-api/codex/responses",
    format: "openai-responses",
    forceStream: true,
    cliVersion: CODEX_CLI_VERSION,
    headers: {
      originator: "codex_cli_rs",
      "User-Agent": `codex_cli_rs/${CODEX_CLI_VERSION}`,
    },
    usage: {
      url: "https://chatgpt.com/backend-api/wham/usage",
      resetCreditsUrl: "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
      resetCreditsConsumeUrl: "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume",
    },
  },
  models: [
    { id: "gpt-6-luna", name: "GPT 6.0 Luna", responsesLite: true, thinkingLevels: GPT_6_LITE_THINKING_LEVELS },
    { id: "gpt-6-luna[1m]", name: "GPT 6.0 Luna (extended context)", upstreamModelId: "gpt-6-luna", responsesLite: true, thinkingLevels: GPT_6_LITE_THINKING_LEVELS },
    { id: "gpt-5.6-terra", name: "GPT 5.6 Terra" },
    { id: "gpt-5.6-terra[1m]", name: "GPT 5.6 Terra (extended context)", upstreamModelId: "gpt-5.6-terra" },
    { id: "gpt-5.6-terra-review", name: "GPT 5.6 Terra Review", upstreamModelId: "gpt-5.6-terra", quotaFamily: "review" },
    { id: "gpt-5.6-luna", name: "GPT 5.6 Luna" },
    { id: "gpt-5.6-luna[1m]", name: "GPT 5.6 Luna (extended context)", upstreamModelId: "gpt-5.6-luna" },
    { id: "gpt-5.6-luna-review", name: "GPT 5.6 Luna Review", upstreamModelId: "gpt-5.6-luna", quotaFamily: "review" },
    { id: "gpt-5.5", name: "GPT 5.5" },
    { id: "gpt-5.5-review", name: "GPT 5.5 Review", upstreamModelId: "gpt-5.5", quotaFamily: "review" },
    // Removed 2026-10-02 (models probe, 3/3 accounts, HTTP 400 "model is not supported
    // when using Codex with a ChatGPT account"): gpt-6.1-sol, gpt-6-astra(+[1m]),
    // gpt-6-sol(+[1m]), gpt-5.6-sol(+[1m],-review) and gpt-daybreak-blue-latest. The
    // remaining Sol/Astra ids are ChatGPT-plan gated upstream; Terra/Luna/5.5 are the
    // live set. Image rows gpt-image-{1.5,2,2.5,-flare,-sunburst}, gpt-5.6-sol-image,
    // gpt-5.5-image and gpt-5.3-image are gone too (image tool backend rejects them).
    { id: "gpt-reserve", name: "GPT Reserve" },
    // Codex CLI's auto-review virtual model. Unlike the "-review" variants above it is not derived
    // from a base model, so it is forwarded verbatim instead of having "-review" stripped (#1398).
    { id: "codex-auto-review", name: "Codex Auto Review", upstreamModelId: "codex-auto-review", quotaFamily: "review" },
    { id: "gpt-5.6-terra-image", name: "GPT 5.6 Terra Image", capabilities: ["text2img","edit"], params: ["size","quality","background","image_detail","output_format"], kind: "image" },
    { id: "gpt-5.6-luna-image", name: "GPT 5.6 Luna Image", capabilities: ["text2img","edit"], params: ["size","quality","background","image_detail","output_format"], kind: "image" },
  ],
  serviceKinds: ["llm","image"],
  oauth: {
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    scope: "openid profile email offline_access",
    codeChallengeMethod: "S256",
    fixedPort: 1455,
    callbackPath: "/auth/callback",
    extraParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
    // Access tokens live ~1h; a 5d lead rotated the refresh token on EVERY call.
    // OpenAI rotates the refresh token on each refresh and revokes the whole
    // session on reuse, so the over-eager lead logged accounts out.
    refreshLeadMs: 600000,
    refresh: {
      encoding: "form",
      scope: "openid profile email offline_access",
    },
    maxRefreshAgeMs: 691200000,
    trackRefreshAt: true,
  },
  features: {
    usage: true,
  },
};
