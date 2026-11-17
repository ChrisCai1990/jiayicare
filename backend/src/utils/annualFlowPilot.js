const policy = require('./managementReviewPolicy');

// The existing restored-phase allowlist is the single source of truth for the
// annual-flow pilot. In production this list contains Jin Juan's patient ID.
function enabled(patientId, env = process.env) {
  return policy.restored(patientId, env);
}

module.exports = { enabled };
