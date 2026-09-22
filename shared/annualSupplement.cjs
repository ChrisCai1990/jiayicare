const keys = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'annual_checkup'];
const identity = row => String(row.items || row.name || row.department || row.standardPlanName || '').trim();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function supplementChanges(base = {}, proposed = {}) {
  const changes = [];
  for (const key of keys) {
    if (key === 'annual_checkup') {
      const row = proposed[key];
      if (!row?.enabled || !row.focus) continue;
      const before = base[key];
      const focus = [...new Set([...(String(before?.focus || '').split('\n')), ...String(row.focus).split('\n')].map(x => x.trim()).filter(Boolean))].join('\n');
      const after = before ? { ...before, focus, sourceIds: [...new Set([...(before.sourceIds || []), ...(row.sourceIds || [])])] } : row;
      if (!equal(before, after)) changes.push({ key, index: 0, label: '年度体检重点补充', before: before || null, after });
      continue;
    }
    for (const row of proposed[key]?.records || []) {
      const rows = base[key]?.records || [];
      const index = rows.findIndex(old => identity(old) && identity(old) === identity(row));
      const before = index >= 0 ? rows[index] : null;
      // Do not replace manually coordinated logistics with an AI's empty defaults.
      const logistics = before ? Object.fromEntries(['hospital', 'expert', 'serviceMode', 'serviceType', 'managedServiceType', 'followUpStaff'].filter(key => before[key] !== undefined && before[key] !== '').map(key => [key, before[key]])) : {};
      const after = before ? { ...before, ...row, ...logistics } : row;
      if (!equal(before, after)) changes.push({ key, index, label: identity(row) || key, before, after });
    }
  }
  return JSON.parse(JSON.stringify(changes));
}
function applySupplement(base, changes) {
  const next = JSON.parse(JSON.stringify(base));
  for (const change of changes) {
    if (!keys.includes(change.key)) throw new Error('不支持的方案板块');
    if (!change.after || typeof change.after !== 'object' || Array.isArray(change.after) || !Number.isInteger(change.index) || change.index < -1) throw new Error('修订内容格式无效');
    if (change.key === 'annual_checkup') {
      if (!equal(next[change.key] || null, change.before)) throw new Error('原方案已变化，请重新生成差异');
      next[change.key] = change.after;
    } else {
      const module = next[change.key] || { records: [] };
      const rows = [...(module.records || [])];
      if (change.index >= 0) {
        if (!equal(rows[change.index], change.before)) throw new Error('原事项已变化，请重新生成差异');
        rows[change.index] = change.after;
      } else if (!rows.some(row => equal(row, change.after))) rows.push(change.after);
      next[change.key] = { ...module, records: rows };
    }
  }
  return next;
}
module.exports = { supplementChanges, applySupplement };
