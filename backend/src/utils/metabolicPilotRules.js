// Deterministic, descriptive feedback. No diagnosis, calorie prescription or inferred risk thresholds.
const VERSION = 'weight-awareness-v1';
const DAY = 86400000;
const ACTIONS = [
  { id: 'consistent-measurement', title: '让下次测量更容易比较', text: '下次可以使用同一台秤、选择相近时间，并记下测量条件。' },
  { id: 'meal-awareness', title: '观察一餐的感受', text: '选择一餐，记录吃了什么，以及餐前和餐后的饥饿、饱足感。' },
  { id: 'activity-awareness', title: '发现适合自己的活动', text: '回想今天让你感觉舒适的一次活动，记录形式和感受，作为下次选择的参考。' },
  { id: 'routine-awareness', title: '了解作息与自己的关系', text: '记录一次入睡、醒来时间和次日感受，看看哪些习惯更适合自己。' },
];
function dayKey(date) { return new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function stateOf(enrollment, now = new Date()) {
  if (!enrollment) return 'unavailable';
  if (['active','paused'].includes(enrollment.status) && new Date(enrollment.endsAt) <= now) return 'completed';
  return enrollment.status;
}
function canReceive(config, enrollment, now = new Date()) {
  return config?.enabled === true && enrollment?.allowed === true && stateOf(enrollment, now) === 'active';
}
function validWeight(record) {
  const raw = String(record?.value ?? '').trim();
  return record?.type === 'weight' && record.unit === 'kg' && /^\d+(\.\d+)?$/.test(raw)
    && Number(raw) > 0 && Number.isFinite(Number(raw)) && Number.isFinite(new Date(record.recordedAt).getTime());
}
function feedbackFor(record, history = [], now = new Date()) {
  const result = { version: VERSION, recordId: String(record._id), generatedAt: now.toISOString(),
    title: '健康数据已记录', text: '这次记录已加入你的健康档案。你可以结合自己的感受，选择一个愿意尝试的行动。',
    sourceIds: [String(record._id)], action: ACTIONS[0] };
  if (record.type === 'weight') {
    if (!validWeight(record)) return { ...result, text: '记录已保存，但数值或单位暂不能用于体重比较，请核对后再查看反馈。', kind: 'verify' };
    const earlier = history.filter(r => String(r._id) !== String(record._id) && validWeight(r)
      && new Date(r.recordedAt) < new Date(record.recordedAt)
      && dayKey(r.recordedAt) !== dayKey(record.recordedAt)).sort((a,b) => new Date(b.recordedAt) - new Date(a.recordedAt));
    const prev = earlier[0];
    result.title = `已记录体重 ${Number(record.value)} kg`;
    if (!prev) result.text = '这是当前可比较数据中的起点。暂时没有更早日期的有效体重记录，后续记录后可以查看变化。';
    else {
      const delta = Math.round((Number(record.value) - Number(prev.value)) * 100) / 100;
      result.sourceIds.push(String(prev._id));
      result.text = `与 ${dayKey(prev.recordedAt)} 的 ${Number(prev.value)} kg 相比，${delta === 0 ? '数值相同' : `${delta > 0 ? '增加' : '减少'} ${Math.abs(delta)} kg`}。这是两次测量的差异，不能据此判断减脂效果或代谢改善。`;
    }
  } else if (record.type === 'diet') result.action = ACTIONS[1];
  else if (record.type === 'exercise') result.action = ACTIONS[2];
  else if (record.type === 'sleep') result.action = ACTIONS[3];
  if (record.status === 'danger' || record.type === 'symptom') {
    result.text = '记录已保存。请留意原健康监测或不适记录中的提示；本反馈不评估症状轻重。如有明显不适，请及时寻求医疗帮助，不要等待线上反馈。';
    result.action = null;
  }
  return result;
}
function summaryFor(enrollment, records, now = new Date()) {
  const state = stateOf(enrollment, now);
  const start = enrollment.startedAt && new Date(enrollment.startedAt);
  const end = enrollment.endsAt && new Date(enrollment.endsAt);
  const days = start ? Math.max(0, Math.min(84, Math.floor((now - start) / DAY))) : 0;
  const relevant = records.filter(r => start && new Date(r.recordedAt) >= start && new Date(r.recordedAt) <= now && (!end || new Date(r.recordedAt) < end));
  const weights = relevant.filter(validWeight).sort((a,b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  const baseline = weights[0]; const latest = weights[weights.length - 1];
  const checkpoints = [28,56,84].filter(d => days >= d).map(day => {
    const rows = weights.filter(r => new Date(r.recordedAt) < new Date(start.getTime() + day * DAY));
    const first = rows[0], last = rows[rows.length - 1];
    return { day, recordedDays: new Set(rows.map(r => dayKey(r.recordedAt))).size,
      first: first ? { value: Number(first.value), date: dayKey(first.recordedAt) } : null,
      last: last ? { value: Number(last.value), date: dayKey(last.recordedAt) } : null,
      note: new Set(rows.map(r => dayKey(r.recordedAt))).size < 2 ? '可比较数据不足，暂不判断变化。' : '展示有效记录的测量变化，不作为疗效或代谢改善判定。',
      reflection: (enrollment.reflections || []).find(r => r.day === day)?.text || '' };
  });
  return { state, days, week: Math.min(12, Math.floor(days / 7) + 1), checkpoints,
    recordedDays: new Set(relevant.map(r => dayKey(r.recordedAt))).size,
    weights: weights.map(r => ({ id: String(r._id), value: Number(r.value), date: dayKey(r.recordedAt) })),
    baseline: baseline ? Number(baseline.value) : null, latest: latest ? Number(latest.value) : null,
    phase: days < 28 ? '了解自己的习惯与变化' : days < 56 ? '找到适合自己的健康行动' : days < 84 ? '巩固习惯，准备长期维持' : '回顾本期，选择下一步',
    action: ACTIONS[Math.min(3, Math.floor(days / 21))] };
}
module.exports = { VERSION, DAY, ACTIONS, dayKey, stateOf, canReceive, validWeight, feedbackFor, summaryFor };
