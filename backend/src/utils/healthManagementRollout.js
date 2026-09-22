// Patient-scoped rollout control, independent from authorization and job scheduling.
// Production defaults closed; never use a display name or a client-supplied flag.
function policy(env = process.env) {
  const mode = env.HEALTH_MANAGEMENT_ROLLOUT_MODE || (env.NODE_ENV === 'production' ? 'disabled' : 'all');
  const raw = String(env.HEALTH_MANAGEMENT_PATIENT_IDS || '').trim();
  const entries = raw ? raw.split(',').map(x => x.trim().toLowerCase()) : [];
  const valid = entries.length > 0 && entries.every(x => /^[a-f\d]{24}$/.test(x));
  return { mode: ['all', 'allowlist', 'disabled'].includes(mode) ? mode : 'disabled', ids: valid ? [...new Set(entries)] : [] };
}
function patientId(value) {
  if (!value) return '';
  const id = value._id || value;
  return typeof id === 'string' ? id.toLowerCase() : typeof id.toHexString === 'function' ? id.toHexString().toLowerCase() : '';
}
function enabledForPatient(value, env = process.env) {
  const config = policy(env);
  return config.mode === 'all' || (config.mode === 'allowlist' && config.ids.includes(patientId(value)));
}
function patientFilter(field = 'patientId', env = process.env) {
  const config = policy(env);
  return config.mode === 'all' ? {} : { [field]: { $in: config.mode === 'allowlist' ? config.ids : [] } };
}
function assertPatientEnabled(value) {
  if (!enabledForPatient(value)) throw Object.assign(new Error('该客户暂未开放新版健康管理闭环'), { statusCode: 403, code: 'HEALTH_MANAGEMENT_NOT_ENABLED' });
}
module.exports = { policy, enabledForPatient, patientFilter, assertPatientEnabled };
