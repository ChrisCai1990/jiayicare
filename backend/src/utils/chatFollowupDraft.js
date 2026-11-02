// Chat-derived service record drafts have been retired. Existing records remain reviewable.
async function generateChatFollowupDraft() {
  return { status: 'skip', message: '营养聊天草稿已停用' };
}

module.exports = { generateChatFollowupDraft };
