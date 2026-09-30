const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { FIELD_MAP } = require('../config/archiveFields');
const { getByPath } = require('./archiveImport');
const SECTION_LABELS = { family: '家族史', disease: '疾病史与当前状态', allergy: '过敏史与不良反应史', medication: '用药与营养补充剂', symptom: '不适主诉与症状', routine: '基础信息与其他常规项目' };
const FIELDS = {
  family: ['disease', 'relationship', 'person', 'onsetAge', 'diagnosedAt', 'status', 'note', 'source'],
  disease: ['disease', 'institution', 'diagnosedAt', 'status', 'statusAt', 'evidence', 'treatment', 'effect', 'note', 'source'],
  allergy: ['substance', 'kind', 'reaction', 'occurredAt', 'severity', 'treatment', 'note', 'source'],
  symptom: ['symptom', 'startedAt', 'frequency', 'severity', 'status', 'statusAt', 'institution', 'diagnosis', 'diagnosedAt', 'treatment', 'effect', 'medicationNote', 'note', 'source'],
};
function sectionFor(path) {
  if (/familyHistory/.test(path)) return 'family';
  if (/allerg/i.test(path)) return 'allergy';
  if (/medicHistory|recentMedication|medications|supplement/i.test(path)) return 'medication';
  if (/recentSymptoms/.test(path)) return 'symptom';
  if (/pastHistory|medicalHistory|chronicDiseases|surgery|surgeries|traumaHistory|transfusionHistory|infectiousHistory|otherDiseaseHistory/.test(path)) return 'disease';
  return 'routine';
}
function isIntake(questionnaire) {
  return questionnaire.title === '健康问卷表（成人）' || new Set((questionnaire.questions || []).map(q => sectionFor(q.archiveField || '')).filter(s => s !== 'routine')).size >= 3;
}
function initialImport(user, questionnaire, response, draft, now = new Date()) {
  if (user.initialArchiveReview || !isIntake(questionnaire)) return null;
  const set = { initialArchiveImportPending: null }, filter = { _id: user._id, initialArchiveReview: null };
  const items = draft.items.map(item => {
    const current = getByPath(user, item.path);
    const empty = current == null || current === '' || Array.isArray(current) && !current.length;
    filter[item.path] = current ?? null;
    if (empty) set[item.path] = item.value;
    return { ...item, section: sectionFor(item.path), imported: empty || isDeepStrictEqual(current, item.value) };
  });
  // Keep explicit negative answers as evidence even when normalization filters them out.
  for (const q of questionnaire.questions || []) {
    if (!FIELD_MAP[q.archiveField] || items.some(i => i.questionId === q.id) || response.answers?.[q.id] == null) continue;
    items.push({ path: q.archiveField, label: FIELD_MAP[q.archiveField].label, questionId: q.id, questionText: q.text,
      answer: response.answers[q.id], valueStr: '', section: sectionFor(q.archiveField), imported: false });
  }
  set.initialArchiveReview = { responseId: response._id, questionnaireId: questionnaire._id, questionnaireTitle: questionnaire.title,
    submittedAt: response.submittedAt || now, createdAt: now, status: 'pending', revision: 0, items,
    sections: Object.fromEntries(Object.keys(SECTION_LABELS).map(key => [key, { status: 'pending' }])) };
  return { filter, update: { $set: set } };
}
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
function saveSection(user, key, payload, actor, now = new Date()) {
  if (!FIELDS[key]) fail('档案板块无效');
  const old = user.coreHealthArchive?.[key] || { revision: 0, records: [], presence: 'uncollected' };
  if (payload.revision !== old.revision) fail('档案已更新，请刷新后再修改', 409);
  if (!['uncollected', 'present', 'none', 'unknown'].includes(payload.presence)) fail('请选择信息状态');
  if (!Array.isArray(payload.records) || payload.records.length > 200) fail('记录格式无效或过多');
  const seen = new Set();
  const records = payload.records.map(row => {
    const prior = old.records.find(r => r.id === row.id);
    const id = prior?.id || randomUUID();
    if (seen.has(id)) fail('重复记录'); seen.add(id);
    const next = { id };
    for (const field of FIELDS[key]) {
      if (row[field] != null && (typeof row[field] !== 'string' || row[field].length > 4000)) fail('字段内容无效或过长');
      next[field] = (row[field] || '').trim();
    }
    if (!next[FIELDS[key][0]]) fail('请填写疾病、过敏原或症状');
    if (key === 'family' && !next.relationship) fail('请填写亲属关系');
    if (['disease', 'symptom'].includes(key)) {
      const allowed = key === 'disease' ? ['持续','缓解','已逆转','复发','已结束','不详'] : ['持续','间歇出现','缓解','已结束','不详'];
      if (!allowed.includes(next.status)) fail('请选择有效的当前状态');
      if (['已逆转', '缓解', '复发', '已结束'].includes(next.status) && !next.statusAt) fail('请填写状态变化时间，可填写大致时间或不详');
      if (next.status === '已逆转' && !next.evidence) fail('请填写逆转判断依据');
      next.timeline = prior?.timeline || [];
      if (!prior || ['status', 'statusAt', 'evidence'].some(k => next[k] !== prior[k])) next.timeline = [...next.timeline, { status: next.status, statusAt: next.statusAt, evidence: next.evidence || '', recordedAt: now, recordedBy: actor._id, recordedByName: actor.name || '' }];
    }
    return { ...next, createdAt: prior?.createdAt || now, updatedAt: now };
  });
  if (payload.presence === 'present' && !records.length) fail('请至少新增一条记录');
  if (payload.presence !== 'present' && records.length) fail('已有具体记录，请选择有相关情况');
  const next = { presence: payload.presence, records, revision: old.revision + 1, updatedAt: now, updatedBy: actor._id, updatedByName: actor.name || '' };
  const set = { [`coreHealthArchive.${key}`]: next };
  // Readable projection for existing portrait / AI consumers; detailed records remain the source.
  const summaries = records.map(row => FIELDS[key].filter(f => f !== 'source').map(f => row[f]).filter(Boolean).join(' · '));
  const summary = payload.presence === 'none' ? '未报告已知相关情况' : payload.presence === 'unknown' ? '不详' : summaries.join('；');
  const path = { family: 'healthProfile.familyHistoryNote', disease: 'healthProfile.pastHistory', allergy: 'healthProfile.allergies', symptom: 'healthProfile.recentSymptoms' }[key];
  set[path] = ['allergy', 'symptom'].includes(key) ? (records.length ? summaries : summary ? [summary] : []) : summary;
  if (key === 'allergy') {
    // Old allergy consumers must see the revised record rather than a stale questionnaire answer.
    set['healthProfile.drugAllergy'] = records.filter(r => /药/.test(r.kind)).map(r => `${r.substance}：${r.reaction}`).join('；') || (records.length ? '详见过敏史与不良反应史' : summary);
    set['healthProfile.foodAllergy'] = records.filter(r => /食/.test(r.kind)).map(r => `${r.substance}：${r.reaction}`).join('；') || (records.length ? '详见过敏史与不良反应史' : summary);
  }
  if (user.initialArchiveReview?.sections?.[key]?.status === 'reviewed' && user.initialArchiveReview.status !== 'completed') set[`initialArchiveReview.sections.${key}`] = { status: 'pending' };
  return { filter: { _id: user._id, [`coreHealthArchive.${key}`]: user.coreHealthArchive?.[key] ?? null, [path]: getByPath(user, path) ?? null, initialArchiveReview: user.initialArchiveReview ?? null },
    update: { $set: set, $push: { coreHealthArchiveHistory: { section: key, before: old, after: next, legacyBefore: user.healthProfile || {}, at: now, by: actor._id, byName: actor.name || '' } } } };
}
function reviewSection(user, key, payload, actor, now = new Date()) {
  if (!SECTION_LABELS[key] || !user.initialArchiveReview) fail('没有待复核的初次建档问卷');
  const old = user.initialArchiveReview;
  if (old.status === 'completed') fail('初次建档已完成；后续请在所属档案板块更新', 409);
  if (payload.revision !== old.revision) fail('复核进度已更新，请刷新后再操作', 409);
  if (!['reviewed', 'needs_info'].includes(payload.status)) fail('复核状态无效');
  if (typeof payload.note !== 'string' || payload.note.length > 4000 || !payload.note.trim()) fail('请填写核实依据或待补充内容');
  if (payload.status === 'reviewed' && FIELDS[key] && (!user.coreHealthArchive?.[key] || user.coreHealthArchive[key].presence === 'uncollected')) fail('请先补充本板块档案，或明确记录无相关情况／不详');
  if (FIELDS[key] && payload.sectionRevision !== (user.coreHealthArchive?.[key]?.revision || 0)) fail('本板块档案已变化，请刷新并重新核对', 409);
  const questionIds = (old.items || []).filter(i => i.section === key).map(i => i.questionId);
  if (payload.status === 'reviewed' && questionIds.some(id => !payload.checkedQuestionIds?.includes(id))) fail('请逐项勾选已核实的问卷信息');
  const sections = { ...old.sections, [key]: { status: payload.status, note: payload.note.trim(), checkedQuestionIds: questionIds.filter(id => payload.checkedQuestionIds?.includes(id)), reviewedAt: now, reviewedBy: actor._id, reviewedByName: actor.name || '' } };
  const completed = Object.keys(SECTION_LABELS).every(k => sections[k]?.status === 'reviewed');
  return { filter: { _id: user._id, initialArchiveReview: old, coreHealthArchive: user.coreHealthArchive ?? null },
    update: { $set: { initialArchiveReview: { ...old, sections, revision: old.revision + 1, status: completed ? 'completed' : 'pending', completedAt: completed ? now : null } },
      $push: { initialArchiveReviewHistory: { section: key, ...sections[key], responseId: old.responseId } } } };
}
module.exports = { SECTION_LABELS, FIELDS, sectionFor, isIntake, initialImport, saveSection, reviewSection };
