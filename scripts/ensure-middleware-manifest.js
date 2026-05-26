import fs from "node:fs";
import path from "node:path";

const standaloneDir = path.join(process.cwd(), ".next", "standalone");
const serverDir = path.join(process.cwd(), ".next", "server");
const standaloneServerDir = path.join(standaloneDir, ".next", "server");

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return true;
}

copyIfExists(
  path.join(serverDir, "middleware-manifest.json"),
  path.join(standaloneServerDir, "middleware-manifest.json"),
);

copyIfExists(
  path.join(serverDir, "proxy.js.nft.json"),
  path.join(standaloneServerDir, "proxy.js.nft.json"),
);

copyIfExists(
  path.join(serverDir, "middleware-build-manifest.js"),
  path.join(standaloneServerDir, "middleware-build-manifest.js"),
);

copyIfExists(
  path.join(serverDir, "middleware-react-loadable-manifest.js"),
  path.join(standaloneServerDir, "middleware-react-loadable-manifest.js"),
);

console.log("[Build] Created .next/standalone/.next/server/proxy.js.nft.json");

function copyDirectoryDereferenced(source, destination) {
  if (!fs.existsSync(source)) return false;
  const stat = fs.statSync(source);
  if (!stat.isDirectory()) return false;
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true, dereference: true });
  return true;
}

function materializeStandaloneExternalAliases() {
  const aliasDir = path.join(standaloneDir, ".next", "node_modules");
  if (!fs.existsSync(aliasDir)) return;

  for (const entry of fs.readdirSync(aliasDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    const aliasPath = path.join(aliasDir, entry.name);
    const realPath = fs.realpathSync(aliasPath);
    if (!copyDirectoryDereferenced(realPath, aliasPath)) continue;
    console.log(`[Build] Materialized standalone external alias ${entry.name}`);
  }
}

materializeStandaloneExternalAliases();
