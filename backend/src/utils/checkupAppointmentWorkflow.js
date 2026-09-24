const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const User = require('../models/User');
const Message = require('../models/Message');

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

async function ensureClientCheckupNotifications({ order, patient, medical }) {
  const booking = medical?.booking || {}; const finalConsultation = booking.postCheckExpertAppointment || booking.expertAppointment || {};
  const appointments = (medical?.checkAppointments || []).filter(item => appointmentDate(item.appointmentDate) && required(item.appointmentTime));
  if (!appointments.length) return;
  const sorted = [...appointments].sort((a, b) => `${a.appointmentDate}T${a.appointmentTime}`.localeCompare(`${b.appointmentDate}T${b.appointmentTime}`));
  const first = sorted[0]; const firstAt = new Date(`${first.appointmentDate}T${first.appointmentTime}:00+08:00`);
  const finalAt = appointmentDate(finalConsultation.date) ? new Date(`${finalConsultation.date}T${finalConsultation.time || '09:00'}:00+08:00`) : firstAt;
  const schedule = sorted.map(item => `${item.item}：${item.appointmentDate} ${item.appointmentTime}，${item.campus || ''}${item.department || ''}${item.location ? `（${item.location}）` : ''}`).join('\n');
  const appointmentText = `您的检查预约已安排：\n${schedule}${finalConsultation.date ? `\n专家看诊：${finalConsultation.date} ${finalConsultation.time || ''}，${finalConsultation.campus || ''}${finalConsultation.department || ''}${finalConsultation.doctor || ''}` : ''}${medical?.intake?.fastingRequired ? '\n请按要求空腹前往。' : ''}`;
  await Message.findOneAndUpdate({ dedupeKey: `checkup-appointment-confirmed:${order._id}` }, { $setOnInsert: { user: patient._id, type: 'planner', sender: 'AI健康规划师', title: '检查预约已完成', content: appointmentText, conversationId: `${patient._id}_planner`, isAI: true, unread: true, dedupeKey: `checkup-appointment-confirmed:${order._id}`, action: { type: 'checkup_appointment', orderId: String(order._id) } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  for (const [label, offset] of [['检查前1天提醒', 24 * 60 * 60 * 1000], ['检查前2小时提醒', 2 * 60 * 60 * 1000]]) {
    const remindAt = new Date(firstAt.getTime() - offset);
    await FollowUp.findOneAndUpdate({ patientId: patient._id, sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_client_reminder:${offset}` }, { $set: { patientId: patient._id, staffId: patient.assignedHealthManager, assignedTo: patient.assignedHealthManager, date: remindAt, remindAt, type: 'other', status: 'planned', theme: label, content: `${label}：\n${appointmentText}`, plannedContent: appointmentText, tags: ['待约检', '用户端提醒'], sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_client_reminder:${offset}` } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  for (const [label, offset] of [['AI提醒客户上传检查报告和病历', 24 * 60 * 60 * 1000], ['AI再次提醒客户补充资料', 3 * 24 * 60 * 60 * 1000]]) {
    const date = new Date(finalAt.getTime() + offset);
    await FollowUp.findOneAndUpdate({ patientId: patient._id, sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_upload_reminder:${offset}` }, { $set: { patientId: patient._id, staffId: patient.assignedHealthManager, assignedTo: patient.assignedHealthManager, date, remindAt: date, type: 'other', status: 'planned', theme: label, content: '请提醒客户上传本次各检查项目对应的检查报告；如有门诊病历也请一并上传。', plannedContent: 'AI提醒客户上传逐项检查报告及可选门诊病历。', tags: ['待约检', '资料上传提醒'], sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `checkup_appointment_upload_reminder:${offset}` } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
}

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
  const needsSpecialCheck = data?.intake?.serviceType === 'special' || data.specialCheckRequired === true;
  for (const item of [orderVisit, finalConsultation]) {
    if (!required(item.campus) || !required(item.department) || !required(item.location) || !required(item.doctor) || !appointmentDate(item.date) || !required(item.time)) return '请完整填写开检查单号和检查后专家门诊的院区、科室、具体地点、医生及时间';
  }
  if (needsSpecialCheck && (!required(specialCheck.campus) || !required(specialCheck.department) || !required(specialCheck.location) || !appointmentDate(specialCheck.date) || !required(specialCheck.time))) return '请完整填写特殊检查预约的院区、科室、具体地点及时间';
  const timeOf = item => `${item.date}T${item.time}`;
  if (needsSpecialCheck) {
    if (!required(specialCheck.checkItem)) return '请填写特殊检查项目';
    if (timeOf(specialCheck) < timeOf(orderVisit)) return '特殊检查预约不能早于开检查单号';
    if (timeOf(finalConsultation) <= timeOf(specialCheck)) return '特殊检查必须安排在检查后专家看诊之前';
  } else if (timeOf(finalConsultation) < timeOf(orderVisit)) return '检查后专家看诊号不能早于开检查单号';
  return '';
}

async function createTask({ order, patient, assignee, stage, theme, content, date = new Date(), formData = {}, aiStatus = null, reviewRole = null, taskRole = 'executor' }) {
  const task = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}` },
    { $setOnInsert: { patientId: patient._id, staffId: assignee, assignedTo: assignee, type: 'other', status: 'planned', date, remindAt: new Date(), theme, content, plannedContent: content, sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${stage}`, taskRole, formData, aiStatus, reviewRole } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  // 健康顾问退回健管专员后，同一订单需要再次生成审核任务。复用原任务 ID，避免留下
  // 多张审核卡；只重开被本流程退回的任务，不影响已通过或人工取消的历史任务。
  if (stage === 'advisor_review' && task.status === 'cancelled' && task.cancelReason === '健康顾问退回健管专员修改') {
    Object.assign(task, { patientId: patient._id, staffId: assignee, assignedTo: assignee, status: 'planned', date, remindAt: new Date(), theme, content, plannedContent: content, formData, aiStatus, reviewRole, taskRole, completedAt: null, completedBy: null, cancelReason: '' });
    await task.save();
  }
  return task;
}

async function start(order, plannerId, intake) {
  const error = plannerValidation(intake); if (error) throw Object.assign(new Error(error), { status: 400 });
  const patient = await User.findById(order.user).select('assignedHealthManager assignedMedicalAssistant assignedFamilyDoctor').lean();
  if (!patient?.assignedHealthManager) throw Object.assign(new Error('该客户尚未分配健管专员，无法转交'), { status: 409 });
  const planner = await createTask({ order, patient, assignee: plannerId, stage: 'planner', theme: `待约检：健康规划师确认需求 · ${order.serviceName}`, content: '已确认客户检查需求，等待转交健管专员。', formData: intake });
  planner.status = 'completed'; planner.completedAt = new Date(); planner.completedBy = 'staff'; await planner.save();
  const bookingLabel = '三个预约环节';
  const bookingContent = '请依次确认开检查单、特殊检查预约（如需）及检查后专家门诊；需要提前预约的特殊检查须在转交就医专员前填妥。';
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
    const booking = task.formData || {}; const specialCheck = booking.specialCheckAppointment || {}; const finalConsultation = booking.postCheckExpertAppointment || booking.expertAppointment || {}; const hasSpecialCheck = booking.intake?.serviceType === 'special' || booking.specialCheckRequired === true; const reminderAppointment = hasSpecialCheck ? specialCheck : finalConsultation; const date = new Date(`${reminderAppointment.date}T${reminderAppointment.time}:00+08:00`);
    if (!patient.assignedMedicalAssistant) throw new Error('该客户尚未分配就医专员，无法转交');
    await createTask({ order, patient, assignee: patient.assignedMedicalAssistant, stage: 'medical', date, theme: `待约检：就医专员完成开单、检查及资料归档 · ${order.serviceName}`, content: hasSpecialCheck ? '按顺序完成开检查单、特殊检查和检查后专家门诊；上传报告与病历后提交健管专员审核。' : '按顺序完成开检查单、常规检查和检查后专家门诊；上传报告与病历后提交健管专员审核。', formData: { intake: booking.intake, booking, currentStage: 'medical' } });
    await Order.updateOne({ _id: order._id }, { $set: { currentStage: 'checkup_medical_execution', currentAssignee: patient.assignedMedicalAssistant, supervisionStatus: 'in_progress' } });
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` }, { $set: { content: '当前环节：就医专员执行开单、检查及资料归档。', 'formData.currentStage': 'medical' } });
  } else if (stage === 'medical') {
    await ensureClientCheckupNotifications({ order, patient, medical: task.formData || {} });
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
  if (stage === 'medical') { const data = body.formData || {}; if (!['medicalAssistant', 'superadmin'].includes(staff.role)) return '开单与检查预约由就医专员完成'; if (!required(data.examOrderStatus) || !Array.isArray(data.checkAppointments) || data.checkAppointments.some(item => !required(item.campus) || !required(item.department) || !required(item.location) || !appointmentDate(item.appointmentDate) || !required(item.appointmentTime))) return '请完整填写开检查单情况及各检查项目的院区、科室、具体地点和预约时间'; }
  if (stage === 'manager_review') { const data = body.formData || {}; const items = data.medical?.checkAppointments || []; if (!['healthManager', 'superadmin'].includes(staff.role)) return '报告与病历审核由健管专员完成'; if (!items.length || items.some(item => !Array.isArray(data.reportAssignments?.[item.item]) || !data.reportAssignments[item.item].length)) return '请逐项上传或关联本次检查报告'; if (!data.aiGenerated) return '请先由 AI 根据检查资料生成随访计划草稿'; if (!required(data.reviewSummary) || !required(data.followUpContent)) return '请填写资料审核结论和后续随访计划'; }
  return '';
}

module.exports = { PREFIX, isCheckupAppointmentOrder, stageOf, start, advance, validate, plannerValidation, bookingValidation, ensureClientCheckupNotifications };
