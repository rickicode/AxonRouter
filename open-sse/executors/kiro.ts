import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";
import { v4 as uuidv4 } from "uuid";
import { refreshKiroToken } from "../services/tokenRefresh";
import { proxyAwareFetch } from "../utils/proxyFetch";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

class ByteQueue {
  chunks: Uint8Array[];
  headOffset: number;
  length: number;

  constructor() {
    this.chunks = [];
    this.headOffset = 0;
    this.length = 0;
  }

  push(chunk) {
    if (!(chunk instanceof Uint8Array) || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  peekUint32BE(offset = 0) {
    if (this.length < offset + 4) return null;

    let value = 0;
    for (let i = 0; i < 4; i++) {
      value = (value << 8) | this.byteAt(offset + i);
    }
    return value >>> 0;
  }

  read(length) {
    if (length < 0 || this.length < length) return null;

    const output = new Uint8Array(length);
    let written = 0;

    while (written < length) {
      const head = this.chunks[0];
      const available = head.length - this.headOffset;
      const take = Math.min(available, length - written);
      output.set(head.subarray(this.headOffset, this.headOffset + take), written);
      written += take;
      this.headOffset += take;
      this.length -= take;

      if (this.headOffset >= head.length) {
        this.chunks.shift();
        this.headOffset = 0;
      }
    }

    return output;
  }

  byteAt(offset) {
    let remaining = offset;
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const start = i === 0 ? this.headOffset : 0;
      const available = chunk.length - start;
      if (remaining < available) {
        return chunk[start + remaining];
      }
      remaining -= available;
    }
    return 0;
  }
}

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildKiroFinishChunk(state, responseId, created, model, includeUsage) {
  const finishChunk: any = {
    id: responseId,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: state.hasToolCalls ? "tool_calls" : "stop",
      },
    ],
  };

  if (includeUsage && state.usage) {
    finishChunk.usage = state.usage;
  }

  return finishChunk;
}

function ensureKiroUsage(state) {
  if (state.usage) return;

  const estimatedOutputTokens =
    state.totalContentLength && state.totalContentLength > 0
      ? Math.max(1, Math.floor(state.totalContentLength / 4))
      : 0;

  const estimatedInputTokens =
    state.contextUsagePercentage && state.contextUsagePercentage > 0
      ? Math.floor((state.contextUsagePercentage * 200000) / 100)
      : 0;

  if (estimatedInputTokens <= 0 && estimatedOutputTokens <= 0) return;

  state.usage = {
    prompt_tokens: estimatedInputTokens,
    completion_tokens: estimatedOutputTokens,
    total_tokens: estimatedInputTokens + estimatedOutputTokens,
  };
}

function summarizeKiroPayloadForLogs(payload) {
  const state = payload?.conversationState || {};
  const current = state?.currentMessage?.userInputMessage || {};
  const ctx = current?.userInputMessageContext || {};
  const history = Array.isArray(state?.history) ? state.history : [];

  return {
    providerMode: payload?.profileArn ? "profile" : "builder-id",
    conversationId: state?.conversationId || null,
    chatTriggerType: state?.chatTriggerType || null,
    hasProfileArn: Boolean(payload?.profileArn),
    hasInferenceConfig: Boolean(payload?.inferenceConfig),
    historyLength: history.length,
    currentModelId: current?.modelId || null,
    currentOrigin: current?.origin || null,
    currentContentLength: typeof current?.content === "string" ? current.content.length : 0,
    toolCount: Array.isArray(ctx?.tools) ? ctx.tools.length : 0,
    toolResultCount: Array.isArray(ctx?.toolResults) ? ctx.toolResults.length : 0,
    hasAgentContinuationId: Boolean(state?.agentContinuationId),
    hasAgentTaskType: Boolean(state?.agentTaskType),
  };
}

function sanitizeKiroErrorText(bodyText) {
  return String(bodyText || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/"accessToken"\s*:\s*"[^"]+"/gi, '"accessToken":"[redacted]"')
    .replace(/"refreshToken"\s*:\s*"[^"]+"/gi, '"refreshToken":"[redacted]"')
    .slice(0, 2000);
}

async function logKiroErrorResponse(response, context) {
  if (!response || response.ok) return;

  let bodyText = "";
  try {
    bodyText = await response.clone().text();
  } catch {
    bodyText = "";
  }

  console.log("[KIRO_ERROR]", JSON.stringify({
    status: response.status,
    statusText: response.statusText,
    context,
    body: sanitizeKiroErrorText(bodyText),
  }));
}

