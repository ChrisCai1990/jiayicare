const { FIELD_MAP } = require('../config/archiveFields');
const { isDeepStrictEqual } = require('node:util');
// Explicit maintenance only, never automatic on read. Refuse ambiguous history.
function buildInitialCorrection(user, responseId) {
  const fail = () => { throw new Error('首次入档凭据不唯一或已有修改，拒绝自动校正'); };
  const entries = (user.archiveVersionHistory || []).filter(x => String(x.sourceResponseId) === String(responseId));
  if (!entries.length || user.archiveDraft) return fail();
  const values = new Map();
  for (const row of entries) {
    if (!row.confirmedBy || row.sourceType !== 'questionnaire' || !row.path.startsWith('lifestyle_data.') || !FIELD_MAP[row.path]
      || (row.from !== '' && row.from != null)) return fail();
    if (values.has(row.path) && !isDeepStrictEqual(values.get(row.path), row.to)) return fail();
    values.set(row.path, row.to);
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
    ...x, previousMode: x.mode, mode: all.slice(0, i).some(y => String(y.sourceResponseId) === String(responseId)) ? 'reconfirmation' : 'initial',
  });
  log.push({ mode: 'initial_classification_correction', correctedAt: new Date(), sourceResponseId: responseId,
    reason: '用户确认首次问卷应入基础档案；保留原审核记录，不重复审核', previousVersionEntries: entries });
  return { count: values.size, filter: { _id: user._id, archiveDraft: null, lifestyle_data: user.lifestyle_data ?? null,
    lifestyleHistory: user.lifestyleHistory ?? null, archiveVersionHistory: user.archiveVersionHistory, archiveConfirmLog: user.archiveConfirmLog ?? null },
    update: { $set: { ...Object.fromEntries(values), archiveVersionHistory: history, archiveConfirmLog: log } } };
}
module.exports = { buildInitialCorrection };
