const { isDeepStrictEqual } = require('node:util');
const { FIELD_MAP } = require('../config/archiveFields');
const { buildArchiveDraft, getByPath } = require('./archiveImport');

const childPath = path => typeof path === 'string' && path.startsWith('childProfile.') && !!FIELD_MAP[path];
const empty = value => value === undefined || value === null || value === '';

function childSubmission(user, questionnaire, response, kind) {
  const draft = buildArchiveDraft(user, questionnaire, response);
  const items = draft.items.filter(item => childPath(item.path) && (kind === 'initial' || item.existing !== item.valueStr)).map(item => ({
    ...item, imported: kind === 'initial' && empty(getByPath(user, item.path)),
    before: getByPath(user, item.path) ?? null,
  }));
  return {
    responseId: response._id, questionnaireId: questionnaire._id,
    questionnaireTitle: questionnaire.title, submittedAt: response.submittedAt || new Date(),
    kind, status: kind === 'followup' && !items.length ? 'unchanged' : 'pending', revision: 0, items,
  };
}

function initialChildMutation(user, questionnaire, response) {
  const submission = childSubmission(user, questionnaire, response, 'initial');
  const filter = { _id: user._id, patientCategory: 'child', childArchiveFirstResponseId: null };
  const set = { childArchiveFirstResponseId: response._id };
  for (const item of submission.items) {
    filter[item.path] = item.before;
    if (item.imported) set[item.path] = item.value;
  }
  return { submission, filter, update: { $set: set, $push: { childArchiveSubmissions: submission } } };
}

function normalizeReviewValue(path, input) {
  const def = FIELD_MAP[path];
  if (!childPath(path)) throw Object.assign(new Error('儿童档案字段无效'), { statusCode: 400 });
  if (def.type === 'number') {
    if (!/^(?:\d+)(?:\.\d+)?$/.test(String(input ?? '').trim())) throw Object.assign(new Error(`${def.label}须填写非负数`), { statusCode: 400 });
    const value = Number(input);
    if (!Number.isFinite(value) || value > 30000) throw Object.assign(new Error(`${def.label}数值超出可录入范围`), { statusCode: 400 });
    return value;
  }
  if (typeof input !== 'string' || !input.trim() || input.length > 4000) throw Object.assign(new Error(`${def.label}内容无效`), { statusCode: 400 });
  const value = input.trim();
  if (def.type === 'enum' && !def.options.includes(value)) throw Object.assign(new Error(`${def.label}选项无效`), { statusCode: 400 });
  if (def.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) throw Object.assign(new Error(`${def.label}日期无效`), { statusCode: 400 });
  return value;
}

