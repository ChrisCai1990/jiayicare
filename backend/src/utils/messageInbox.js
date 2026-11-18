const { conversationRoleKeys } = require('./conversationRoles');

// 旧版年度方案逐项保存产生的通知仅供后台留痕，不再占用客户收件箱和未读角标。
const legacyAnnualItemNoticeFilter = {
  content: { $not: /^您的年度方案中“.+”已(?:取消|修订)，点击通知查看完整方案。$/ },
};

// Inbox, unread badge and conversation threads must expose the same reviewed messages.
function visibleMessageQuery(user, unreadOnly = false) {
  return {
    user,
    recalled: { $ne: true },
    'action.type': { $ne: 'service_group' },
    ...(unreadOnly ? { unread: true, type: { $ne: 'user' } } : {}),
    $or: [{ aiGenerated: { $ne: true } }, { aiReviewStatus: { $in: ['', 'approved'] } }],
  };
}

function isInboxMessage(message, userId) {
  if (message.type === 'user') return false;
  if (['system', 'questionnaire', 'knowledge', 'plan', 'supplement', 'product', 'notice'].includes(message.type)) return true;
  // A conversation ID takes priority over legacy type attribution, just as /thread does.
  if (message.conversationId) return conversationRoleKeys.some(role => String(message.conversationId) === `${userId}_${role}`);
  return conversationRoleKeys.includes(message.type);
}

function mergeInboxRecords(recent, unread) {
  return [...new Map([...recent, ...unread].map(item => [String(item._id), item])).values()]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

module.exports = { visibleMessageQuery, isInboxMessage, mergeInboxRecords, legacyAnnualItemNoticeFilter };
