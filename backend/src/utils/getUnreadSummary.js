const Message = require('../models/Message');
const PushRecord = require('../models/PushRecord');
const Order = require('../models/Order');
const { QuestionnaireResponse, DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');
const { visibleMessageQuery, unreadServiceGroupQuery, isInboxMessage, legacyAnnualItemNoticeFilter } = require('./messageInbox');
async function getUnreadSummary(userId) {
  const [unreadMessages, unreadPushes, groupUnread] = await Promise.all([
    Message.find(visibleMessageQuery(userId, true)).select('type questionnaireId conversationId sender title createdAt dedupeKey').sort({ createdAt: -1 }).lean(),
    PushRecord.find({ patientId: userId, readAt: null, withdrawnAt: null, ...legacyAnnualItemNoticeFilter })
      .select('type questionnaireId sourceOrderId').lean(),
    Message.countDocuments(unreadServiceGroupQuery(userId)),
  ]);
  const questionnairePushes = unreadPushes.filter(item => item.type === 'questionnaire' && item.questionnaireId);
  const activeQuestionnaireIds = new Set(questionnairePushes.length ? (await DynamicQuestionnaire.find({
    _id: { $in: questionnairePushes.map(item => item.questionnaireId) }, status: 'active', deletedAt: null,
  }).distinct('_id')).map(String) : []);
  const orderScopedPushes = questionnairePushes.filter(item => item.sourceOrderId);
  const validOrderIds = new Set(orderScopedPushes.length ? (await Order.find({
    _id: { $in: orderScopedPushes.map(item => item.sourceOrderId) },
    status: { $ne: 'cancelled' }, tradeStatus: { $nin: ['closed', 'refunded'] },
  }).distinct('_id')).map(String) : []);
  const responses = questionnairePushes.length ? await QuestionnaireResponse.find({
    user: userId,
    $or: [
      { pushRecordId: { $in: questionnairePushes.map(item => item._id) } },
      { pushRecordId: null, questionnaire: { $in: questionnairePushes.map(item => item.questionnaireId) } },
    ],
  }).select('pushRecordId questionnaire').lean() : [];
  const answeredPushIds = new Set(responses.filter(item => item.pushRecordId).map(item => String(item.pushRecordId)));
  const legacyAnsweredQuestionnaireIds = new Set(responses.filter(item => !item.pushRecordId).map(item => String(item.questionnaire)));
  const pushCount = unreadPushes.filter(item => item.type !== 'questionnaire'
    || (activeQuestionnaireIds.has(String(item.questionnaireId)) && !answeredPushIds.has(String(item._id))
      && (item.sourceOrderId ? validOrderIds.has(String(item.sourceOrderId)) : !legacyAnsweredQuestionnaireIds.has(String(item.questionnaireId))))).length;
  const pendingQuestionnaireIds = new Set(questionnairePushes.filter(item => activeQuestionnaireIds.has(String(item.questionnaireId)) && !answeredPushIds.has(String(item._id))
    && (item.sourceOrderId ? validOrderIds.has(String(item.sourceOrderId)) : !legacyAnsweredQuestionnaireIds.has(String(item.questionnaireId))))
    .map(item => String(item.questionnaireId)));
  const visibleUnread = unreadMessages.filter(item => isInboxMessage(item, userId)
    && (item.type !== 'questionnaire' || pendingQuestionnaireIds.has(String(item.questionnaireId))));
  const careNoticeCount = visibleUnread.filter(message => /^(medication-slot:|checkup-preparation-notice:)/.test(message.dedupeKey || '')).length;
  return { success: true, careNoticeCount, count: visibleUnread.length + pushCount + groupUnread, latestMessage: visibleUnread[0] || null };
}
module.exports = { getUnreadSummary };
