import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProviderConnections } from "../src/lib/localDb.ts";

async function main() {
  const outputDir = path.join(process.cwd(), "tmp");
  const outputPath = path.join(outputDir, "codex-provider-emails.txt");

  const connections = await getProviderConnections({ provider: "codex" });
  const normalizedEmails = Array.isArray(connections)
    ? connections
        .map((connection: any) => {
          const primaryEmail =
            typeof connection?.email === "string" ? connection.email.trim() : "";
          const displayNameEmail =
            typeof connection?.displayName === "string"
              ? connection.displayName.trim()
              : "";
          const nameEmail =
            typeof connection?.name === "string" ? connection.name.trim() : "";
          return (primaryEmail || displayNameEmail || nameEmail).toLowerCase();
        })
        .filter((email: string) => email.length > 0)
    : [];

  const uniqueEmails = [...new Set(normalizedEmails)];

  const gmailRows = uniqueEmails
    .filter((email: string) => email.toLowerCase().endsWith("@gmail.com"))
    .sort((left: string, right: string) => left.localeCompare(right));
  const otherRows = uniqueEmails
    .filter((email: string) => !email.toLowerCase().endsWith("@gmail.com"))
    .sort((left: string, right: string) => left.localeCompare(right));
  const rows = [...gmailRows, ...otherRows];

  const content = rows.join("\n") + (rows.length > 0 ? "\n" : "");

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, content, "utf8");

  console.log(`Wrote ${rows.length} Codex emails to ${outputPath}`);
}

main().catch((error) => {
  console.error("Failed to export Codex provider emails:", error);
  process.exitCode = 1;
});
