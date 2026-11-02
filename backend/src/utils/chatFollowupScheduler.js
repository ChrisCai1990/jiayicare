// Kept as an inert compatibility entry point for older callers.
async function scanAndGenerateChatFollowupDrafts() {
  return { status: 'skip', message: '营养聊天草稿已停用' };
}

function startChatFollowupScheduler() {
  return null;
}

module.exports = { scanAndGenerateChatFollowupDrafts, startChatFollowupScheduler };
