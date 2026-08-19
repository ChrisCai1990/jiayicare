function createOcrStageTimer(now = Date.now) {
  let activeStage = '';
  let stageStartedAt = now();
  const stageDurationsMs = {};

  const closeActiveStage = currentTime => {
    if (!activeStage) return;
    stageDurationsMs[activeStage] = (stageDurationsMs[activeStage] || 0)
      + Math.max(0, currentTime - stageStartedAt);
  };

  return {
    transition(stage) {
      const currentTime = now();
      if (stage === activeStage) return;
      closeActiveStage(currentTime);
      activeStage = String(stage || '');
      stageStartedAt = currentTime;
    },
    snapshot(extra = {}) {
      const currentTime = now();
      const durations = { ...stageDurationsMs };
      if (activeStage) {
        durations[activeStage] = (durations[activeStage] || 0)
          + Math.max(0, currentTime - stageStartedAt);
      }
      return {
        elapsedMs: Math.max(0, currentTime - stageStartedAt + Object.values(stageDurationsMs).reduce((sum, value) => sum + value, 0)),
        stageDurationsMs: durations,
        ...extra,
      };
    },
  };
}

module.exports = { createOcrStageTimer };
