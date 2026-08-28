function reviewedWriteback({ staff, sourceType = 'ai_draft', sourceTaskId = null, at = new Date() }) {
  if (!staff?._id) throw new Error('自动回写必须记录人工审核人');
  return {
    sourceType,
    sourceTaskId,
    status: 'written',
    reviewedBy: staff._id,
    reviewedByName: staff.name || '',
    reviewedByRole: staff.role || '',
    reviewedAt: at,
    writtenAt: at,
  };
}

module.exports = { reviewedWriteback };
