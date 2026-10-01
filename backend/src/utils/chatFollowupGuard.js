const { randomUUID } = require('crypto');
const Job = require('../models/ChatFollowupJob');
const ServiceRecord = require('../models/ServiceRecord');
const LEASE_MS = 10 * 60 * 1000;

// One guard shared by manual and scheduled generation. An interrupted database write
// is deliberately not retried: its outcome needs reconciliation, not another AI call.
async function withDraftGuard(options, generate) {
  const { patientId, tenantId = null, automaticCycle } = options;
  const id = `${patientId}_nutritionist`;
  try { await Job.updateOne({ _id: id }, { $setOnInsert: { patientId, tenantId, status: 'idle' } }, { upsert: true }); }
  catch (e) { if (e.code !== 11000) throw e; }
  const old = await Job.findById(id);
  if (options.expectedJobToken && (old.token !== options.expectedJobToken || !['failed', 'running'].includes(old.status))) {
    return { status: 'skip', message: '任务状态已变化，请刷新后核对' };
  }
  if (old.status === 'committing') {
    const saved = await ServiceRecord.findById(old.recordId);
    if (saved) {
      await Job.updateOne({ _id: id, token: old.token, status: 'committing' }, { $set: { status: 'done', error: '' } });
      return { status: 'reused', record: saved };
    }
    return { status: 'skip', message: '草稿保存结果待核实，请先由管理员核对，勿重复生成' };
  }
  if (old.status === 'running' && old.leaseUntil <= new Date()) {
    await Job.updateOne({ _id: id, token: old.token, status: 'running' }, { $set: { status: 'failed', error: '生成中断，请核对聊天后重试或人工记录' } });
  }
  const token = randomUUID();
  const filter = { _id: id, status: { $in: automaticCycle ? ['idle', 'done'] : ['idle', 'done', 'failed'] } };
  if (options.expectedJobToken) filter.token = options.expectedJobToken;
  if (automaticCycle) filter.cycle = { $ne: automaticCycle };
  const claimed = await Job.findOneAndUpdate(filter, { $set: {
    status: 'running', token, leaseUntil: new Date(Date.now() + LEASE_MS),
    ...(automaticCycle ? { cycle: automaticCycle, rangeStart: options.minimumRangeStart, rangeEnd: options.maximumRangeEnd } : ['failed', 'running'].includes(old.status) ? {} : { rangeStart: null, rangeEnd: null }), error: '', handledAt: null,
  } }, { new: true });
  if (!claimed) return { status: 'skip', message: '已有生成任务或异常待处理，请勿重复提交' };
  try {
    const result = await generate(async payload => {
      const recordId = new (require('mongoose').Types.ObjectId)();
      await new ServiceRecord({ ...payload, _id: recordId, tenantId }).validate();
      const fenced = await Job.findOneAndUpdate({ _id: id, token, status: 'running', leaseUntil: { $gt: new Date() } },
        { $set: { status: 'committing', recordId } }, { new: true });
      if (!fenced) throw new Error('生成任务已过期，请人工核对');
      // No upsert/recovery writer: a late original write cannot recreate a discarded draft.
      return ServiceRecord.create({ ...payload, _id: recordId, tenantId });
    }, automaticCycle || old.status === 'failed' || old.status === 'running' ? {
      minimumRangeStart: claimed.rangeStart, maximumRangeEnd: claimed.rangeEnd,
    } : {}, async (rangeStart, rangeEnd) => {
      const saved = await Job.updateOne({ _id: id, token, status: 'running' }, { $set: { rangeStart, rangeEnd } });
      if (!saved.matchedCount) throw new Error('生成任务已过期，请人工核对');
    });
    await Job.updateOne({ _id: id, token, status: { $in: ['running', 'committing'] } }, { $set: {
      status: result.status === 'failed' ? 'failed' : 'done', error: result.status === 'failed' ? result.message : '',
    } });
    return result;
  } catch (e) {
    await Job.updateOne({ _id: id, token, status: 'running' }, { $set: { status: 'failed', error: '生成失败，请核对聊天后重试或人工记录' } });
    throw e;
  }
}
module.exports = { withDraftGuard, LEASE_MS };
