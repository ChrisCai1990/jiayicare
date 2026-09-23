const { text, fail } = require('./careFlowState');
function examinations(input, entries, staffId) {
  if (!Array.isArray(input) || input.length > 50) fail('请核对本次检查清单', 400);
  const originals = entries.filter(e => e.type === 'exam' || e.mode === 'onsite');
  const ids = input.map(e => e?.id);
  if (new Set(ids).size !== ids.length || originals.some(e => !ids.includes(e.id))) fail('原检查不能删除，请标记专家取消并说明原因', 400);
  return input.map(v => {
    const original = originals.find(e => e.id === v.id);
    if (!original && (typeof v.id !== 'string' || !/^added-[\w-]{1,80}$/.test(v.id))) fail('检查标识无效', 400);
    const title = text(v.title, 500), status = v.status;
    if (!['booked', 'pending', 'cancelled'].includes(status)) fail('请选择检查办理状态', 400);
    const changed = !original || title !== original.title || status === 'cancelled';
    const reason = changed ? text(v.reason, 2000) : (typeof v.reason === 'string' ? v.reason.slice(0,2000) : '');
    const note = typeof v.note === 'string' ? v.note.slice(0,2000) : '';
    const result = { id: v.id, type: 'exam', title, status, reason, note, original: original || null, confirmedBy: staffId, confirmedAt: new Date() };
    if (status === 'cancelled') return result;
    const hospital = text(v.hospital,200), department = text(v.department,200), expert = typeof v.expert === 'string' ? v.expert.slice(0,200) : '';
    if (original && ['hospital','department','expert'].some(k => (original[k] || '') !== ({hospital,department,expert}[k]))) result.reason = text(v.reason,2000);
    Object.assign(result,{hospital,department,expert});
    if (status === 'pending') { text(note,2000); return result; }
    const saved = require('./annualBookingReceipt').receipt({date:v.date,time:v.time,note},staffId,{plannedContent:`医院：${hospital}\n科室：${department}\n专家：${expert}`});
    return {...result,date:saved.date,time:saved.time};
  });
}
module.exports = { examinations };
