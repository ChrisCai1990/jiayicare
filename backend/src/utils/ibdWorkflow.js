const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const { isIbdOrder } = require('./ibdServiceTerms');
const { advisorDraft } = require('../../../shared/ibdIntake.cjs');

const PREFIX = 'ibd:';
const stageOf = task => String(task?.workflowKey || '').startsWith(PREFIX)
  ? String(task.workflowKey).slice(PREFIX.length) : '';
const required = value => String(value || '').trim();

function validate(task, body, staff) {
  const stage = stageOf(task);
  if (!stage || body.status !== 'completed') return '';
  const data = body.formData || {};
  if (stage === 'advisor') {
    if (!['familyDoctor', 'superadmin'].includes(staff.role)) return '请由健康顾问确定专科就诊方案';
    if (!required(data.hospital) || !required(data.department) || !required(data.expert) || !required(data.visitPurpose))
      return '请填写医院、科室、专家及本次就诊目的，再转健管专员预约';
  }
  if (stage === 'booking') {
    if (!['healthManager', 'superadmin'].includes(staff.role)) return '请由健管专员确认预约与首次陪诊';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(required(data.appointmentDate)) || !required(data.appointmentTime) || !required(data.escortArrangement))
      return '请填写确认后的就诊日期、时间及首次陪诊安排；尚未约妥时保存为处理中';
  }
  return '';
}

async function createTask(order, assignee, stage, content, formData = {}) {
  const filter = { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}` };
  try {
    return await FollowUp.findOneAndUpdate(filter, { $setOnInsert: {
      patientId: order.user, staffId: assignee, assignedTo: assignee,
      date: new Date(), remindAt: new Date(), type: 'other', status: 'planned',
      theme: `IBD 年度管理：${stage === 'advisor' ? '健康顾问确定首诊方案' : '健管专员预约及首次陪诊'} · ${order.serviceName}`,
      content, plannedContent: content, sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}${stage}`, assessmentActionKey: `ibd:${order._id}:${stage}`, formData,
    } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await FollowUp.findOne(filter);
    if (!existing) throw error;
    return existing;
  }
}

async function start(order, plannerId, { scheduledAt, serviceDateEnd, note } = {}) {
  if (!isIbdOrder(order)) throw Object.assign(new Error('不是 IBD 专病订单'), { status: 400 });
  const bookingAlreadyStarted = await FollowUp.findOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}booking` });
  if (bookingAlreadyStarted) return bookingAlreadyStarted;
  const completedAdvisor = await FollowUp.findOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor`, status: 'completed' });
  if (completedAdvisor) return advance(completedAdvisor);
  const patient = await User.findById(order.user).select('assignedFamilyDoctor assignedHealthManager').lean();
  if (!patient?.assignedFamilyDoctor) throw Object.assign(new Error('请先为客户分配健康顾问'), { status: 409 });
  if (!patient?.assignedHealthManager) throw Object.assign(new Error('请先为客户分配健管专员'), { status: 409 });
  const advisor = await createTask(order, patient.assignedFamilyDoctor, 'advisor',
    '请核对客户资料、意向机构和就诊时间，确定医院、科室、专家及本次就诊目的；诊疗方案由专科医师决定。',
    advisorDraft({ customerRequest: note || order.note || '', preferredDateStart: scheduledAt || null, preferredDateEnd: serviceDateEnd || '' }, note || order.note));
  await Order.updateOne({ _id: order._id }, { $set: {
    status: 'scheduled', handledBy: plannerId, supervisorId: plannerId,
    currentStage: 'ibd_advisor', currentAssignee: patient.assignedFamilyDoctor,
    supervisionStatus: 'in_progress',
    ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
    ...(serviceDateEnd ? { desiredServiceDateEnd: new Date(`${serviceDateEnd}T00:00:00+08:00`) } : {}),
    ...(note ? { note } : {}),
  } });
  await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: order._id,
    workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } },
  { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', executedContent: '健康规划师已核对客户需求并转健康顾问确定首诊方案。' } });
  return advisor;
}

async function advance(task) {
  const stage = stageOf(task);
  if (!['advisor', 'booking'].includes(stage)) return;
  const order = await Order.findById(task.sourceOrderId);
  if (!order || !isIbdOrder(order)) return;
  if (stage === 'booking') {
    await Order.updateOne({ _id: order._id }, { $set: {
      currentStage: 'ibd_awaiting_first_visit', currentAssignee: null, supervisionStatus: 'in_progress',
    } });
    return;
  }
  const patient = await User.findById(order.user).select('assignedHealthManager').lean();
  if (!patient?.assignedHealthManager) throw Object.assign(new Error('客户尚未分配健管专员，无法流转预约'), { status: 409 });
  const proposal = task.formData || {};
  const booking = await createTask(order, patient.assignedHealthManager, 'booking',
    `健康顾问已确定首诊建议：${proposal.hospital}，${proposal.department}，${proposal.expert}。就诊目的：${proposal.visitPurpose}。请联系专科预约并安排首次陪诊；号源或时间变动及时反馈健康顾问。`,
    { proposal, appointmentDate: '', appointmentTime: '', escortArrangement: '' });
  await Order.updateOne({ _id: order._id }, { $set: {
    currentStage: 'ibd_booking', currentAssignee: patient.assignedHealthManager, supervisionStatus: 'in_progress',
  } });
  return booking;
}

module.exports = { PREFIX, stageOf, validate, start, advance };
