const shanghaiDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

function comparableWeightChange(records = []) {
  const weights = records.filter(row => row.type === 'weight' && Number.isFinite(Number(row.value))
    && String(row.value).trim() !== '' && Number(row.value) > 0 && Number.isFinite(new Date(row.recordedAt).getTime()))
    .map(row => ({ date: shanghaiDay(row.recordedAt), value: Number(row.value), unit: row.unit || 'kg' }))
    .filter(row => row.unit === 'kg');
  if (weights.length < 2 || weights[0].date === weights.at(-1).date) return null;
  const first = weights[0], last = weights.at(-1);
  const delta = Math.round((last.value - first.value) * 10) / 10;
  return { first, last, count: weights.length, deltaKg: delta,
    observation: `体重记录：${first.date} ${first.value} kg → ${last.date} ${last.value} kg，${delta < 0 ? `下降${Math.abs(delta)}` : delta > 0 ? `上升${delta}` : '持平'} kg（仅描述记录值变化，测量条件待核对）` };
}

module.exports = { comparableWeightChange };
