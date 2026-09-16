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
  const hasPreferredDateStart = Boolean(required(data.preferredDateStart));
  const hasPreferredDateEnd = Boolean(required(data.preferredDateEnd));
  if (hasPreferredDateStart !== hasPreferredDateEnd) return '如填写期望检查日期，请补全开始和结束日期';
  if (hasPreferredDateStart && (!appointmentDate(data.preferredDateStart) || !appointmentDate(data.preferredDateEnd))) return '期望检查日期格式不正确';
  if (hasPreferredDateStart && data.preferredDateEnd < data.preferredDateStart) return '期望结束日期不能早于开始日期';
  if (!Array.isArray(data.checkItems) || !data.checkItems.some(item => required(item?.name))) return '请至少填写一项检查项目';
  if (!required(data.institution)) return '请确认检查机构';
  if (data.serviceType === 'special' && !required(data.expert)) return '特殊约检必须确认检查专家';
  if (typeof data.fastingRequired !== 'boolean') return '请确认是否需要空腹';
  return '';
}

function bookingValidation(data = {}) {
  const orderVisit = data.orderFormAppointment || {};
  const specialCheck = data.specialCheckAppointment || {};
  const finalConsultation = data.postCheckExpertAppointment || data.expertAppointment || {};
  const needsSpecialCheck = data?.intake?.serviceType === 'special';
  for (const item of needsSpecialCheck ? [orderVisit, specialCheck, finalConsultation] : [orderVisit, finalConsultation]) {
    if (!required(item.campus) || !required(item.department) || !required(item.doctor) || !appointmentDate(item.date) || !required(item.time)) return needsSpecialCheck ? '请完整填写开检查单号、特殊检查专家号和检查后专家看诊号的院区、科室、医生及时间' : '请完整填写开检查单号和检查后专家看诊号的院区、科室、医生及时间';
  }
  const timeOf = item => `${item.date}T${item.time}`;
  if (needsSpecialCheck) {
    if (!required(specialCheck.checkItem)) return '请填写特殊检查项目';
    if (timeOf(specialCheck) < timeOf(orderVisit)) return '特殊检查专家号不能早于开检查单号';
    if (timeOf(finalConsultation) <= timeOf(specialCheck)) return '特殊检查必须安排在检查后专家看诊之前';
  } else if (timeOf(finalConsultation) < timeOf(orderVisit)) return '检查后专家看诊号不能早于开检查单号';
  return '';
}

async function createTask({ order, patient, assignee, stage, theme, content, date = new Date(), formData = {}, aiStatus = null, reviewRole = null, taskRole = 'executor' }) {
  return FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}` },
    { $setOnInsert: { patientId: patient._id, staffId: assignee, assignedTo: assignee, type: 'other', status: 'planned', date, remindAt: new Date(), theme, content, plannedContent: content, sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}`, taskRole, formData, aiStatus, reviewRole } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function start(order, plannerId, intake) {
  const error = plannerValidation(intake); if (error) throw Object.assign(new Error(error), { status: 400 });
  const patient = await User.findById(order.user).select('assignedHealthManager assignedMedicalAssistant assignedFamilyDoctor').lean();
  if (!patient?.assignedHealthManager) throw Object.assign(new Error('该客户尚未分配健管专员，无法转交'), { status: 409 });
  const planner = await createTask({ order, patient, assignee: plannerId, stage: 'planner', theme: `待约检：健康规划师确认需求 · ${order.serviceName}`, content: '已确认客户检查需求，等待转交健管专员。', formData: intake });
  planner.status = 'completed'; planner.completedAt = new Date(); planner.completedBy = 'staff'; await planner.save();
  const bookingLabel = intake.serviceType === 'special' ? '三号预约' : '双号预约';
  const bookingContent = intake.serviceType === 'special' ? '请预约开检查单号、特殊检查专家号和检查后专家看诊号；三个号均完成后才能转交就医专员。' : '请预约开检查单号和检查后专家看诊号；两个号均完成后才能转交就医专员。';
  const manager = await createTask({ order, patient, assignee: patient.assignedHealthManager, stage: 'booking', theme: `待约检：健管专员${bookingLabel} · ${order.serviceName}`, content: bookingContent, formData: { intake, currentStage: 'booking' } });
  await createTask({ order, patient, assignee: plannerId, stage: 'supervise', theme: `待约检：健康规划师跟进服务 · ${order.serviceName}`, content: `当前环节：健管专员${bookingLabel}中。订单将持续流转，待健康顾问审核后续随访计划后自动结束。`, formData: { intake, currentStage: 'booking' }, taskRole: 'supervisor' });
  await Order.updateOne({ _id: order._id }, { $set: { checkupIntake: intake, supervisorId: plannerId, currentStage: 'checkup_manager_booking', currentAssignee: patient.assignedHealthManager, supervisionStatus: 'in_progress' } });
  await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: order._id, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } }, { $set: { status: 'cancelled', cancelReason: '已进入待约检分阶段流程' } });
  return manager;
}

