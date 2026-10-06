const VERSION = 'cultural-preferences-20261006';
// Records the staff member's attestation, not a fabricated customer signature.
function culturalPreferencesConsent(body, existing, staffId, now = new Date()) {
  const values = {}, changed = [];
  for (const field of ['ethnicity', 'belief']) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string' || body[field].length > 100) throw new Error('民族或宗教信仰格式无效');
    values[field] = body[field].trim();
    if (values[field] !== String(existing?.[field] || '').trim()) changed.push(field);
  }
  const provided = changed.filter(field => values[field]);
  if (provided.length && body.culturalPreferencesConfirmed !== true) {
    throw new Error('请先说明民族及宗教信仰用途，并确认客户自愿提供；也可留空');
  }
  return { values, record: changed.length ? {
    version: VERSION, fields: changed, providedFields: provided,
    source: provided.length ? 'staff_attestation' : 'staff_clear',
    recordedBy: staffId, recordedAt: now,
  } : null };
}
module.exports = { culturalPreferencesConsent };
