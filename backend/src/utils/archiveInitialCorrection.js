const { FIELD_MAP } = require('../config/archiveFields');
const { isDeepStrictEqual } = require('node:util');
// Explicit maintenance only, never automatic on read. Refuse ambiguous history.
function buildInitialCorrection(user, responseId, { includeInitialRevisions = false } = {}) {
  const fail = () => { throw new Error('首次入档凭据不唯一或已有修改，拒绝自动校正'); };
  const entries = (user.archiveVersionHistory || []).filter(x => String(x.sourceResponseId) === String(responseId));
  if (!entries.length || user.archiveDraft) return fail();
  const values = new Map(), latest = new Map();
  for (const row of [...entries].sort((a,b) => new Date(a.effectiveAt) - new Date(b.effectiveAt))) {
    if (!row.confirmedBy || row.sourceType !== 'questionnaire' || !row.path.startsWith('lifestyle_data.') || !FIELD_MAP[row.path]
      || (row.from !== '' && row.from != null)) return fail();
    if (values.has(row.path) && !isDeepStrictEqual(values.get(row.path), row.to) && !includeInitialRevisions) return fail();
    if (includeInitialRevisions && !Number.isFinite(new Date(row.effectiveAt).getTime())) return fail();
    const last = latest.get(row.path);
    if (last && new Date(last.effectiveAt).getTime() === new Date(row.effectiveAt).getTime() && !isDeepStrictEqual(last.to, row.to)) return fail();
    values.set(row.path, row.to);
    latest.set(row.path, row);
  }
  for (const path of values.keys()) {
    const key = path.slice(15), v = user.lifestyle_data?.[key];
    if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) return fail();
    if ((user.lifestyleHistory || []).some(x => Object.hasOwn(x.changes?.lifestyle_data || {}, key))) return fail();
    if ((user.archiveVersionHistory || []).some(x => x.path === path && String(x.sourceResponseId) !== String(responseId))) return fail();
    if ((user.archiveConfirmLog || []).some(x => String(x.sourceResponseId) !== String(responseId) && (x.items || []).some(i => i.path === path))) return fail();
  }
  const history = (user.archiveVersionHistory || []).filter(x => String(x.sourceResponseId) !== String(responseId));
  const log = (user.archiveConfirmLog || []).map((x, i, all) => String(x.sourceResponseId) !== String(responseId) ? x : {
    ...x, previousMode: x.mode, mode: all.slice(0, i).some(y => String(y.sourceResponseId) === String(responseId)) ? 'initial_revision' : 'initial',
  });
  log.push({ mode: 'initial_classification_correction', correctedAt: new Date(), sourceResponseId: responseId,
    reason: '用户确认首次问卷应入基础档案；保留原审核记录，不重复审核', previousVersionEntries: entries });
  const sources = { ...(user.archiveBaselineSources || {}) };
  for (const [path, value] of values) {
    if (sources[path.replace(/\./g, '__')]) return fail();
    const row = latest.get(path);
    sources[path.replace(/\./g, '__')] = { responseId, questionnaireId: row.sourceQuestionnaireId,
      establishedAt: entries.find(x=>x.path===path).effectiveAt, reviewedAt: row.effectiveAt, reviewedBy: row.confirmedBy, value };
  }
  return { count: values.size, filter: { _id: user._id, archiveDraft: null, lifestyle_data: user.lifestyle_data ?? null,
    archiveBaselineSources: user.archiveBaselineSources ?? null,
    lifestyleHistory: user.lifestyleHistory ?? null, archiveVersionHistory: user.archiveVersionHistory, archiveConfirmLog: user.archiveConfirmLog ?? null },
    update: { $set: { ...Object.fromEntries(values), archiveBaselineSources: sources, archiveVersionHistory: history, archiveConfirmLog: log } } };
}
module.exports = { buildInitialCorrection };