async function advance(task) {
  const order = await Order.findById(task.sourceOrderId); if (!order) return;
  const patient = await User.findById(task.patientId).select('assignedHealthManager assignedMedicalAssistant assignedFamilyDoctor').lean(); if (!patient) return;
  const stage = stageOf(task);
  if (stage === 'booking') {
    const booking = task.formData || {}; const specialCheck = booking.specialCheckAppointment || {}; const finalConsultation = booking.postCheckExpertAppointment || booking.expertAppointment || {}; const hasSpecialCheck = booking.intake?.serviceType === 'special'; const reminderAppointment = hasSpecialCheck ? specialCheck : finalConsultation; const date = new Date(`${reminderAppointment.date}T${reminderAppointment.time}:00+08:00`);
    if (!patient.assignedMedicalAssistant) throw new Error('该客户尚未分配就医专员，无法转交');
    await createTask({ order, patient, assignee: patient.assignedMedicalAssistant, stage: 'medical', date, theme: `待约检：就医专员完成开单、检查及资料归档 · ${order.serviceName}`, content: hasSpecialCheck ? '按顺序完成开检查单、特殊检查和检查后专家看诊；上传报告与病历后提交健管专员审核。' : '按顺序完成开检查单、常规检查和检查后专家看诊；上传报告与病历后提交健管专员审核。', formData: { intake: booking.intake, booking, currentStage: 'medical' } });
    await Order.updateOne({ _id: order._id }, { $set: { currentStage: 'checkup_medical_execution', currentAssignee: patient.assignedMedicalAssistant, supervisionStatus: 'in_progress' } });
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` }, { $set: { content: '当前环节：就医专员执行开单、检查及资料归档。', 'formData.currentStage': 'medical' } });
    for (const [label, offset] of [['检查前1天提醒', 24 * 60 * 60 * 1000], ['检查前2小时提醒', 2 * 60 * 60 * 1000]]) {
      const remindAt = new Date(date.getTime() - offset);
      const reminderText = hasSpecialCheck ? `提醒客户于 ${specialCheck.date} ${specialCheck.time} 完成特殊检查，并于 ${finalConsultation.date} ${finalConsultation.time} 完成专家看诊。` : `提醒客户于 ${finalConsultation.date} ${finalConsultation.time} 完成常规检查及专家看诊。`;
      await FollowUp.findOneAndUpdate({ patientId: patient._id, sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_reminder:${offset}` }, { $setOnInsert: { patientId: patient._id, staffId: patient.assignedMedicalAssistant, assignedTo: patient.assignedMedicalAssistant, date: remindAt, remindAt, type: 'other', status: 'planned', theme: label, content: reminderText, plannedContent: reminderText, tags: ['待约检', '就医提醒'], sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_reminder:${offset}` } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await FollowUp.findOneAndUpdate({ patientId: patient._id, sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_manager_reminder:${offset}` }, { $setOnInsert: { patientId: patient._id, staffId: patient.assignedHealthManager, assignedTo: patient.assignedHealthManager, date: remindAt, remindAt, type: 'other', status: 'planned', theme: `${label}（健管专员）`, content: `请提醒客户：${reminderText}`, plannedContent: `请提醒客户：${reminderText}`, tags: ['待约检', '客户提醒'], sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_manager_reminder:${offset}` } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
  } else if (stage === 'medical') {
    const booking = task.formData?.booking || {};
    const finalConsultation = booking.postCheckExpertAppointment || booking.expertAppointment || {};
    const followupAt = new Date(`${finalConsultation.date}T${finalConsultation.time || '09:00'}:00+08:00`);
    for (const [label, offset] of [['AI提醒客户上传检查报告和病历', 24 * 60 * 60 * 1000], ['AI再次提醒客户补充资料', 3 * 24 * 60 * 60 * 1000]]) {
      const date = new Date(followupAt.getTime() + offset);
      await FollowUp.findOneAndUpdate({ patientId: patient._id, sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_upload_reminder:${offset}` }, { $setOnInsert: { patientId: patient._id, staffId: patient.assignedHealthManager, assignedTo: patient.assignedHealthManager, date, remindAt: date, type: 'other', status: 'planned', theme: label, content: 'AI将提醒客户上传本次检查报告和门诊病历；资料到齐后请完成审核并生成随访计划。', plannedContent: 'AI提醒客户上传本次检查报告和门诊病历。', tags: ['待约检', '资料上传提醒'], sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_upload_reminder:${offset}` } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    await createTask({ order, patient, assignee: patient.assignedHealthManager, stage: 'manager_review', theme: `待约检：健管专员审核报告与病历 · ${order.serviceName}`, content: '审核本次检查报告和病历；通过后系统将生成待健康顾问审核的后续随访计划。', formData: { medical: task.formData || {} } });
    await Order.updateOne({ _id: order._id }, { $set: { currentStage: 'checkup_manager_review', currentAssignee: patient.assignedHealthManager, supervisionStatus: 'in_progress' } });
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` }, { $set: { content: '当前环节：健管专员审核检查报告与病历。', 'formData.currentStage': 'manager_review' } });
  } else if (stage === 'manager_review') {
    const review = task.formData || {};
    await createTask({ order, patient, assignee: patient.assignedFamilyDoctor, stage: 'advisor_review', theme: `待约检：健康顾问审核后续随访计划 · ${order.serviceName}`, content: review.followUpContent || '请审核本次检查后的随访计划，并确认是否需要后续跟进。', formData: { generatedFromCheckupAppointment: true, managerReview: review, managerId: patient.assignedHealthManager }, aiStatus: 'pending', reviewRole: 'familyDoctor' });
    await Order.updateOne({ _id: order._id }, { $set: { currentStage: 'checkup_advisor_review', currentAssignee: patient.assignedFamilyDoctor, supervisionStatus: 'pending_closure' } });
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` }, { $set: { content: '当前环节：健康顾问审核检查后的随访计划。', 'formData.currentStage': 'advisor_review' } });
  }
}

async function validate(task, body, staff) {
  const stage = stageOf(task); if (!stage || body.status !== 'completed') return '';
  if (stage === 'supervise') return '待约检仍在流转中，请查看当前阶段；健康顾问审核随访计划后将自动结案';
  if (stage === 'booking') { if (!['healthManager', 'superadmin'].includes(staff.role)) return '三号预约由健管专员完成'; return bookingValidation(body.formData || {}); }
  if (stage === 'medical') { const data = body.formData || {}; if (!['medicalAssistant', 'superadmin'].includes(staff.role)) return '开单与检查预约由就医专员完成'; if (!required(data.examOrderStatus) || !Array.isArray(data.checkAppointments) || data.checkAppointments.some(item => !required(item.campus) || !required(item.department) || !appointmentDate(item.appointmentDate) || !required(item.appointmentTime))) return '请完整填写开检查单情况及各检查项目的预约信息'; }
  if (stage === 'manager_review') { if (!['healthManager', 'superadmin'].includes(staff.role)) return '报告与病历审核由健管专员完成'; if (!required((body.formData || {}).reviewSummary) || !required((body.formData || {}).followUpContent)) return '请填写资料审核结论和后续随访计划'; }
  return '';
}

module.exports = { PREFIX, isCheckupAppointmentOrder, stageOf, start, advance, validate, plannerValidation, bookingValidation };
