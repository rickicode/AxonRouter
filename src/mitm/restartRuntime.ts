function createMitmRestartState() {
  return {
    restartCount: 0,
    lastStartTime: 0,
    isRestarting: false,
  };
}

function shouldResetRestartCount(lastStartTime, resetWindowMs) {
  return Date.now() - lastStartTime >= resetWindowMs;
}

function selectRestartDelay(restartCount, delays) {
  return delays[Math.min(restartCount, delays.length - 1)];
}

module.exports = {
  createMitmRestartState,
  shouldResetRestartCount,
  selectRestartDelay,
};
