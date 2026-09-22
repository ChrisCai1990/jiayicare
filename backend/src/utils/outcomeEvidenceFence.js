const { randomUUID, createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const INTERNAL = Symbol('outcome-evidence-write');
const internal = query => { query[INTERNAL] = true; return query; };
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
function outcomeEvidenceFence(schema) {
  schema.add({ outcomeEvidenceLock: { type: Object, default: null } });
  schema.pre('save', function () {
    if (!this.isNew) this.$where = { ...this.$where, outcomeEvidenceLock: null, 'outcomeClosureIntent.status': { $ne: 'running' } };
  });
  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(op, { query: true, document: false }, function () {
      if (this[INTERNAL]) return;
      // Keep equality keys at the top level. Mongoose uses them when deciding
      // which defaults to add on upsert; nesting the whole filter caused source
      // identifiers to be defaulted to null in newly generated service tasks.
      const filter = this.getFilter();
      this.setQuery({ ...filter, $and: [...(filter.$and || []), { outcomeEvidenceLock: null, 'outcomeClosureIntent.status': { $ne: 'running' } }] });
    });
  }
}
async function releaseEvidence(models, intent) {
  for (const target of intent?.targets || []) {
    await internal(models[target.model].updateOne({ _id: target.id, 'outcomeEvidenceLock.token': intent.token },
      { $set: { outcomeEvidenceLock: null } }, { timestamps: false }));
  }
}
async function fencedClose({ models, task, actor, body, evidence, proof, now }) {
  const FollowUp = models.FollowUp;
  const hash = createHash('sha256').update(JSON.stringify({ actor: String(actor._id), body })).digest('hex');
  const prior = task.outcomeClosureIntent;
  if (prior?.status === 'running' && prior.hash !== hash) throw fail('上次结果处置尚未完成，请先重试原提交，不覆盖待处理决定');
  const token = randomUUID();
  const revoked = prior?.status === 'running' ? [...new Set([...(prior.revoked || []), prior.token])] : [];
  const targets = [...new Map(evidence.map(x => [`${x.model}:${x.row._id}`, x])).values()]
    .sort((a, b) => `${a.model}:${a.row._id}`.localeCompare(`${b.model}:${b.row._id}`));
  if (targets.some(x => !x.row.updatedAt || !Number.isFinite(new Date(x.row.updatedAt).getTime()))) throw fail('结案依据缺少版本时间，请先核对资料');
  const intent = { status: 'running', token, hash, revoked, input: body, actorId: actor._id,
    targets: targets.map(x => ({ model: x.model, id: x.row._id })), startedAt: now };
  const claimed = await internal(FollowUp.findOneAndUpdate({ _id: task._id, updatedAt: task.updatedAt, status: task.status,
    outcomeReview: null, outcomeEvidenceLock: null, 'outcomeClosureIntent.token': prior?.token || null },
  { $set: { outcomeClosureIntent: intent } }, { new: true, timestamps: false }));
  if (!claimed) throw fail('计划正在更新，请刷新核对');
  try {
    for (const { model, row } of targets) {
      const locked = await internal(models[model].updateOne({ _id: row._id, updatedAt: row.updatedAt,
        'outcomeClosureIntent.status': { $ne: 'running' },
        $or: [{ outcomeEvidenceLock: null }, { 'outcomeEvidenceLock.owner': String(task._id), 'outcomeEvidenceLock.token': { $in: [token, ...revoked] } }] },
      { $set: { outcomeEvidenceLock: { owner: String(task._id), token } } }, { timestamps: false }));
      if (locked.modifiedCount !== 1) throw fail('结案依据已更新或正在处理，原计划保持开放，请刷新核对');
      // Timestamps alone are not a revision: two writes can share one millisecond.
      // Re-read under the acquired fence and compare the complete source snapshot.
      const fresh = await models[model].findById(row._id).lean();
      const snapshot = value => { const copy = { ...value }; delete copy.outcomeEvidenceLock; return copy; };
      if (!fresh || !isDeepStrictEqual(snapshot(fresh), snapshot(row))) throw fail('结案依据内容已变化，请刷新核对');
    }
    const updated = await internal(FollowUp.findOneAndUpdate({ _id: task._id, patientId: task.patientId, updatedAt: task.updatedAt,
      status: task.status, outcomeReview: null, 'outcomeClosureIntent.token': token },
    { $set: { status: 'completed', completedAt: now, completedBy: 'staff', isBlocked: false, outcomeReview: proof,
      outcomeClosureIntent: { ...intent, status: 'completed' } }, $inc: { __v: 1 } }, { new: true }));
    if (!updated) throw fail('另一请求已接管结果处置，请刷新核对');
    await releaseEvidence(models, intent);
    return updated;
  } catch (error) {
    // Only this token may release its locks. A resumed worker replaces the parent
    // token before taking over sources, fencing a still-running previous worker.
    await releaseEvidence(models, intent);
    await internal(FollowUp.updateOne({ _id: task._id, status: task.status, outcomeReview: null, 'outcomeClosureIntent.token': token },
      { $set: { outcomeClosureIntent: null } }, { timestamps: false }));
    throw error;
  }
}
module.exports = { outcomeEvidenceFence, internal, releaseEvidence, fencedClose };
