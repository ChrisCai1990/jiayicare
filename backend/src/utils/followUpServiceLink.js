const { serviceOutcome, taskProjection } = require('./followUpServiceState');

async function projectLink(link) {
  const FollowUp = require('../models/FollowUp');
  const original = await FollowUp.findById(link.followUpId).lean();
  const management = require('./followUpContinuity').requiresOutcomeReview(original);
  const patch = taskProjection(link);
  // 版本单调递增：旧事件不能覆盖新关联或新的服务结果。
  await FollowUp.updateMany({ _id: { $in: management ? [link.requestTaskId] : [link.requestTaskId, link.followUpId] }, patientId: link.patientId,
    $or: [{ serviceTracking: null }, { 'serviceTracking.linkId': link._id, 'serviceTracking.revision': { $lt: link.__v || 0 } }],
    // 已手工终止或完成的事项保留历史；系统自身的完成可用于失败后的投影重试。
    $and: [{ $or: [{ status: { $nin: ['completed', 'cancelled'] } }, { 'serviceTracking.linkId': link._id, 'serviceTracking.status': 'completed' }] }],
  }, { $set: patch });
  if (management) await FollowUp.updateOne({ _id: link.followUpId, patientId: link.patientId,
    status: { $nin: ['completed', 'cancelled'] }, outcomeReview: null,
    $or: [{ serviceTracking: null }, { 'serviceTracking.linkId': link._id, 'serviceTracking.revision': { $lt: link.__v || 0 } }],
  }, { $set: taskProjection({ ...link, message: link.status === 'completed'
    ? '服务履约已完成，原计划继续等待报告审核与顾问结果处置' : link.message }, new Date(), true) });
}

async function reconcileServiceLinks(filter = {}) {
  const Link = require('../models/FollowUpServiceLink');
  const Order = require('../models/Order');
  const HealthPlan = require('../models/HealthPlan');
  const links = await Link.find(filter).lean();
  let count = 0;
  for (let link of links) {
    // attention 已交人工处理，不能被旧服务后续事件自动重新关闭。
    if (link.status === 'waiting') {
      const Target = link.targetType === 'order' ? Order : HealthPlan;
      const target = await Target.findOne({ _id: link.targetId, [link.targetType === 'order' ? 'user' : 'patientId']: link.patientId }).lean();
      const outcome = serviceOutcome(link.targetType, target);
      if (outcome.status !== link.status || outcome.message !== link.message) {
        const updated = await Link.findOneAndUpdate({ _id: link._id, __v: link.__v }, {
          $set: outcome, $inc: { __v: 1 }, $push: { history: { ...outcome, at: new Date(), event: 'service_state' } },
        }, { new: true }).lean();
        if (!updated) continue;
        link = updated;
      }
    }
    await projectLink(link);
    count++;
  }
  return count;
}

// 只影响显式关联的管理随访；关联同步失败不使原有订单/服务动作失败。
async function safeReconcileServiceLinks(filter) {
  try { return await reconcileServiceLinks(filter); }
  catch (error) { console.error('[followup-service-link] sync deferred:', error.message); return 0; }
}

module.exports = { projectLink, reconcileServiceLinks, safeReconcileServiceLinks };
