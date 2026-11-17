const { validDay } = require('../../../shared/annualAppointment.cjs');
const { addMonths } = require('./annualReviewPlan');

const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };

function normalizeAction(input = {}, reviewPlan = { kind: 'none' }) {
  const goal = String(input.goal || '').trim();
  const action = String(input.action || '').trim();
  if (!goal || goal.length > 240) fail('请填写240字以内的管理目标');
  if (!action || action.length > 400) fail('请填写400字以内的下一步行动');
  if (reviewPlan.kind === 'recheck') {
    return { goal, action, actionTiming: {
      mode: 'rolling', firstDueDate: addMonths(reviewPlan.anchorDate, reviewPlan.intervalMonths),
      frequency: '完成本轮检查和专家评估后，由健康顾问确认下一轮',
    } };
  }
  const timing = input.actionTiming || {};
  const mode = String(timing.mode || 'pending');
  if (!['pending', 'single', 'rolling'].includes(mode)) fail('请选择有效的执行方式');
  const firstDueDate = String(timing.firstDueDate || '').trim();
  const frequency = String(timing.frequency || '').trim();
  if (mode === 'pending' && (firstDueDate || frequency)) fail('时间待确认时请勿填写执行日期或频率');
  if (mode !== 'pending' && !validDay(firstDueDate)) fail('请选择有效的首次执行日期');
  if (mode === 'rolling' && (!frequency || frequency.length > 100)) fail('请填写100字以内的滚动安排依据');
  if (mode === 'single' && frequency) fail('单次行动不需要填写重复频率');
  return { goal, action, actionTiming: { mode, firstDueDate: mode === 'pending' ? '' : firstDueDate,
    frequency: mode === 'rolling' ? frequency : '' } };
}

function parseDraft(value) {
  let parsed;
  try { parsed = JSON.parse(String(value || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
  catch { fail('AI草稿格式错误，请重试或由顾问填写'); }
  const goal = String(parsed?.goal || '').trim();
  const action = String(parsed?.action || '').trim();
  if (!goal || !action || goal.length > 240 || action.length > 400) fail('AI草稿缺少有效的目标或行动，请重试或由顾问填写');
  return { goal, action };
}

module.exports = { normalizeAction, parseDraft };