export class KiroExecutor extends BaseExecutor {
  constructor(providerId = "kiro") {
    super(providerId, PROVIDERS[providerId] || PROVIDERS.kiro);
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    // builder-id accounts (no profileArn) use the Q Developer endpoint
    const profileArn = credentials?.providerSpecificData?.profileArn;
    if (!profileArn) {
      return "https://q.us-east-1.amazonaws.com/generateAssistantResponse";
    }
    return "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse";
  }

  buildHeaders(credentials, stream = true) {
    void stream;
    const headers = {
      ...this.config.headers,
      "Amz-Sdk-Request": "attempt=1; max=3",
      "Amz-Sdk-Invocation-Id": uuidv4(),
      "x-amzn-bedrock-cache-control": "enable",
      "anthropic-beta": "prompt-caching-2024-07-31",
    };

    if (credentials.accessToken) {
      headers.Authorization = `Bearer ${credentials.accessToken}`;
    }

    return headers;
  }

  transformRequest(model, body, stream, credentials) {
    void stream;
    void credentials;
    const { model: _model, __axonDebug, ...rest } = body || {};
    return rest;
  }

  async execute({ model, body, stream, credentials, signal, proxyOptions = null }) {
    const url = this.buildUrl(model, stream, 0, credentials);
    const headers = this.buildHeaders(credentials, stream);
    const transformedBody = await this.transformRequest(model, body, stream, credentials);
    const debugMeta = body?.__axonDebug || summarizeKiroPayloadForLogs(transformedBody);

    console.log("[KIRO_REQUEST]", JSON.stringify({
      url,
      mode: debugMeta?.providerMode || (credentials?.providerSpecificData?.profileArn ? "profile" : "builder-id"),
      debug: debugMeta,
    }));

    // Use HTTP/2 for accounts with profileArn (CodeWhisperer endpoint requires H2 for toolResults/toolUses)
    // Fall back to HTTP/1.1 fetch for builder-id accounts (q.us-east-1.amazonaws.com)
    const useHttp2 = credentials?.providerSpecificData?.profileArn;
    let response: any;

    if (useHttp2) {
      response = await this.executeHttp2(url, headers, transformedBody, signal);
    } else {
      response = await proxyAwareFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(transformedBody),
        signal,
      }, proxyOptions);
    }

    if (!response.ok) {
      await logKiroErrorResponse(response, {
        url,
        mode: debugMeta?.providerMode || (credentials?.providerSpecificData?.profileArn ? "profile" : "builder-id"),
        debug: debugMeta,
      });
      return { response, url, headers, transformedBody };
    }

    const transformedResponse = this.transformEventStreamToSSE(response, model);
    return { response: transformedResponse, url, headers, transformedBody };
  }

  async executeHttp2(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
    const http2 = await import("http2");
    const urlObj = new URL(url);
    const payload = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const client = http2.connect(`${urlObj.protocol}//${urlObj.host}`);
      client.on("error", reject);

      if (signal?.aborted) {
        client.destroy();
        return reject(new Error("Request aborted"));
      }
      signal?.addEventListener("abort", () => { client.destroy(); }, { once: true });

      const reqHeaders: Record<string, string | number> = {
        ":method": "POST",
        ":path": urlObj.pathname,
        "content-length": Buffer.byteLength(payload),
      };
      for (const [k, v] of Object.entries(headers)) {
        reqHeaders[k.toLowerCase()] = v;
      }

      const req = client.request(reqHeaders);
      req.write(payload);
      req.end();

      let statusCode = 200;
      const responseHeaders: Record<string, string> = {};
      let resolved = false;

      req.on("response", (h) => {
        statusCode = Number(h[":status"]) || 200;
        for (const [k, v] of Object.entries(h)) {
          if (!k.startsWith(":")) responseHeaders[k] = String(v);
        }

        // Return a streaming Response immediately so transformEventStreamToSSE can process chunks
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        req.on("data", (chunk: Buffer) => {
          writer.write(chunk).catch(() => {});
        });
        req.on("end", () => {
          writer.close().catch(() => {});
          client.destroy();
        });
        req.on("error", (e) => {
          writer.abort(e).catch(() => {});
          client.destroy();
        });

        resolved = true;
        resolve(new Response(readable, { status: statusCode, headers: responseHeaders }));
      });

      req.on("error", (e) => {
        if (!resolved) { client.destroy(); reject(e); }
      });
    });
  }

  transformEventStreamToSSE(response, model) {
    const buffer = new ByteQueue();
    let chunkIndex = 0;
    const responseId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const state: any = {
      endDetected: false,
      finishEmitted: false,
      hasToolCalls: false,
      toolCallIndex: 0,
      seenToolIds: new Map(),
    };

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        buffer.push(chunk);

        let iterations = 0;
        const maxIterations = 1000;
        while (buffer.length >= 16 && iterations < maxIterations) {
          iterations++;
          const totalLength = buffer.peekUint32BE(0);

          // Guard against corrupt frames: max 10MB per frame
          if (!totalLength || totalLength < 16) break;
          if (totalLength > 10 * 1024 * 1024) {
            // Corrupt frame header - discard 1 byte and retry
            buffer.read(1);
            continue;
          }
          if (totalLength > buffer.length) break;

          const eventData = buffer.read(totalLength);
          if (!eventData) break;

          const event = parseEventFrame(eventData);
          if (!event) continue;

          const eventType = event.headers[":event-type"] || "";

          if (!state.totalContentLength) state.totalContentLength = 0;
          if (!state.contextUsagePercentage) state.contextUsagePercentage = 0;

          if (eventType === "assistantResponseEvent") {
            const content = typeof event.payload?.content === "string" ? event.payload.content : "";
            if (!content) continue;
            state.totalContentLength += content.length;

            const chunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: chunkIndex === 0 ? { role: "assistant", content } : { content },
                  finish_reason: null,
                },
              ],
            };
            chunkIndex++;
            controller.enqueue(TEXT_ENCODER.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          if (eventType === "codeEvent" && event.payload?.content) {
            const chunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: event.payload.content },
                  finish_reason: null,
                },
              ],
            };
            chunkIndex++;
            controller.enqueue(TEXT_ENCODER.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          if (eventType === "toolUseEvent" && event.payload) {
            state.hasToolCalls = true;
            const toolUse = event.payload;
            const toolUses = Array.isArray(toolUse) ? toolUse : [toolUse];

            for (const singleToolUse of toolUses) {
              // Skip malformed payloads (e.g. {raw: "..."} from JSON parse failure)
              if (!singleToolUse.toolUseId && !singleToolUse.name && singleToolUse.raw !== undefined) continue;

              const toolCallId = singleToolUse.toolUseId || `call_${state.toolCallIndex}`;
              const toolName = singleToolUse.name || "";
              const toolInput = singleToolUse.input;

              let toolIndex;
              const isNewTool = !state.seenToolIds.has(toolCallId);

              if (isNewTool) {
                toolIndex = state.toolCallIndex++;
                state.seenToolIds.set(toolCallId, toolIndex);

                const startChunk = {
                  id: responseId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        ...(chunkIndex === 0 ? { role: "assistant" } : {}),
                        tool_calls: [
                          {
                            index: toolIndex,
                            id: toolCallId,
                            type: "function",
                            function: {
                              name: toolName,
                              arguments: "",
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
                chunkIndex++;
                controller.enqueue(TEXT_ENCODER.encode(`data: ${JSON.stringify(startChunk)}\n\n`));
              } else {
                toolIndex = state.seenToolIds.get(toolCallId);
              }

              if (toolInput !== undefined) {
                let argumentsStr;

                if (typeof toolInput === "string") {
                  argumentsStr = toolInput;
                } else if (typeof toolInput === "object") {
                  argumentsStr = JSON.stringify(toolInput);
                } else {
                  continue;
                }

                const argsChunk = {
                  id: responseId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: toolIndex,
                            function: {
                              arguments: argumentsStr,
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
                chunkIndex++;
                controller.enqueue(TEXT_ENCODER.encode(`data: ${JSON.stringify(argsChunk)}\n\n`));
              }
            }
          }

          if (eventType === "messageStopEvent") {
            // messageStopEvent signals end of text content; finish is emitted in flush()
          }

          if (eventType === "contextUsageEvent") {
            const contextUsage =
              typeof event.payload?.contextUsagePercentage === "number"
                ? event.payload.contextUsagePercentage
                : 0;
            if (contextUsage <= 0) {
              continue;
            }
            state.contextUsagePercentage = contextUsage;
            state.hasContextUsage = true;
          }

          if (eventType === "meteringEvent") {
            state.hasMeteringEvent = true;
          }

          if (eventType === "metricsEvent") {
            const metrics = event.payload?.metricsEvent || event.payload;
            if (metrics && typeof metrics === "object") {
              const inputTokens = typeof metrics.inputTokens === "number" ? metrics.inputTokens : 0;
              const outputTokens = typeof metrics.outputTokens === "number" ? metrics.outputTokens : 0;
              const cacheReadTokens = typeof metrics.cacheReadTokens === "number" ? metrics.cacheReadTokens : 0;
              const cacheCreationTokens = typeof metrics.cacheCreationTokens === "number" ? metrics.cacheCreationTokens : 0;

              if (inputTokens > 0 || outputTokens > 0) {
                state.usage = {
                  prompt_tokens: inputTokens,
                  completion_tokens: outputTokens,
                  total_tokens: inputTokens + outputTokens,
                  ...(cacheReadTokens > 0 && { cache_read_input_tokens: cacheReadTokens }),
                  ...(cacheCreationTokens > 0 && {
                    cache_creation_input_tokens: cacheCreationTokens,
                  }),
                };
              }
            }
          }
        }

        if (iterations >= maxIterations) {
          console.warn("[Kiro] Max iterations reached in event parsing");
        }
      },

      flush(controller) {
        if (!state.finishEmitted) {
          state.finishEmitted = true;
          ensureKiroUsage(state);
          const finishChunk = buildKiroFinishChunk(state, responseId, created, model, true);
          controller.enqueue(TEXT_ENCODER.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
        }

        controller.enqueue(TEXT_ENCODER.encode("data: [DONE]\n\n"));
      },
    });

    const transformedStream = response.body.pipeThrough(transformStream);

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  async refreshCredentials(credentials, log) {
    if (!credentials.refreshToken) return null;

    try {
      const result = await refreshKiroToken(
        credentials.refreshToken,
        credentials.providerSpecificData,
        log
      );

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log?.error?.("TOKEN", `Kiro refresh error: ${err.message}`);
      return null;
    }
  }
}

function parseEventFrame(data) {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    const headersLength = view.getUint32(4, false);

    const preludeCRC = view.getUint32(8, false);
    const computedPreludeCRC = crc32(data.slice(0, 8));
    if (preludeCRC !== computedPreludeCRC) {
      console.warn(
        `[Kiro] Prelude CRC mismatch: expected ${preludeCRC}, got ${computedPreludeCRC} — skipping corrupted frame`
      );
      return null;
    }

    const messageCRC = view.getUint32(data.length - 4, false);
    const computedMessageCRC = crc32(data.slice(0, data.length - 4));
    if (messageCRC !== computedMessageCRC) {
      console.warn(
        `[Kiro] Message CRC mismatch: expected ${messageCRC}, got ${computedMessageCRC} — skipping corrupted frame`
      );
      return null;
    }

    const headers = {};
    let offset = 12;
    const headerEnd = 12 + headersLength;

    while (offset < headerEnd && offset < data.length) {
      const nameLen = data[offset];
      offset++;
      if (offset + nameLen > data.length) break;

      const name = TEXT_DECODER.decode(data.subarray(offset, offset + nameLen));
      offset += nameLen;

      const headerType = data[offset];
      offset++;

      if (headerType === 7) {
        const valueLen = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        if (offset + valueLen > data.length) break;

        const value = TEXT_DECODER.decode(data.subarray(offset, offset + valueLen));
        offset += valueLen;
        headers[name] = value;
      } else {
        break;
      }
    }

    const payloadStart = 12 + headersLength;
    const payloadEnd = data.length - 4;

    let payload = null;
    if (payloadEnd > payloadStart) {
      const payloadStr = TEXT_DECODER.decode(data.subarray(payloadStart, payloadEnd));

      if (!payloadStr || !payloadStr.trim()) {
        return { headers, payload: null };
      }

      try {
        payload = JSON.parse(payloadStr);
      } catch (parseError) {
        const err = parseError instanceof Error ? parseError : new Error(String(parseError));
        console.warn(
          `[Kiro] Failed to parse payload: ${err.message} | payload: ${payloadStr.substring(0, 100)}`
        );
        payload = { raw: payloadStr };
      }
    }

    return { headers, payload };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.warn(`[Kiro] Frame parse error: ${error.message}`);
    return null;
  }
}

export default KiroExecutor;
