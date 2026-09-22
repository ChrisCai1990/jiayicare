const { FIELD_MAP } = require('../config/archiveFields');
// Read projection only: retain baseline and provenance, replay confirmed changes
// in recording order; subsequent staff edits take precedence, including clears.
function effectiveLifestyle(user) {
  const result = { ...(user.lifestyle_data || {}) };
  const events = [];
  for (const row of user.archiveVersionHistory || []) {
    if (row.sourceType !== 'questionnaire' || !row.confirmedBy || !FIELD_MAP[row.path]
      || !row.path.startsWith('lifestyle_data.')) continue;
    const time = new Date(row.effectiveAt).getTime();
    if (Number.isFinite(time)) events.push({ time, key: row.path.slice(15), value: row.to });
  }
  for (const row of user.lifestyleHistory || []) {
    const time = new Date(row.recordedAt || row.effectiveAt).getTime();
    if (!Number.isFinite(time)) continue;
    for (const [key, change] of Object.entries(row.changes?.lifestyle_data || {})) {
      if (FIELD_MAP[`lifestyle_data.${key}`] && Object.hasOwn(change, 'to')) events.push({ time, key, value: change.to });
    }
  }
  events.sort((a, b) => a.time - b.time);
  for (const { key, value } of events) result[key] = value;
  return result;
}
module.exports = { effectiveLifestyle };
