function feedbackState(row) {
  return row.status === 'resolved' ? 'closed' : row.workflowState || 'unassigned';
}
const feedbackStateLabel = { unassigned: '待管理员分派', assigned: '负责人待处理', submitted: '待管理员核对', closed: '已回复并完成' };
module.exports = { feedbackState, feedbackStateLabel };
