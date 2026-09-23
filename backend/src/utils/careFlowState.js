const config = require('../../../shared/careFlow.cjs');
const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
const text = (v, limit = 10000) => { if (typeof v !== 'string' || !v.trim() || v.length > limit) fail('请完整填写内容并检查字数', 400); return v.trim(); };
function advance(state, actor, action, data, at = new Date()) {
  const s = structuredClone(state), stage = s.stage;
  if (stage === 'closed') fail('服务已结束，不可直接回退或改写');
  const assignee = s.people[config.roles[stage]];
  if (actor.role !== 'superadmin' && (actor.role !== config.roles[stage] || String(actor._id) !== String(assignee?.id))) fail('仅当前环节负责人可处理', 403);
  if (s.generating && new Date(s.generating.until) > at) fail('正在生成草稿，请稍后再处理');
  const before = structuredClone(s.data || {});
  const event = { action, stage, at, by: String(actor._id), name: actor.name || '', role: actor.role };
  if (action === 'return') {
    if (!config.targets(s).includes(data.target)) fail('只能退回本次服务已到达的责任环节');
    if (!config.categories[data.category]) fail('请选择问题分类', 400);
    const reason = text(data.reason, 2000);
    const target = s.people[config.roles[data.target]];
    if (!target?.id) fail('目标岗位尚未分配人员');
    const token = `${s.sequence + 1}`;
    s.returns = [...(s.returns || []), { token, from: stage, to: data.target, by: event.by, name: event.name, at, reason, category: data.category, target: structuredClone(target), before }];
    s.stage = data.target;
    Object.assign(event, { token, targetStage: data.target, targetId: target.id, targetName: target.name, reason, category: data.category, categoryLabel: config.problemLabels(data.target)[data.category] || config.categories[data.category], attribution: '待复核，不等于人员过错', before });
  } else if (action === 'complete') {
    if (data.confirmed !== true) fail('请核对内容后确认提交', 400);
    const correction = s.returns?.length ? text(data.correction, 3000) : '';
    s.data = { ...s.data, [stage]: data.value };
    if (s.returns?.length) {
      const back = s.returns.pop();
      s.stage = back.from;
      Object.assign(event, { action: 'correct', token: back.token, returnTo: back.from, returnToId: back.by, correction, before, after: structuredClone(s.data), durationMs: Math.max(0, +at - +new Date(back.at)) });
      s.lastCorrection = { token: back.token, stage, reason: back.reason, correction, at, by: event.by };
      if (stage === 'advisor' && (['planner','execute'].includes(s.stage) || s.returns.some(r => ['planner','execute'].includes(r.from)))) s.bookingStale = true;
      if (stage === 'booking') s.bookingStale = false;
      // An upstream correction invalidates an already-generated downstream draft.
      // It stays in the audit history, but must be regenerated before approval.
      if (s.data.draft && ['advisor', 'execute', 'upload', 'audit'].includes(stage)) s.draftStale = true;
    } else {
      s.stage = config.stages[config.stages.indexOf(stage) + 1] || 'closed';
      Object.assign(event, { before, after: structuredClone(s.data) });
    }
  } else fail('未知操作', 400);
  s.sequence = (s.sequence || 0) + 1;
  return { state: s, event };
}
module.exports = { advance, fail, text };
