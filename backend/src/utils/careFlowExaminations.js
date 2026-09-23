const { fail } = require('./careFlowState');
function examinations(input, entries, staffId) {
  if (!Array.isArray(input) || input.length > 50) fail('请核对本次检查清单', 400);
  const originals = entries.filter(e => e.type === 'exam' || e.mode === 'onsite');
  const ids = input.map(e => e?.id);
  if (new Set(ids).size !== ids.length || originals.some(e => !ids.includes(e.id))) fail('原检查不能删除，请标记专家取消并说明原因', 400);
  return input.map((v, index) => {
    const required = (value, label, limit) => {
      if (typeof value !== 'string' || !value.trim()) fail(`第${index + 1}项检查：请填写${label}`,400);
      if (value.length > limit) fail(`第${index + 1}项检查：${label}不能超过${limit}字`,400);
      return value.trim();
    };
    const original = originals.find(e => e.id === v.id);
    if (!original && (typeof v.id !== 'string' || !/^added-[\w-]{1,80}$/.test(v.id))) fail('检查标识无效', 400);
    const title = required(v.title, '实际检查项目', 500), status = v.status;
    if (!['booked', 'pending', 'cancelled'].includes(status)) fail('请选择检查办理状态', 400);
    const changed = !original || title !== original.title || status === 'cancelled';
    const reason = changed ? required(v.reason, '专家意见／变更原因', 2000) : (typeof v.reason === 'string' ? v.reason.slice(0,2000) : '');
    const note = typeof v.note === 'string' ? v.note.slice(0,2000) : '';
    const result = { id: v.id, type: 'exam', title, status, reason, note, original: original || null, confirmedBy: staffId, confirmedAt: new Date() };
    if (status === 'cancelled') return result;
    const hospital = required(v.hospital,'实际医院',200), department = required(v.department,'检查科室',200), expert = typeof v.expert === 'string' ? v.expert.slice(0,200) : '';
    if (original && ['hospital','department','expert'].some(k => (original[k] || '') !== ({hospital,department,expert}[k]))) result.reason = required(v.reason,'专家意见／变更原因',2000);
    Object.assign(result,{hospital,department,expert});
    if (status === 'pending') { required(note,'办理结果及后续安排',2000); return result; }
    const saved = require('./annualBookingReceipt').receipt({date:v.date,time:v.time,note},staffId,{plannedContent:`医院：${hospital}\n科室：${department}\n专家：${expert}`});
    return {...result,date:saved.date,time:saved.time};
  });
}
module.exports = { examinations };
