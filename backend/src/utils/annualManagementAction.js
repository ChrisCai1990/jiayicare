const { validDay } = require('../../../shared/annualAppointment.cjs');
const { addMonths } = require('./annualReviewPlan');

const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };

function normalizeTiming(timing = {}, direction = '') {
  if (direction === 'monitoring' && Array.isArray(timing.items)) {
    const metricTypes = new Set(['bloodPressure', 'bloodSugar', 'waist', 'heartRate', 'weight', 'sleep', 'mood', 'diet', 'exercise', 'water', 'bowel', 'smoking', 'alcohol']);
    const seen = new Set();
    if (!timing.items.length || timing.items.length > metricTypes.size) fail('请至少选择一项日常监测项目');
    const items = timing.items.map(item => {
      const type = String(item?.type || '').trim();
      const time = String(item?.time || '').trim();
      const frequency = String(item?.frequency || '').trim();
      if (!metricTypes.has(type) || seen.has(type) || (['bloodPressure', 'bloodSugar', 'weight'].includes(type) && !time) || time.length > 60) fail('请核对日常监测项目和监测时间');
      if (!require('./monitoringCycle').monitoringCycleDays(frequency)) fail('请为每项选择1至365天内的监测周期');
      seen.add(type);
      return { type, time, frequency };
    });
    return { mode: 'pending', firstDueDate: '', frequency: '', items };
  }
  const mode = String(timing.mode || 'pending');
  if (!['pending', 'single', 'rolling'].includes(mode)) fail('请选择有效的执行方式');
  const intervalBased = timing.dateBasis === 'interval';
  if (intervalBased && !['medical_treatment', 'checkup_completion'].includes(direction)) fail('按间隔计算执行日期仅适用于安排就医和完善检查');
  if (intervalBased && mode === 'pending') fail('请先选择单次行动或持续跟进');
  const anchorDate = String(timing.anchorDate || '').trim();
  const intervalMonths = Number(timing.intervalMonths);
  if (intervalBased && (!validDay(anchorDate) || !Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > 24))
    fail('请填写有效的起算日期和1至24个月的安排间隔');
  const calculatedDate = intervalBased ? addMonths(anchorDate, intervalMonths) : '';
  const suppliedDate = String(timing.firstDueDate || '').trim();
  if (intervalBased && suppliedDate && suppliedDate !== calculatedDate) fail('建议日期与起算日期和安排间隔不一致');
  const firstDueDate = intervalBased ? calculatedDate : suppliedDate;
  const frequency = String(timing.frequency || '').trim();
  if (mode === 'pending' && (firstDueDate || frequency)) fail('时间待确认时请勿填写执行日期或频率');
  if (mode !== 'pending' && !validDay(firstDueDate)) fail('请选择有效的首次执行日期');
  if (mode === 'rolling' && (!frequency || frequency.length > 100)) fail('请填写100字以内的滚动安排依据');
  if (mode === 'single' && frequency) fail('单次行动不需要填写重复频率');
  return { mode, firstDueDate: mode === 'pending' ? '' : firstDueDate,
    frequency: mode === 'rolling' ? frequency : '', ...(intervalBased ? { dateBasis: 'interval', anchorDate, intervalMonths } : {}) };
}

function normalizeAction(input = {}, reviewPlan = { kind: 'none' }) {
  const goal = String(input.goal || '').trim();
  const action = String(input.action || '').trim();
  if (!goal || goal.length > 240) fail('请填写240字以内的管理目标');
  if (action.length > 400) fail('下一步行动不能超过400字');
  const directions = input.directions || [input.direction].filter(Boolean);
  if (input.directionTimings !== undefined) {
    const source = input.directionTimings;
    if (!source || typeof source !== 'object' || Array.isArray(source)
      || Object.keys(source).some(key => !directions.includes(key))) fail('管理方向的时间安排无效');
    const directionTimings = {};
    for (const direction of directions) {
      if (direction === 'abnormal_followup' && reviewPlan.kind === 'recheck') continue;
      if (direction === 'ongoing_management' && reviewPlan.kind === 'recheck') continue;
      directionTimings[direction] = normalizeTiming(source[direction] || {}, direction);
    }
    const actionTiming = directionTimings[input.direction] || (reviewPlan.kind === 'recheck'
      ? { mode: 'rolling', firstDueDate: addMonths(reviewPlan.anchorDate, reviewPlan.intervalMonths),
        frequency: '完成本轮检查和专家评估后，由健康顾问确认下一轮' }
      : { mode: 'pending', firstDueDate: '', frequency: '' });
    return { goal, action, actionTiming, directionTimings };
  }
  if (!action) fail('请填写400字以内的下一步行动');
  if (reviewPlan.kind === 'recheck' && !(input.directions || [input.direction]).includes('medical_treatment')) {
    return { goal, action, actionTiming: {
      mode: 'rolling', firstDueDate: addMonths(reviewPlan.anchorDate, reviewPlan.intervalMonths),
      frequency: '完成本轮检查和专家评估后，由健康顾问确认下一轮',
    } };
  }
  const timingDirection = directions.includes('medical_treatment') ? 'medical_treatment' : input.direction;
  return { goal, action, actionTiming: normalizeTiming(input.actionTiming || {}, timingDirection) };
}

function parseDraft(value) {
  let parsed;
  try { parsed = JSON.parse(String(value || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
  catch { fail('AI草稿格式错误，请重试或由顾问填写'); }
  const goal = String(parsed?.goal || '').trim();
  const action = String(parsed?.action || '').trim();
  if (!goal || goal.length > 240 || action.length > 400) fail('AI草稿缺少有效的目标，请重试或由顾问填写');
  return { goal, action };
}

module.exports = { normalizeTiming, normalizeAction, parseDraft };