function reviewChildSubmission(user, responseId, payload, actor, now = new Date()) {
  if (user.patientCategory !== 'child') throw Object.assign(new Error('此会员不是儿童档案'), { statusCode: 400 });
  const submissions = user.childArchiveSubmissions || [];
  const index = submissions.findIndex(row => String(row.responseId) === String(responseId));
  const submission = submissions[index];
  if (!submission) throw Object.assign(new Error('儿童问卷承接记录不存在'), { statusCode: 404 });
  if (submission.status !== 'pending' || payload.revision !== submission.revision) throw Object.assign(new Error('核实进度已变化，请刷新'), { statusCode: 409 });
  if (submissions.some((row, i) => i < index && row.status === 'pending')) throw Object.assign(new Error('请先核实更早提交的儿童问卷'), { statusCode: 409 });
  if (typeof payload.note !== 'string' || !payload.note.trim() || payload.note.length > 4000) throw Object.assign(new Error('请填写核实依据'), { statusCode: 400 });
  if (!Array.isArray(payload.decisions) || payload.decisions.length !== submission.items.length) throw Object.assign(new Error('请逐项核实问卷内容'), { statusCode: 400 });
  const byPath = new Map(payload.decisions.map(row => [row.path, row]));
  if (byPath.size !== submission.items.length) throw Object.assign(new Error('核实字段重复'), { statusCode: 400 });
  const set = {}, changes = [];
  const decisions = submission.items.map(item => {
    const decision = byPath.get(item.path);
    if (!decision || decision.verified !== true || typeof decision.accept !== 'boolean') throw Object.assign(new Error(`请核实「${item.label}」`), { statusCode: 400 });
    const current = getByPath(user, item.path) ?? null;
    const expected = item.imported ? item.value : item.before;
    if (!isDeepStrictEqual(current, expected ?? null)) throw Object.assign(new Error(`「${item.label}」在问卷提交后已变化，请刷新并核对最新档案`), { statusCode: 409 });
    // Since intake can prefill an empty field, declining it restores the value
    // that existed before the questionnaire. Other concurrent edits are rejected below.
    const next = decision.accept ? normalizeReviewValue(item.path, decision.value) : (item.imported ? item.before : current);
    if (!isDeepStrictEqual(current, next)) {
      set[item.path] = next;
      changes.push({ path: item.path, label: item.label, from: current, to: next,
        sourceResponseId: submission.responseId, at: now, by: actor._id,
        byName: actor.name || actor.username || '', kind: submission.kind });
    }
    return { path: item.path, verified: true, accepted: decision.accept, reviewedValue: decision.accept ? next : null };
  });
  const reviewed = { ...submission, status: 'reviewed', revision: submission.revision + 1,
    reviewedAt: now, reviewedBy: actor._id, reviewedByName: actor.name || actor.username || '',
    note: payload.note.trim(), decisions };
  set[`childArchiveSubmissions.${index}`] = reviewed;
  const filter = { _id: user._id, patientCategory: 'child',
    [`childArchiveSubmissions.${index}.responseId`]: submission.responseId,
    [`childArchiveSubmissions.${index}.status`]: 'pending',
    [`childArchiveSubmissions.${index}.revision`]: submission.revision };
  for (const item of submission.items) filter[item.path] = getByPath(user, item.path) ?? null;
  return { filter, update: { $set: set, $push: { childArchiveHistory: {
    responseId: submission.responseId, questionnaireTitle: submission.questionnaireTitle,
    kind: submission.kind, reviewedAt: now, reviewedBy: actor._id,
    reviewedByName: actor.name || actor.username || '', note: payload.note.trim(), decisions, changes,
  } } } };
}

function manualChildUpdate(user, payload, actor, now = new Date()) {
  if (user.patientCategory !== 'child') throw Object.assign(new Error('此会员不是儿童档案'), { statusCode: 400 });
  if ((user.childArchiveSubmissions || []).some(row => row.kind === 'initial' && row.status === 'pending')) throw Object.assign(new Error('请先完成首次儿童问卷核实'), { statusCode: 409 });
  if (!childPath(payload.path)) throw Object.assign(new Error('儿童档案字段无效'), { statusCode: 400 });
  if ((user.childArchiveSubmissions || []).some(row => row.status === 'pending' && (row.items || []).some(item => item.path === payload.path))) throw Object.assign(new Error('此字段有待核实的儿童问卷，请先处理问卷'), { statusCode: 409 });
  if (typeof payload.reason !== 'string' || !payload.reason.trim() || payload.reason.length > 4000) throw Object.assign(new Error('请填写更新依据'), { statusCode: 400 });
  const before = getByPath(user, payload.path) ?? null;
  if (!isDeepStrictEqual(before, payload.expected ?? null)) throw Object.assign(new Error('档案已变化，请刷新后重试'), { statusCode: 409 });
  const after = payload.clear === true ? null : normalizeReviewValue(payload.path, payload.value);
  if (isDeepStrictEqual(before, after)) throw Object.assign(new Error('内容没有变化'), { statusCode: 400 });
  const change = { path: payload.path, label: FIELD_MAP[payload.path].label, from: before, to: after,
    at: now, by: actor._id, byName: actor.name || actor.username || '', kind: 'manual' };
  return { filter: { _id: user._id, patientCategory: 'child', [payload.path]: before },
    update: { $set: { [payload.path]: after }, $push: { childArchiveHistory: {
      kind: 'manual', reviewedAt: now, reviewedBy: actor._id, reviewedByName: actor.name || actor.username || '',
      note: payload.reason.trim(), changes: [change],
    } } } };
}

module.exports = { childSubmission, initialChildMutation, reviewChildSubmission, manualChildUpdate, normalizeReviewValue };
