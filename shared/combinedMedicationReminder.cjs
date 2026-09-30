const { schedule, beijingDate } = require('./medicationReminder.cjs');
const SOURCE_KEY = 'medication:combined';
function groupedSlots(meds, from = new Date()) {
  const grouped = new Map();
  for (const med of meds) {
    if (med.stopped || med.active === false || !med.reminder?.enabled) continue;
    const r = med.reminder;
    const ends = [r.endDate, med.endDate].filter(Boolean).sort();
    const endDate = ends[0] || '';
    if (endDate && endDate < beijingDate(from)) continue;
    let dates;
    try { dates = schedule({ ...r, endDate }, med, from).dates; }
    catch (error) {
      if (error.message.startsWith('所选日期内已无未来')) continue;
      throw error;
    }
    for (const { date, time } of dates) {
      const key = +date;
      if (!grouped.has(key)) grouped.set(key, { date, time, medications: [] });
      grouped.get(key).medications.push({ id: String(med._id), name: med.name, dosage: med.dosage,
        frequency: med.frequency, timing: med.timing || '', note: r.note || '' });
    }
  }
  return [...grouped.values()].sort((a,b) => +a.date - +b.date);
}
function medicationLine(med) {
  return `${med.name}：${med.dosage}，${med.frequency}${med.timing ? `，${med.timing}` : '（服用时机以原医嘱为准）'}${med.note ? `；${med.note}` : ''}`;
}
function slotContent(slot) {
  return `${slot.time} 用药提醒\n请按原医嘱核对本次用药：\n${slot.medications.map(medicationLine).join('\n')}\n如有疑问或不适，请联系健管专员；不要自行调整用药。`;
}
module.exports = { SOURCE_KEY, groupedSlots, medicationLine, slotContent };
