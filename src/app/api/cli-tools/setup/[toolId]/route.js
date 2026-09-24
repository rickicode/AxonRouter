import { generateBashScript } from "@/lib/cliSetup/bashGenerator.js";
import { generatePowerShellScript } from "@/lib/cliSetup/powershellGenerator.js";
import { TOOL_TEMPLATES } from "@/shared/constants/cliToolTemplates.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cli-tools/setup/[toolId]
 *
 * Serves dynamic shell scripts (Bash or PowerShell) to configure host CLI tools
 * pointing to this AxonRouter instance.
 *
 * Example usage:
 *   curl -fsSL "http://localhost:3777/api/cli-tools/setup/claude?baseUrl=http://localhost:3777&apiKey=sk_xxx&sonnet=cc/claude-sonnet-5" | bash
 *   irm "http://localhost:3777/api/cli-tools/setup/claude?format=ps1&baseUrl=http://localhost:3777&apiKey=sk_xxx" | iex
 */
export async function GET(request, { params }) {
  try {
    const { toolId } = await params;
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    const tpl = TOOL_TEMPLATES[toolId];
    if (!tpl) {
      return new Response(`Error: Tool '${toolId}' not supported for automated setup.\n`, {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const format = searchParams.get("format") === "ps1" ? "ps1" : "bash";
    const hostHeader = request.headers.get("host") || "localhost:3777";
    const protocol = request.headers.get("x-forwarded-proto") || (hostHeader.includes("localhost") ? "http" : "https");
    const inferredBaseUrl = `${protocol}://${hostHeader}`;

    const baseUrl = searchParams.get("baseUrl") || inferredBaseUrl;
    const apiKey = searchParams.get("apiKey") || "";
    const model = searchParams.get("model") || undefined;
    const subagentModel = searchParams.get("subagentModel") || undefined;
    const maxContextTokens = searchParams.get("maxContextTokens") || undefined;

    // Collect model mapping overrides (e.g. sonnet, opus, haiku, etc.)
    const models = {};
    if (model) models.model = model;
    if (searchParams.get("sonnet")) models.sonnet = searchParams.get("sonnet");
    if (searchParams.get("opus")) models.opus = searchParams.get("opus");
    if (searchParams.get("haiku")) models.haiku = searchParams.get("haiku");
    if (searchParams.get("fable")) models.fable = searchParams.get("fable");

    const modelsListParam = searchParams.get("modelsList");
    let modelsList;
    if (modelsListParam) {
      modelsList = modelsListParam.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const setupParams = {
      baseUrl,
      apiKey,
      model,
      subagentModel,
      models,
      modelsList,
      maxContextTokens,
    };

    let scriptContent = "";
    let contentType = "";
    let filename = "";

    if (format === "ps1") {
      scriptContent = generatePowerShellScript(toolId, setupParams);
      contentType = "text/plain; charset=utf-8";
      filename = `setup-${toolId}.ps1`;
    } else {
      scriptContent = generateBashScript(toolId, setupParams);
      contentType = "text/x-shellscript; charset=utf-8";
      filename = `setup-${toolId}.sh`;
    }

    return new Response(scriptContent, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(`Error generating setup script: ${err.message}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
