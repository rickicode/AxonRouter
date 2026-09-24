import { createAnalyticsRecorder } from "./analyticsRecorder.js";

// Observe the final translated response without buffering the response body.
// One event per routed account attempt; transparent proxy retries remain one attempt.
export async function observeChatAttempt(
  options,
  execute,
  makeRecorder = createAnalyticsRecorder,
) {
  if (options?.isTestRequest || options?.clientRawRequest?.headers?.["x-axonrouter-test-request"] === "1") {
    return execute(options);
  }
  const recorder = makeRecorder(options.modelInfo || {});
  let result;
  try {
    result = await execute(options);
  } catch (error) {
    recorder.finish(false, { error });
    throw error;
  }
  const response = result?.response;
  if (!result?.success || !response?.ok) {
    recorder.finish(false, {
      status: result?.status || response?.status,
      error: result?.error,
    });
    return result;
  }
  if (!response.body) {
    recorder.finish(true);
    return result;
  }
  const reader = response.body.getReader();
  const sse = (response.headers.get("content-type") || "").includes(
    "text/event-stream",
  );
  const decoder = new TextDecoder();
  let pending = "",
    failed = false,
    seenTerminal = false,
    invalid = false;
  const inspect = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (
      obj.error ||
      ["error", "response.failed", "response.incomplete"].includes(obj.type)
    )
      failed = true;
    const usage = obj.usage || obj.response?.usage || obj.message?.usage;
    if (usage) recorder.usage(usage);
    if (
      ["message_stop", "response.completed"].includes(obj.type) ||
      obj.choices?.some((c) => c.finish_reason)
    )
      seenTerminal = true;
  };
  const consume = (text, final = false) => {
    pending += text;
    if (sse) {
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      if (final && pending) {
        lines.push(pending);
        pending = "";
      }
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          seenTerminal = true;
          continue;
        }
        try {
          inspect(JSON.parse(data));
        } catch {
          /* Ignore non-JSON heartbeat. */
        }
      }
    } else if (final && !invalid) {
      try {
        inspect(JSON.parse(pending));
      } catch {
        invalid = true;
      }
    }
    if (pending.length > 1048576) {
      pending = "";
      invalid = true;
    }
  };
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          consume(decoder.decode(), true);
          recorder.finish(!failed && (!sse || seenTerminal), {
            status: response.status,
            error_category: sse && !seenTerminal ? "stream" : undefined,
          });
          controller.close();
          return;
        }
        consume(decoder.decode(chunk.value, { stream: true }));
        controller.enqueue(chunk.value);
      } catch (error) {
        recorder.finish(false, { error, error_category: "stream" });
        controller.error(error);
      }
    },
    async cancel(reason) {
      recorder.finish(false, { error_category: "cancelled" });
      await reader.cancel(reason);
    },
  });
  return {
    ...result,
    response: new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  };
}
