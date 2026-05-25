const { checkAllDNSStatus } = require("./dnsConfig");

function getMitmDnsStatus() {
  return checkAllDNSStatus();
}

module.exports = {
  getMitmDnsStatus,
};
