const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const User = require('../models/User');

const PREFIX = 'checkup_appointment:';
const isCheckupAppointmentOrder = order => {
  const text = typeof order === 'object'
    ? [order?.serviceName, order?.specificationLabel, order?.serviceRequirements, order?.note, order?.serviceWorkflowSnapshot?.key].filter(Boolean).join(' ')
    : String(order || '');
  return /checkup_appointment|待约检|代约检|常规约检|特殊约检/.test(text);
};
const stageOf = task => String(task?.workflowKey || '').startsWith(PREFIX)
  ? String(task.workflowKey).slice(PREFIX.length) : '';
const required = value => String(value || '').trim();
const appointmentDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

function plannerValidation(data = {}) {
  if (!appointmentDate(data.preferredDateStart) || !appointmentDate(data.preferredDateEnd)) return '请填写期望检查日期区间';
  if (data.preferredDateEnd < data.preferredDateStart) return '期望结束日期不能早于开始日期';
  if (!Array.isArray(data.checkItems) || !data.checkItems.some(item => required(item?.name))) return '请至少填写一项检查项目';
  if (!required(data.institution)) return '请确认检查机构';
  if (data.serviceType === 'special' && !required(data.expert)) return '特殊约检必须确认检查专家';
  if (typeof data.fastingRequired !== 'boolean') return '请确认是否需要空腹';
  return '';
}

function bookingValidation(data = {}) {
  const orderVisit = data.orderFormAppointment || {};
  const expertVisit = data.expertAppointment || {};
  for (const item of [orderVisit, expertVisit]) {
    if (!required(item.institution) || !required(item.department) || !required(item.doctor) || !appointmentDate(item.date) || !required(item.time)) return '请完整填写开检查单号和检查日专家号的机构、科室、医生及时间';
  }
  if (expertVisit.date < orderVisit.date) return '检查日专家号不能早于开检查单号';
  return '';
}

async function createTask({ order, patient, assignee, stage, theme, content, date = new Date(), formData = {}, aiStatus = null, reviewRole = null }) {
  return FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}` },
    { $setOnInsert: { patientId: patient._id, staffId: assignee, assignedTo: assignee, type: 'other', status: 'planned', date, remindAt: new Date(), theme, content, plannedContent: content, sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}`, taskRole: 'executor', formData, aiStatus, reviewRole } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function start(order, plannerId, intake) {
  const error = plannerValidation(intake); if (error) throw Object.assign(new Error(error), { status: 400 });
  const patient = await User.findById(order.user).select('assignedHealthManager assignedMedicalAssistant assignedFamilyDoctor').lean();
  if (!patient?.assignedHealthManager) throw Object.assign(new Error('该客户尚未分配健管专员，无法转交'), { status: 409 });
  const planner = await createTask({ order, patient, assignee: plannerId, stage: 'planner', theme: `待约检：健康规划师确认需求 · ${order.serviceName}`, content: '已确认客户检查需求，等待转交健管专员。', formData: intake });
  planner.status = 'completed'; planner.completedAt = new Date(); planner.completedBy = 'staff'; await planner.save();
  const manager = await createTask({ order, patient, assignee: patient.assignedHealthManager, stage: 'booking', theme: `待约检：健管专员双号预约 · ${order.serviceName}`, content: '请预约开检查单号及检查日专家看诊号；两个号均完成后才能转交就医专员。', formData: { intake, currentStage: 'booking' } });
  await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: order._id, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } }, { $set: { status: 'cancelled', cancelReason: '已进入待约检分阶段流程' } });
  return manager;
}

async function advance(task) {
  const order = await Order.findById(task.sourceOrderId); if (!order) return;
  const patient = await User.findById(task.patientId).select('assignedHealthManager assignedMedicalAssistant assignedFamilyDoctor').lean(); if (!patient) return;
  const stage = stageOf(task);
  if (stage === 'booking') {
    const booking = task.formData || {}; const date = new Date(`${booking.expertAppointment.date}T${booking.expertAppointment.time}:00+08:00`);
    if (!patient.assignedMedicalAssistant) throw new Error('该客户尚未分配就医专员，无法转交');
    await createTask({ order, patient, assignee: patient.assignedMedicalAssistant, stage: 'medical', date, theme: `待约检：就医专员完成开单、检查及资料归档 · ${order.serviceName}`, content: '完成开检查单预约后，按检查日完成检查和专家看诊；上传报告与病历后提交健管专员审核。', formData: { intake: booking.intake, booking, currentStage: 'medical' } });
    for (const [label, offset] of [['检查前1天提醒', 24 * 60 * 60 * 1000], ['检查前2小时提醒', 2 * 60 * 60 * 1000]]) {
      const remindAt = new Date(date.getTime() - offset);
      await FollowUp.findOneAndUpdate({ patientId: patient._id, sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_reminder:${offset}` }, { $setOnInsert: { patientId: patient._id, staffId: patient.assignedMedicalAssistant, assignedTo: patient.assignedMedicalAssistant, date: remindAt, remindAt, type: 'other', status: 'planned', theme: label, content: `提醒客户于 ${booking.expertAppointment.date} ${booking.expertAppointment.time} 完成检查及专家看诊。`, plannedContent: `提醒客户于 ${booking.expertAppointment.date} ${booking.expertAppointment.time} 完成检查及专家看诊。`, tags: ['待约检', '就医提醒'], sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_reminder:${offset}` } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
  } else if (stage === 'medical') {
    await createTask({ order, patient, assignee: patient.assignedHealthManager, stage: 'manager_review', theme: `待约检：健管专员审核报告与病历 · ${order.serviceName}`, content: '审核本次检查报告和病历；通过后系统将生成待健康顾问审核的后续随访计划。', formData: { medical: task.formData || {} } });
  } else if (stage === 'manager_review') {
    const review = task.formData || {};
    await createTask({ order, patient, assignee: patient.assignedFamilyDoctor, stage: 'advisor_review', theme: `待约检：健康顾问审核后续随访计划 · ${order.serviceName}`, content: review.followUpContent || '请审核本次检查后的随访计划，并确认是否需要后续跟进。', formData: { generatedFromCheckupAppointment: true, managerReview: review, managerId: patient.assignedHealthManager }, aiStatus: 'pending', reviewRole: 'familyDoctor' });
  }
}

async function validate(task, body, staff) {
  const stage = stageOf(task); if (!stage || body.status !== 'completed') return '';
  if (stage === 'booking') { if (!['healthManager', 'superadmin'].includes(staff.role)) return '双号预约由健管专员完成'; return bookingValidation(body.formData || {}); }
  if (stage === 'medical') { const data = body.formData || {}; if (!['medicalAssistant', 'superadmin'].includes(staff.role)) return '检查执行与资料归档由就医专员完成'; if (!data.inspectionCompleted || !data.expertVisitCompleted || !Array.isArray(data.reportIds) || !data.reportIds.length || !Array.isArray(data.medicalRecordIds) || !data.medicalRecordIds.length) return '请确认检查和专家看诊已完成，并关联已上传的报告及病历'; }
  if (stage === 'manager_review') { if (!['healthManager', 'superadmin'].includes(staff.role)) return '报告与病历审核由健管专员完成'; if (!required((body.formData || {}).reviewSummary) || !required((body.formData || {}).followUpContent)) return '请填写资料审核结论和后续随访计划'; }
  return '';
}

module.exports = { PREFIX, isCheckupAppointmentOrder, stageOf, start, advance, validate, plannerValidation, bookingValidation };
