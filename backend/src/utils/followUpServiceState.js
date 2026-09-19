function serviceOutcome(type, target) {
  if (!target) return { status: 'attention', message: '关联服务记录不存在，请核对并联系客户' };
  if (target.status === 'cancelled' || (type === 'order' && (['closed', 'refunded', 'refund_pending'].includes(target.tradeStatus) || ['requested', 'processing', 'refunded'].includes(target.refundStatus) || target.paymentStatus === 'refunded'))) {
    return { status: 'attention', message: '关联服务已取消或进入退款，请确认客户后续安排' };
  }
  if (target.fulfillmentStatus === 'failed' || target.supervisionStatus === 'needs_attention') return { status: 'attention', message: '关联服务执行异常，需要跟进处理' };
  if (target.status === 'completed') {
    if (type === 'order' && Number(target.totalUnits || 1) > 1 && Number(target.totalUnits) > Number(target.usedUnits || 0)) return { status: 'attention', message: '服务订单标记完成但次数尚未核销完，请核对' };
    return { status: 'completed', message: '关联服务已完整结束，系统自动完成随访' };
  }
  return { status: 'waiting', message: '服务进行中，随访保留为进度查看；当前操作按服务流程分派' };
}

function taskProjection(link, now = new Date()) {
  const waiting = link.status === 'waiting';
  const completed = link.status === 'completed';
  return {
    serviceTracking: { linkId: link._id, revision: link.__v || 0, status: link.status, title: link.title, message: link.message, targetType: link.targetType, targetId: link.targetId },
    status: completed ? 'completed' : waiting ? 'in_progress' : 'planned',
    isBlocked: waiting, completedAt: completed ? now : null, completedBy: completed ? 'staff' : null,
    ...(link.status === 'attention' ? { remindAt: now } : {}),
  };
}

function isServiceRequest(task) {
  return task?.taskRole === 'supervisor' && ((task.sourceType === 'professional_assessment' && task.workflowKey === 'professional_assessment:service_request') || (task.sourceType === 'annual_service' && task.workflowKey === 'service_request'));
}

module.exports = { serviceOutcome, taskProjection, isServiceRequest };
