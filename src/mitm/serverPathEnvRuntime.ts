function isProductionServerPathMode() {
  return process.env.NODE_ENV === "production";
}

function getMitmServerPathOverride() {
  return process.env.MITM_SERVER_PATH || "";
}

module.exports = {
  isProductionServerPathMode,
  getMitmServerPathOverride,
};
