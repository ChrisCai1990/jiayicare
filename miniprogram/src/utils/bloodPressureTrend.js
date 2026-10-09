function bloodPressureArm(record) {
  const text = String(record?.extra?.arm || record?.note || '');
  if (/左[臂手]/.test(text)) return '左臂';
  if (/右[臂手]/.test(text)) return '右臂';
  return '未标注';
}

function bloodPressurePoint(record) {
  const parts = String(record?.value || '').match(/\d+(?:\.\d+)?/g) || [];
  const sys = Number(record?.extra?.sys) > 0 ? Number(record.extra.sys) : Number(parts[0]);
  const dia = Number(record?.extra?.dia) > 0 ? Number(record.extra.dia) : Number(parts[1]);
  const date = new Date(record?.recordedAt);
  if (!(sys > 0 && dia > 0) || Number.isNaN(date.getTime())) return null;
  return { sys, dia, arm: bloodPressureArm(record), recordedAt: record.recordedAt, time: date.getTime() };
}

function bloodPressurePoints(records, limit = 12) {
  return (records || []).map(bloodPressurePoint).filter(Boolean)
    .sort((a, b) => a.time - b.time || ['左臂', '右臂', '未标注'].indexOf(a.arm) - ['左臂', '右臂', '未标注'].indexOf(b.arm))
    .slice(-limit);
}

function bloodPressurePointsForArm(records, arm, limit = 12) {
  return bloodPressurePoints(records, (records || []).length || 1)
    .filter(point => point.arm === arm).slice(-limit);
}

module.exports = { bloodPressureArm, bloodPressurePoint, bloodPressurePoints, bloodPressurePointsForArm };
