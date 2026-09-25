const healthRollout = require('./healthManagementRollout');

function policy(env = process.env) {
  const mode = env.MONTHLY_REVIEW_ROLLOUT_MODE || (env.NODE_ENV === 'production' ? 'disabled' : 'all');
  const raw = String(env.MONTHLY_REVIEW_PATIENT_IDS || '').trim();
  const entries = raw ? raw.split(',').map(item => item.trim().toLowerCase()) : [];
  const valid = entries.length > 0 && entries.every(item => /^[a-f\d]{24}$/.test(item));
  return { mode: ['all', 'allowlist', 'disabled'].includes(mode) ? mode : 'disabled', ids: valid ? [...new Set(entries)] : [] };
}

function patientId(value) {
  const id = value?._id || value;
  return typeof id === 'string' ? id.toLowerCase() : typeof id?.toHexString === 'function' ? id.toHexString().toLowerCase() : '';
}

function enabledForPatient(value, env = process.env) {
  if (!healthRollout.enabledForPatient(value, env)) return false;
  const config = policy(env);
  return config.mode === 'all' || (config.mode === 'allowlist' && config.ids.includes(patientId(value)));
}

function patientFilter(field = 'patientId', env = process.env) {
  const config = policy(env);
  if (config.mode === 'disabled') return { [field]: { $in: [] } };
  const health = healthRollout.policy(env);
  if (health.mode === 'disabled') return { [field]: { $in: [] } };
  if (config.mode === 'all') return healthRollout.patientFilter(field, env);
  return { [field]: { $in: config.ids.filter(id => healthRollout.enabledForPatient(id, env)) } };
}

module.exports = { policy, enabledForPatient, patientFilter };
