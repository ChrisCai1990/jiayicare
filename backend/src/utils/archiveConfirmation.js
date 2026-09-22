const { isDeepStrictEqual } = require('node:util');
const { FIELD_MAP } = require('../config/archiveFields');
const get = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);
const empty = value => value == null || value === '' || (Array.isArray(value) && value.length === 0);
function buildConfirmation(user, items, actor, now = new Date(), reviewerRoles = {}) {
  const draft = user.archiveDraft;
  if (!draft?.responseId || !draft?.questionnaireId) throw Object.assign(new Error('草稿已处理或缺少来源，请刷新重新导入'), { statusCode: 409 });
  const allowed = new Set((draft.items || []).map(x => x.path));
  const seen = new Set(), initial = [], changes = [], confirmed = [];
  const set = { archiveDraft: null };
  const sources = { ...(user.archiveBaselineSources || {}) };
  for (const item of items) {
    if (!FIELD_MAP[item.path] || !allowed.has(item.path) || seen.has(item.path)) throw Object.assign(new Error('确认字段与待审核草稿不一致'), { statusCode: 400 });
    seen.add(item.path);
    const baseline = get(user, item.path);
    const history = (user.archiveVersionHistory || []).filter(x => x.path === item.path && x.confirmedBy);
    const previous = (user.archiveConfirmLog || []).some(x => (x.items || []).some(i => i.path === item.path));
    const sourceKey = item.path.replace(/\./g, '__');
    const source = sources[sourceKey];
    const earlierInitial = (user.archiveConfirmLog || []).find(x => String(x.sourceResponseId) === String(draft.responseId)
      && (x.items || []).some(i => i.path === item.path && i.mode === 'initial'));
    const sameInitial = source ? String(source.responseId) === String(draft.responseId) : !!earlierInitial;
    const sourceRole = source?.reviewedRole || reviewerRoles[String(source?.reviewedBy || earlierInitial?.confirmedBy)];
    if (sameInitial && item.path.startsWith('lifestyle_data.') && sourceRole === 'nutritionist' && actor.role !== 'nutritionist') {
      if (!isDeepStrictEqual(baseline, item.value)) throw Object.assign(new Error('本次膳食档案已由营养师评估确认，请由营养师修订，不能以原答卷覆盖'), { statusCode: 409 });
      confirmed.push({ path: item.path, label: FIELD_MAP[item.path].label, value: baseline, mode: 'unchanged' });
      continue; // Equal reconfirmation must not transfer specialist ownership.
    }
    if (sameInitial && (history.length || (item.path.startsWith('lifestyle_data.') && (user.lifestyleHistory || []).some(x =>
      Object.hasOwn(x.changes?.lifestyle_data || {}, item.path.slice(15))))
      || (source && !isDeepStrictEqual(baseline, source.value)))) {
      throw Object.assign(new Error('首次档案已有后续更新，不能用旧答卷覆盖；请核对最新档案'), { statusCode: 409 });
    }
    let current = history.length ? history[history.length - 1].to : baseline;
    if (item.path.startsWith('lifestyle_data.')) current = require('./effectiveLifestyle').effectiveLifestyle(user)[item.path.slice(15)];
    const first = empty(baseline) && !source && !previous && !history.length;
    const row = { path: item.path, label: FIELD_MAP[item.path].label, value: item.value,
      mode: first ? 'initial' : sameInitial ? 'initial_revision' : 'unchanged' };
    if (first || sameInitial) {
      set[item.path] = item.value; initial.push(row);
      sources[sourceKey] = { responseId: draft.responseId, questionnaireId: draft.questionnaireId,
        establishedAt: source?.establishedAt || earlierInitial?.confirmedAt || now, reviewedAt: now, reviewedBy: actor._id, reviewedRole: actor.role, value: item.value };
    }
    else if (!isDeepStrictEqual(current ?? '', item.value ?? '')) {
      row.mode = 'append_only';
      changes.push({ path: item.path, label: row.label, from: current ?? '', to: item.value, effectiveAt: now,
        sourceType: 'questionnaire', mode: 'append_only', sourceQuestionnaireId: draft.questionnaireId,
        sourceResponseId: draft.responseId, confirmedBy: actor._id, confirmedByName: actor.name || actor.username || '' });
    }
    confirmed.push(row);
  }
  const entry = { confirmedBy: actor._id, confirmedByRole: actor.role, confirmedByName: actor.name || actor.username || '', confirmedAt: now,
    mode: initial.length ? (changes.length ? 'mixed' : 'initial') : 'append_only', items: confirmed,
    sourceQuestionnaireId: draft.questionnaireId, sourceResponseId: draft.responseId };
  const push = { archiveConfirmLog: { $each: [entry], $slice: -50 } };
  if (initial.length) set.archiveBaselineSources = sources;
  if (changes.length) push.archiveVersionHistory = { $each: changes, $slice: -200 };
  const filter = { _id: user._id, archiveDraft: draft, archiveVersionHistory: user.archiveVersionHistory ?? null,
    archiveConfirmLog: user.archiveConfirmLog ?? null, lifestyleHistory: user.lifestyleHistory ?? null,
    archiveBaselineSources: user.archiveBaselineSources ?? null };
  for (const item of items) filter[item.path] = get(user, item.path) ?? null;
  return { filter, update: { $set: set, $push: push }, initialCount: initial.length, changeCount: changes.length };
}
module.exports = { buildConfirmation };
