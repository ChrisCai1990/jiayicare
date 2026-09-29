const id = value => String(value?._id || value || '');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
function futureDate(value, now = new Date()) {
  const date = new Date(value);
  if (!value || !Number.isFinite(+date) || +date <= +now) fail('请填写未来的下次跟进时间');
  return date;
}
// Two working hours, Monday-Friday 09:00-17:00, China standard time.
function responseDueAt(createdAt) {
  const d = new Date(+new Date(createdAt) + 8 * 3600000);
  if (!Number.isFinite(+d)) return null;
  let remaining = 120;
  while (remaining > 0) {
    if ([0, 6].includes(d.getUTCDay()) || d.getUTCHours() >= 17) {
      d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(9, 0, 0, 0); continue;
    }
    if (d.getUTCHours() < 9) d.setUTCHours(9, 0, 0, 0);
    const end = new Date(d); end.setUTCHours(17, 0, 0, 0);
    const minutes = Math.min(remaining, (+end - +d) / 60000);
    d.setTime(+d + minutes * 60000); remaining -= minutes;
  }
  return new Date(+d - 8 * 3600000);
}
function progress(intake, order, plan, tasks = [], now = new Date()) {
  const active = tasks.filter(t => ['planned', 'in_progress', 'missed'].includes(t.status) && t.taskRole !== 'supervisor');
  const orderEnded = order && (['completed', 'closed', 'refunded'].includes(order.tradeStatus) || ['completed', 'cancelled'].includes(order.status));
  const planEnded = plan && ['completed', 'cancelled'].includes(plan.status);
  const linked = Boolean(intake.orderId || intake.planId);
  const missing = Boolean((intake.orderId && !order) || (intake.planId && !plan));
  const canClose = !missing && !active.length && (!order || orderEnded) && (!plan || planEnded);
  let stage = '待落实服务', waiting = '请确认服务安排并关联实际订单或服务方案';
  if (missing) { stage = '关联记录待核对'; waiting = '关联记录不可见或不存在，请核对原服务'; }
  else if (intake.status === 'closed') { stage = '承接已关闭'; waiting = intake.closureReason; }
  else if (order && !orderEnded && !['paid', 'fulfilling', 'completed'].includes(order.tradeStatus) && order.paymentStatus !== 'paid') { stage = '待确认支付'; waiting = '以原订单支付状态为准，不重复创建订单'; }
  else if (active.length) { stage = '服务办理中'; waiting = active.every(t => t.isBlocked) ? '等待前置环节或资料审核' : '等待当前责任人办理'; }
  else if (linked && canClose) { stage = '原服务已结束，待承接复核'; waiting = '核对原服务结果和后续安排后记录承接结论'; }
  else if (linked) { stage = '待核对履约安排'; waiting = '尚不能从已生成任务推断服务完成，请打开原服务核对'; }
  return { stage, waiting, canClose, overdue: intake.status === 'open' && +new Date(intake.nextContactAt) < +now,
    current: active.map(t => ({ id: id(t), label: t.theme || '待处理事项', assignee: t.assignedTo?.name || '未明确处理人', blocked: !!t.isBlocked })) };
}
module.exports = { id, fail, futureDate, responseDueAt, progress };
