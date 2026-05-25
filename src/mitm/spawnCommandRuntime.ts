function shellQuoteSingle(str) {
  if (str == null || str === "") return "''";
  return `'${String(str).replace(/'/g, "'\\''")}'`;
}

function buildSudoInlineCommand({ homeDir, apiKey, mitmRouterBase, execPath, serverPath }) {
  return [
    `HOME=${shellQuoteSingle(homeDir)}`,
    `ROUTER_API_KEY=${shellQuoteSingle(apiKey)}`,
    `MITM_ROUTER_BASE=${shellQuoteSingle(mitmRouterBase)}`,
    "NODE_ENV=production",
    shellQuoteSingle(execPath),
    "--experimental-strip-types",
    shellQuoteSingle(serverPath),
  ].join(" ");
}

module.exports = {
  shellQuoteSingle,
  buildSudoInlineCommand,
};
