const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const Admin = require('../models/Admin');
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
    if (!['healthManager', 'superadmin'].includes(staff.role)) return '请由健管专员确认首诊预约';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(required(data.appointmentDate)) || !required(data.appointmentTime) || !required(data.campus))
      return '请填写确认后的就诊日期、时间及院区；尚未约妥时保存为处理中';
  }
  if (stage === 'planner') {
    if (!['healthPlanner', 'superadmin'].includes(staff.role)) return '请由健康规划师指定陪诊人员';
    if (!required(data.escortStaffId)) return '请从员工库选择首次陪诊人员';
  }
  if (stage === 'escort') {
    if (!['medicalAssistant', 'superadmin'].includes(staff.role)) return '请由指定的陪诊人员确认碰面安排';
    if (!required(data.meetingPoint) || !required(data.contactArrangement)) return '请填写具体碰面地点和联系安排';
  }
  return '';
}

async function precheckAdvance(task, body) {
  if (body.status !== 'completed') return '';
  const stage = stageOf(task);
  if (stage === 'booking') {
    const order = await Order.findById(task.sourceOrderId);
    if (!order?.supervisorId) return '订单尚未指定健康规划师，无法流转陪诊人员安排';
  }
  if (stage === 'planner') {
    const order = await Order.findById(task.sourceOrderId);
    const staffId = required(body.formData?.escortStaffId);
    if (!/^[a-f\d]{24}$/i.test(staffId)) return '请选择员工库中的陪诊人员';
    const filter = { _id: staffId, role: 'medicalAssistant', staffStatus: { $ne: 'inactive' } };
    if (order?.tenantId) filter.tenantId = order.tenantId;
    if (!(await Admin.exists(filter))) return '请选择本机构在职的就医专员作为陪诊人员';
  }
  return '';
}

async function createTask(order, assignee, stage, content, formData = {}) {
  const filter = { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}` };
  try {
    return await FollowUp.findOneAndUpdate(filter, { $setOnInsert: {
      patientId: order.user, staffId: assignee, assignedTo: assignee,
      date: new Date(), remindAt: new Date(), type: 'other', status: 'planned',
      theme: `IBD 年度管理：${{ advisor: '健康顾问确定首诊方案', booking: '健管专员确认首诊预约', planner: '健康规划师指定陪诊人员', escort: '陪诊人员确认碰面安排' }[stage]} · ${order.serviceName}`,
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
  if (!['advisor', 'booking', 'planner', 'escort'].includes(stage)) return;
  const order = await Order.findById(task.sourceOrderId);
  if (!order || !isIbdOrder(order)) return;
  if (stage === 'escort') {
    await Order.updateOne({ _id: order._id }, { $set: {
      currentStage: 'ibd_awaiting_first_visit', currentAssignee: null, supervisionStatus: 'in_progress',
    } });
    return;
  }
  if (stage === 'planner') {
    const assignment = task.formData || {};
    const escort = await createTask(order, assignment.escortStaffId, 'escort',
      '请与客户确定具体碰面地点和联系安排，并在就诊前告知客户；就诊变化及时反馈健康顾问。',
      { proposal: assignment.proposal, appointmentDate: assignment.appointmentDate,
        appointmentTime: assignment.appointmentTime, campus: assignment.campus,
        escortStaffId: assignment.escortStaffId, meetingPoint: '', contactArrangement: '' });
    await Order.updateOne({ _id: order._id }, { $set: {
      currentStage: 'ibd_escort_meeting', currentAssignee: assignment.escortStaffId, supervisionStatus: 'in_progress',
    } });
    return escort;
  }
  if (stage === 'booking') {
    if (!order.supervisorId) throw Object.assign(new Error('订单尚未指定健康规划师'), { status: 409 });
    const booking = task.formData || {};
    const planner = await createTask(order, order.supervisorId, 'planner',
      '首诊预约已确认。请从员工库指定本次陪诊人员，由陪诊人员确认具体碰面地点。',
      { proposal: booking.proposal, appointmentDate: booking.appointmentDate,
        appointmentTime: booking.appointmentTime, campus: booking.campus, escortStaffId: '' });
    await Order.updateOne({ _id: order._id }, { $set: {
      currentStage: 'ibd_planner_assignment', currentAssignee: order.supervisorId, supervisionStatus: 'in_progress',
    } });
    return planner;
  }
  const patient = await User.findById(order.user).select('assignedHealthManager').lean();
  if (!patient?.assignedHealthManager) throw Object.assign(new Error('客户尚未分配健管专员，无法流转预约'), { status: 409 });
  const proposal = task.formData || {};
  const booking = await createTask(order, patient.assignedHealthManager, 'booking',
    `健康顾问已确定首诊建议：${proposal.hospital}，${proposal.campus ? `${proposal.campus}，` : ''}${proposal.department}，${proposal.expert}。就诊目的：${proposal.visitPurpose}。请联系专科确认首诊日期、时间及院区；号源或时间变动及时反馈健康顾问。`,
    { proposal, appointmentDate: '', appointmentTime: '', campus: proposal.campus || '' });
  await Order.updateOne({ _id: order._id }, { $set: {
    currentStage: 'ibd_booking', currentAssignee: patient.assignedHealthManager, supervisionStatus: 'in_progress',
  } });
  return booking;
}

module.exports = { PREFIX, stageOf, validate, precheckAdvance, start, advance };
