const { createHash, randomUUID } = require('crypto');
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && value.constructor === Object) return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
async function reuseAnnualGeneration(collection, input, generate) {
  const id = fingerprint(input), owner = randomUUID();
  const prior = await collection.findOne({ _id: id });
  if (prior?.status === 'ready') return { raw: prior.raw, fingerprint: id, reused: true, createdAt: prior.createdAt };
  const createdAt = new Date();
  if (prior) {
    if (prior.status !== 'failed' && createdAt - new Date(prior.createdAt) < 180000) throw fail('相同依据正在生成，请稍后重试');
    const claimed = await collection.updateOne({ _id: id, owner: prior.owner, status: prior.status }, { $set: { status: 'running', owner, createdAt } });
    if (!claimed.modifiedCount) throw fail('相同依据正在生成，请稍后重试');
  } else try { await collection.insertOne({ _id: id, patientId: input.patientId, status: 'running', owner, createdAt, input }); }
  catch (error) { if (error.code === 11000) throw fail('相同依据正在生成，请稍后重试'); throw error; }
  try {
    const raw = await generate();
    const saved = await collection.updateOne({ _id: id, owner, status: 'running' }, { $set: { status: 'ready', raw, finishedAt: new Date() } });
    if (!saved.modifiedCount) throw fail('生成锁已变化，请重新读取草稿');
    return { raw, fingerprint: id, reused: false, createdAt };
  } catch (error) {
    await collection.updateOne({ _id: id, owner }, { $set: { status: 'failed', finishedAt: new Date(), errorCode: 'GENERATION_VALIDATION_FAILED', ...(error.generationRaw ? { rejectedRaw: error.generationRaw } : {}) } });
    throw error;
  }
}
function validateAnnualRaw(raw, catalog, evidence = [], allowedKeys = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail('AI方案结构不完整，未替换现有方案');
  if (allowedKeys) for (const [key, value] of Object.entries(raw)) {
    if (!['templateNodes', 'evidenceCoverage', ...allowedKeys].includes(key) && value && Object.keys(value).length) throw fail(`AI生成了不允许的${key}模块，未静默删除`);
  }
  const sources = new Map(catalog.map(item => [String(item.id), item]));
  for (const key of ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'annual_checkup', 'templateNodes']) {
    const value = raw[key];
    if (value == null) throw fail(`AI缺少${key}筛查结果，未替换现有方案`);
    if (key === 'annual_checkup' && (typeof value !== 'object' || Array.isArray(value))) throw fail('年度体检格式不正确');
    if (key !== 'annual_checkup' && !Array.isArray(value)) throw fail(`AI的${key}格式不正确`);
    const rows = key === 'annual_checkup' ? (Object.keys(value).length ? [value] : []) : value;
    const seen = new Set();
    for (const row of rows) {
      if (key === 'annual_checkup' && !require('./annualFocusRepair').hasFocus(row)) throw fail('年度体检缺少明确内容');
      const source = sources.get(String(row.standardPlanId || ''));
      if (!source || source.category !== (key === 'templateNodes' ? 'personalized' : key)) throw fail(`${key}存在模板不匹配项目，未删除项目，请核对生成记录`);
      if (!String(row.basisSummary || row.reason || row.matchReason || '').trim()) throw fail(`${key}缺少来源依据，未替换现有方案`);
      const identity = String(row.items || row.name || row.reason || row.focus || row.standardPlanId).trim();
      if (seen.has(identity)) throw fail(`${key}存在重复事项，未替换现有方案`);
      seen.add(identity);
    }
  }
  if (raw.lifestyle && Object.keys(raw.lifestyle).length && (Array.isArray(raw.lifestyle) || !String(raw.lifestyle.focus || '').trim())) throw fail('生活方式模块格式不完整');
  if (evidence.length) {
    const coverage = raw.evidenceCoverage;
    if (!Array.isArray(coverage) || coverage.length !== evidence.length) throw fail('AI未逐项核对全部来源，未替换现有方案');
    const valid = new Set(evidence.map(item => item.id));
    const seen = new Set();
    const rows = Object.entries(raw).filter(([key]) => key !== 'evidenceCoverage').flatMap(([, value]) => Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []);
    for (const item of coverage) {
      if (!valid.has(item.sourceId) || seen.has(item.sourceId) || !['included', 'deferred', 'not_applicable'].includes(item.status) || !String(item.reason || '').trim()) throw fail('AI来源核对不完整或重复');
      seen.add(item.sourceId);
      if (item.status === 'included' && !rows.some(row => row.sourceIds?.includes(item.sourceId))) throw fail('AI声称已纳入来源但遗漏对应事项');
    }
    for (const row of rows) if (row.standardPlanId && (!Array.isArray(row.sourceIds) || !row.sourceIds.length || row.sourceIds.some(id => !valid.has(id)))) throw fail('AI事项缺少有效来源关联');
  }
  return raw;
}
module.exports = { fingerprint, reuseAnnualGeneration, validateAnnualRaw };
