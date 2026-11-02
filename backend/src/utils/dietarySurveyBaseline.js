const { isDeepStrictEqual } = require('node:util');
const { buildArchiveDraft, getByPath } = require('./archiveImport');
const { effectiveLifestyle } = require('./effectiveLifestyle');

const empty = value => value == null || value === '' || (Array.isArray(value) && value.length === 0);

function buildMutation(user, questionnaire, response, now = new Date()) {
  const draft = buildArchiveDraft(user, questionnaire, response);
  const current = effectiveLifestyle(user);
  const sources = { ...(user.archiveBaselineSources || {}) };
  const set = {};
  const filter = { _id: user._id, archiveBaselineSources: user.archiveBaselineSources ?? null,
    lifestyleHistory: user.lifestyleHistory ?? null, archiveVersionHistory: user.archiveVersionHistory ?? null };
  for (const item of draft.items) {
    if (!item.path.startsWith('lifestyle_data.')) continue;
    const key = item.path.replace(/\./g, '__');
    if (sources[key] || !empty(current[item.path.slice(15)])) continue;
    const raw = getByPath(user, item.path);
    if (!empty(raw)) continue;
    if (Object.hasOwn(set, item.path) && !isDeepStrictEqual(set[item.path], item.value)) continue;
    filter[item.path] = raw ?? null;
    set[item.path] = item.value;
    sources[key] = { responseId: response._id, questionnaireId: questionnaire._id,
      establishedAt: response.submittedAt || now, sourceType: 'customer_questionnaire', value: item.value };
  }
  if (!Object.keys(set).length) return null;
  set.archiveBaselineSources = sources;
  return { filter, update: { $set: set } };
}

async function importBaseline(User, patientId, questionnaire, response) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const user = await User.findById(patientId).lean();
    if (!user) throw new Error('会员不存在');
    const mutation = buildMutation(user, questionnaire, response);
    if (!mutation) return 0;
    const result = await User.collection.updateOne(mutation.filter, mutation.update);
    if (result.matchedCount) return Object.keys(mutation.update.$set).length - 1;
  }
  throw new Error('生活方式档案同时发生变化，请稍后重试导入');
}

module.exports = { buildMutation, importBaseline };
