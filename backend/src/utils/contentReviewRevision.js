const crypto = require('node:crypto');

function revisionToken(record) {
  // updatedAt 会被旧版读列表的补全操作改动，不用它作为内容版本。
  return crypto.createHash('sha256').update(JSON.stringify([
    String(record._id), record.__v || 0, record.status, record.currentRole,
    record.title, record.summary, record.sourceContent, record.reviewChain,
    record.nutritionReview, record.doctorReview, record.auditLog, record.revisions,
  ])).digest('hex');
}

function prepareRevision(record, input, now = new Date()) {
  if (record.status !== 'changes_requested') throw new Error('稿件不是待修订状态');
  if (input.expectedToken !== revisionToken(record)) throw new Error('稿件或审核意见已变化，请重新读取');
  const returned = [...(record.auditLog || [])].reverse().find(x => x.action === 'return');
  if (!returned?.note?.trim()) throw new Error('缺少明确的退回意见，不能自动修订');
  if (!record.reviewChain?.length || record.reviewChain.some(x => !['nutritionist', 'familyDoctor'].includes(x))) throw new Error('审核链无效');
  const fields = { title: 120, summary: 500, sourceContent: 12000 };
  const next = {};
  for (const [key, max] of Object.entries(fields)) {
    const value = input[key] === undefined ? record[key] : input[key];
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`无效字段：${key}`);
    next[key] = value.trim();
  }
  if (!Object.keys(fields).some(key => next[key] !== record[key])) throw new Error('未修改内容，不能重新送审');
  if (typeof input.changeSummary !== 'string' || !input.changeSummary.trim() || input.changeSummary.length > 2000) throw new Error('必须填写修订说明');
  const before = Object.fromEntries(Object.keys(fields).map(key => [key, record[key]]));
  return {
    next,
    revision: { at: now, actor: 'AI编辑助手', expectedToken: input.expectedToken,
      changeSummary: input.changeSummary.trim(), before, after: next,
      nutritionReview: record.nutritionReview, doctorReview: record.doctorReview,
      returnNote: returned.note, returnRole: returned.role },
    audit: { action: 'resubmit', role: 'editor', note: input.changeSummary.trim(), byName: 'AI编辑助手', at: now },
    currentRole: record.reviewChain[0],
  };
}

async function resubmitRevision(collection, record, input) {
  const { next, revision, audit, currentRole } = prepareRevision(record, input);
  const filter = { _id: record._id, status: 'changes_requested', sourceContent: record.sourceContent,
    title: record.title, summary: record.summary, currentRole: record.currentRole,
    reviewChain: record.reviewChain, auditLog: record.auditLog,
    __v: record.__v === undefined ? { $exists: false } : record.__v };
  const result = await collection.updateOne(filter, {
    $set: { ...next, status: 'pending', currentRole, updatedAt: revision.at,
      sourceUpdatedAt: revision.at.toISOString().slice(0, 10),
      nutritionReview: { status: 'pending' }, doctorReview: { status: 'pending' }, publishChecklist: {} },
    $push: { revisions: revision, auditLog: audit }, $inc: { __v: 1 },
  });
  if (result.modifiedCount !== 1) throw new Error('版本冲突或已重新送审，未覆盖现有内容');
  return { slug: record.slug, status: 'pending', currentRole };
}
module.exports = { revisionToken, prepareRevision, resubmitRevision };
