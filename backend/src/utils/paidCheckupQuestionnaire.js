const crypto = require('crypto');
const Order = require('../models/Order');
const PushRecord = require('../models/PushRecord');
const { DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');

// The questionnaire is a paid-service benefit. Never expose it for an unpaid order.
async function ensurePaidCheckupQuestionnaire(order) {
  const questionnaireId = order.serviceWorkflowSnapshot?.questionnaireId;
  if (order.serviceWorkflowSnapshot?.key !== 'checkup' || !questionnaireId || order.paymentStatus !== 'paid') return false;
  if (order.checkupIntake?.status === 'submitted') return true;
  try {
    const questionnaire = await DynamicQuestionnaire.findOne({ _id: questionnaireId, status: 'active', deletedAt: null }).select('title description');
    if (!questionnaire) throw new Error('绑定的体检问卷不存在或未启用');
    const pushId = crypto.createHash('sha256').update(`paid-checkup-questionnaire:${order._id}`).digest('hex').slice(0, 24);
    const existing = await PushRecord.findOne({ patientId: order.user, sourceOrderId: order._id, type: 'questionnaire', questionnaireId });
    if (!existing) await PushRecord.updateOne({ _id: pushId }, { $setOnInsert: {
      staffId: order.supervisorId, patientId: order.user, type: 'questionnaire', questionnaireId,
      sourceOrderId: order._id, title: questionnaire.title,
      content: `体检服务已支付，请填写《${questionnaire.title}》，提交后由健康顾问在24小时内定制体检方案。`,
    } }, { upsert: true });
    await DynamicQuestionnaire.updateOne({ _id: questionnaireId }, { $addToSet: { targetUsers: order.user } });
    await Order.updateOne({ _id: order._id, paymentStatus: 'paid', 'checkupIntake.status': { $ne: 'submitted' } }, { $set: {
      checkupIntake: { questionnaireId, status: 'pending', pushedAt: new Date() },
    } });
    return true;
  } catch (error) {
    console.error('[checkup-questionnaire] paid order push failed', { orderId: String(order._id), error: error.message });
    await Order.updateOne({ _id: order._id, paymentStatus: 'paid', 'checkupIntake.status': { $nin: ['pending', 'submitted'] } }, { $set: {
      checkupIntake: { questionnaireId, status: 'push_failed', failedAt: new Date() },
    } }).catch(updateError => console.error('[checkup-questionnaire] failed to record retry state', updateError.message));
    return false;
  }
}

module.exports = { ensurePaidCheckupQuestionnaire };
