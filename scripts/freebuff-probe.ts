#!/usr/bin/env node
import {
  FREEBUFF_DEFAULT_AGENT_ID,
  FREEBUFF_DEFAULT_CLIENT_ID,
  FREEBUFF_DEFAULT_MODEL,
  explainFreebuffError,
  extractFreebuffFingerprint,
  getFreebuffSession,
  sendFreebuffCompletion,
  startFreebuffRun,
} from "../src/lib/freebuff/probe.ts";

function parseArgs(argv: string[]) {
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }
    options[key] = next;
    i += 1;
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = args.token || process.env.CODEBUFF_API_KEY || process.env.FREEBUFF_API_KEY;
  if (!apiKey) {
    console.error("Missing API token. Use --token or set CODEBUFF_API_KEY.");
    process.exit(1);
  }

  const prompt = args.prompt || "Say hello in one word";
  const clientId = args.clientId || FREEBUFF_DEFAULT_CLIENT_ID;
  const agentId = args.agentId || FREEBUFF_DEFAULT_AGENT_ID;
  const model = args.model || FREEBUFF_DEFAULT_MODEL;

  console.log("== Freebuff session ==");
  const session = await getFreebuffSession(apiKey);
  console.log(JSON.stringify(session.data, null, 2));

  console.log("\n== Start run ==");
  const run = await startFreebuffRun(apiKey, agentId);
  console.log(JSON.stringify(run.data, null, 2));

  const runId = run.data?.runId;
  if (!runId) {
    console.error("No runId returned; aborting completion probe.");
    process.exit(2);
  }

  console.log("\n== Completion ==");
  const completion = await sendFreebuffCompletion(apiKey, {
    runId,
    prompt,
    clientId,
    model,
  });
  console.log(JSON.stringify(completion.data, null, 2));

  const fingerprint = extractFreebuffFingerprint(session.data);
  if (fingerprint) {
    console.log(`\nDerived fingerprint: ${fingerprint}`);
  }

  const explanation = explainFreebuffError(completion.data) || explainFreebuffError(session.data);
  if (explanation) {
    console.log(`\nInterpretation: ${explanation}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
