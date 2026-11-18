const policy = require('./managementReviewPolicy');

// Annual management can be opened independently of the phase-review rollout.
// The restored-phase allowlist remains the fallback for Jin Juan's existing flow.
function enabled(patientId, env = process.env) {
  return env.ANNUAL_FLOW_MODE === 'all' || policy.restored(patientId, env);
}

function enabledForTask(task, env = process.env) {
  return policy.restored(task?.patientId, env)
    || (enabled(task?.patientId, env) && task?.formData?.annualFlowVersion === 2);
}

module.exports = { enabled, enabledForTask };
