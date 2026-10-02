// Independent pilot control for health risk discovery. Closed unless explicitly enabled.
function policy(env = process.env) {
  const mode = String(env.HEALTH_RISK_ROLLOUT_MODE || 'disabled').trim();
  const entries = String(env.HEALTH_RISK_PATIENT_IDS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const valid = entries.length > 0 && entries.every(x => /^[a-f\d]{24}$/.test(x));
  return { mode: ['all', 'allowlist', 'disabled'].includes(mode) && !(mode === 'all' && env.NODE_ENV === 'production') ? mode : 'disabled', ids: valid ? [...new Set(entries)] : [] };
}

function patientId(value) {
  const id = value?._id || value;
  if (typeof id === 'string') return id.toLowerCase();
  return typeof id?.toHexString === 'function' ? id.toHexString().toLowerCase() : '';
}

function enabledForPatient(value, env = process.env) {
  const config = policy(env);
  return config.mode === 'all' || (config.mode === 'allowlist' && config.ids.includes(patientId(value)));
}

function patientFilter(field = 'patientId', env = process.env) {
  const config = policy(env);
  return config.mode === 'all' ? {} : { [field]: { $in: config.mode === 'allowlist' ? config.ids : [] } };
}

module.exports = { policy, enabledForPatient, patientFilter };
