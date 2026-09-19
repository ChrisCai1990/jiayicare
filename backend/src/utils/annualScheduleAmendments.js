// 只支持未派发的固定日期事项；不修改冻结方案、相对周期、负责人或服务模式。
const FIELDS = { medical_treatment: 'visit_time', specialist_collab: 'plan_time', checkup_completion: 'time', abnormal_followup: 'time', vaccine: 'time', functional_medicine: 'time', annual_checkup: 'date' };
const fail = message => Object.assign(new Error(message), { statusCode: 409, correctionRole: 'familyDoctor' });
const keyOf = row => `${row.moduleKey}:${row.index}:${row.field}`;
const recordAt = (data, moduleKey, index) => moduleKey === 'annual_checkup' ? (index === 0 ? data[moduleKey] : null) : data[moduleKey]?.records?.[index];
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function sourceDate(plan, moduleKey, index, field, fallback) {
  return recordAt(plan.__frozenModuleData || {}, moduleKey, index)?.[field] ?? fallback;
}
function projectAnnualSchedule(plan, amendments = []) {
  if (plan.toObject) plan = plan.toObject();
  if (!amendments.length && !plan.__frozenModuleData) return plan;
  const frozen = plan.__frozenModuleData || plan.moduleData || {};
  const moduleData = JSON.parse(JSON.stringify(frozen));
  for (const item of amendments) {
    if (FIELDS[item.moduleKey] !== item.field || !Number.isInteger(item.index) || item.index < 0 || !validDay(item.to)) throw fail('排期修订记录无效，请核对');
    const record = recordAt(moduleData, item.moduleKey, item.index);
    if (!record || moduleData[item.moduleKey]?.enabled === false) throw fail('排期修订来源已变化，请核对冻结方案');
    record[item.field] = item.to;
  }
  return { ...plan, moduleData, __frozenModuleData: frozen, __scheduleAmendments: amendments };
}
function validateScheduleChanges(plan, changes, period, impact) {
  if (!Array.isArray(changes) || changes.length > 100) throw fail('排期修订须为不超过100条的列表');
  const seen = new Set();
  return changes.map(input => {
    const { moduleKey, index, field, from, to } = input || {};
    if (!Object.hasOwn(FIELDS, moduleKey) || FIELDS[moduleKey] !== field || !Number.isInteger(index) || index < 0) throw fail('仅支持指定固定日期事项修订');
    const key = keyOf(input);
    if (seen.has(key)) throw fail('同一事项不能重复修订');
    seen.add(key);
    const record = recordAt(plan.moduleData || {}, moduleKey, index);
    if (!record || plan.moduleData[moduleKey]?.enabled === false || String(record[field] || '').slice(0, 10) !== from || !validDay(from)) throw fail('原日期已变化或来源无效，请刷新后审核');
    if (!validDay(to) || to < period.startDate || to > period.endDate || from === to) throw fail('修订日期必须有效、不同于原日期且位于拟服务期内');
    // 即使已取消/已完成也不重建该事项；旧记录缺稳定键时保守阻断。
    const originalDay = String(sourceDate(plan, moduleKey, index, field, from)).slice(0, 10);
    if (impact.records.some(row => row.kind === 'followup' && (!row.scheduleKey || row.scheduleKey.startsWith(`service-request:${moduleKey}:${index}:`) || row.scheduleKey.startsWith(moduleKey === 'annual_checkup' ? `annual_checkup:${originalDay}` : `${moduleKey}:${originalDay}:`) || (row.scheduleKey.startsWith(`${moduleKey}:`) && !/^\d{4}-\d{2}-\d{2}(?::|$)/.test(row.scheduleKey.slice(moduleKey.length + 1)))))) throw fail('该事项已有派发记录或历史键无法确认，不能使用未派发排期修订入口');
    return { moduleKey, index, field, from, to };
  });
}
function mergeScheduleAmendments(existing = [], changes = []) {
  const byKey = new Map(existing.map(item => [keyOf(item), item]));
  for (const change of changes) byKey.set(keyOf(change), change);
  return [...byKey.values()];
}
function assertAmendedRowUnchanged(plan, key, oldDate, newDate) {
  const amended = (plan.__scheduleAmendments || []).some(item => {
    const originalDay = String(sourceDate(plan, item.moduleKey, item.index, item.field, item.from)).slice(0, 10);
    return key.startsWith(`service-request:${item.moduleKey}:${item.index}:`) || key.startsWith(`${item.moduleKey}:${originalDay}`);
  });
  if (amended && new Date(oldDate).getTime() !== new Date(newDate).getTime()) throw Object.assign(fail('修订事项出现旧日期任务，请顾问核对；未覆盖已派记录'), { code: 'ANNUAL_SCHEDULE_CONFLICT' });
}
module.exports = { FIELDS, sourceDate, projectAnnualSchedule, validateScheduleChanges, mergeScheduleAmendments, assertAmendedRowUnchanged };
