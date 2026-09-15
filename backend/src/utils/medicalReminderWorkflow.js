const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const User = require('../models/User');
const Message = require('../models/Message');

const PREFIX = 'medical_reminder:';
const isMedicalReminderOrder = orderOrName => {
  const text = typeof orderOrName === 'object'
    ? [orderOrName?.serviceName, orderOrName?.specificationLabel, orderOrName?.note, orderOrName?.serviceRequirements, orderOrName?.serviceWorkflowSnapshot?.key].filter(Boolean).join(' ')
    : String(orderOrName || '');
  return /复查督办|就医提醒/.test(text);
};
const stageOf = task => String(task?.workflowKey || '').startsWith(PREFIX) ? String(task.workflowKey).slice(PREFIX.length) : '';
const clean = value => String(value || '').trim().slice(0, 1000);

function normalizeIntake(input = {}, previous = {}) {
  const get = key => clean(input[key] || previous[key]);
  return {
    visitDate: get('visitDate'), medicalIssue: get('medicalIssue'), visitGoal: get('visitGoal'),
    hospitalSuggestion: get('hospitalSuggestion'), departmentSuggestion: get('departmentSuggestion'), expertSuggestion: get('expertSuggestion'),
  };
}

function validateIntake(data) {
  const missing = Object.entries(normalizeIntake(data)).filter(([, value]) => !value).map(([key]) => key);
  return missing.length ? '请完整确认就医日期、就医问题、就医目标、医院建议、科室建议和专家建议' : '';
}

// 复查督办不需要健康规划师二次录入。订单支付后由 AI 生成草稿，直接交健康顾问审核。
async function ensureAdvisorIntakeTask(order) {
  if (!isMedicalReminderOrder(order)) return null;
  const patient = await User.findById(order.user).select('assignedFamilyDoctor assignedHealthManager').lean();
  const advisorId = patient?.assignedFamilyDoctor;
  if (!advisorId) return null;
  const context = [order.specificationLabel, order.serviceRequirements, order.note].filter(Boolean).join('\n') || '客户已购买体检后复查督办服务，待结合订单对话确认具体复查事项。';
  let content = '结合客户体检后的异常项和订单对话，确认复查时间、就诊安排及需要跟进的结果；如信息不足，先联系客户补充后再确定后续随访。';
  let followUpDate = new Date(); followUpDate.setDate(followUpDate.getDate() + 7);
  try {
    const { chat } = require('./ai');
    const text = await chat([{ role: 'user', content: `你是健康管理随访计划助手。客户已购买体检后复查督办服务。根据订单信息生成一条简明、可执行的随访计划草稿。不得虚构诊断、药物、检查结果或医院专家；信息不足时明确由健康顾问结合对话确认。仅输出JSON：{"content":"随访事项","daysLater":1到30的整数}。\n订单信息：${context}` }], { maxTokens: 700, temperature: 0 });
    const match = String(text || '').match(/\{[\s\S]*\}/);
    const draft = match ? JSON.parse(match[0]) : {};
    if (clean(draft.content)) content = clean(draft.content);
    const days = Math.max(1, Math.min(30, Number(draft.daysLater) || 7));
    followUpDate.setDate(followUpDate.getDate() + days - 7);
  } catch (error) { console.error('[medical-reminder] AI随访计划生成失败，使用安全草稿', error.message); }
  const task = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor_review` },
    { $set: { staffId: advisorId, assignedTo: advisorId, patientId: order.user, date: followUpDate, remindAt: followUpDate, nextFollowUpDate: followUpDate, type: 'other', status: 'planned',
      theme: '复查督办随访计划', content, plannedContent: content, sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor_review`, taskRole: '', isBlocked: false,
      aiStatus: 'pending', reviewRole: 'familyDoctor', formData: { generatedFromPostCheckupSupervision: true, phase: 'advisor_review', managerId: String(patient.assignedHealthManager || '') } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await FollowUp.updateMany(
    { sourceType: 'order', sourceOrderId: order._id, _id: { $ne: task._id }, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'cancelled', cancelReason: '复查督办订单已自动转健康顾问审核随访计划' } },
  );
  await Order.updateOne({ _id: order._id }, { $set: { currentStage: 'advisor_review', currentAssignee: advisorId, supervisionStatus: 'in_progress' } });
  return task;
}

async function start(order, plannerId, input) {
  const intake = normalizeIntake(input, order.medicalReminderIntake || {});
  const error = validateIntake(intake);
  if (error) { const exception = new Error(error); exception.status = 400; throw exception; }
  const patient = await User.findById(order.user).select('assignedHealthManager assignedFamilyDoctor').lean();
  const managerId = patient?.assignedHealthManager;
  const advisorId = patient?.assignedFamilyDoctor;
  if (!managerId || !advisorId) { const exception = new Error(`客户尚未分配${!managerId ? '健管专员' : '健康顾问'}，不能启动复查督办`); exception.status = 409; throw exception; }
  const visitAt = new Date(`${intake.visitDate}T09:00:00+08:00`);
  if (Number.isNaN(visitAt.getTime())) { const exception = new Error('就医日期格式不正确'); exception.status = 400; throw exception; }
  order.medicalReminderIntake = intake;
  order.currentStage = 'advisor_review'; order.currentAssignee = advisorId; order.supervisionStatus = 'in_progress';
  await order.save();
  const summary = `就医问题：${intake.medicalIssue}\n就医目标：${intake.visitGoal}\n医院建议：${intake.hospitalSuggestion}\n科室建议：${intake.departmentSuggestion}\n专家建议：${intake.expertSuggestion}`;
  let content = `请围绕${intake.medicalIssue}完成复查督办：确认${intake.visitDate}的复查安排，并在复查后跟进结果、医嘱和下一步健康管理建议。`;
  let followUpDate = new Date(visitAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  try {
    const { chat } = require('./ai');
    const text = await chat([{ role: 'user', content: `你是健康管理随访计划助手。根据以下复查督办信息生成一条简明、可执行的随访计划草稿。不得补写诊断、药物或检查结果。仅输出JSON：{"content":"随访事项","daysLater":1到30的整数}。\n${summary}\n就医日期：${intake.visitDate}` }], { maxTokens: 700, temperature: 0 });
    const match = String(text || '').match(/\{[\s\S]*\}/);
    const draft = match ? JSON.parse(match[0]) : {};
    if (clean(draft.content)) content = clean(draft.content);
    const days = Math.max(1, Math.min(30, Number(draft.daysLater) || 7));
    followUpDate = new Date(visitAt.getTime() + days * 24 * 60 * 60 * 1000);
  } catch (error) { console.error('[medical-reminder] AI随访计划生成失败，使用安全草稿', error.message); }
  const task = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor_review` },
    { $set: { patientId: order.user, staffId: advisorId, assignedTo: advisorId, date: followUpDate, remindAt: followUpDate, nextFollowUpDate: followUpDate,
      type: 'other', status: 'planned', theme: '复查督办随访计划', plannedContent: content, content,
      sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor_review`, taskRole: '', isBlocked: false, aiStatus: 'pending', reviewRole: 'familyDoctor',
      formData: { ...intake, managerId: String(managerId), generatedFromPostCheckupSupervision: true } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await FollowUp.updateMany(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}intake`, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', content: '健康顾问已确认复查信息，AI随访计划草稿待审核。' } },
  );
  await FollowUp.updateMany(
    { sourceType: 'order', sourceOrderId: order._id, _id: { $ne: task._id }, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'cancelled', cancelReason: '已转健康顾问审核复查督办随访计划' } },
  );
  await Message.findOneAndUpdate(
    { dedupeKey: `medical-reminder-review:${order._id}` },
    { $setOnInsert: { user: order.user, type: 'planner', sender: 'AI健康规划师', title: '复查督办计划审核中', conversationId: `${order.user}_planner`, isAI: true, unread: true,
      content: `已收到您${intake.visitDate}的复查督办信息，AI已生成随访计划草稿，正由健康顾问审核。`, dedupeKey: `medical-reminder-review:${order._id}` } }, { upsert: true, new: true });
  return task;
}

async function markVisitCompleted(task) {
  const order = await Order.findById(task.sourceOrderId);
  if (!order) return null;
  const patient = await User.findById(task.patientId).select('assignedHealthManager assignedFamilyDoctor').lean();
  const managerId = patient?.assignedHealthManager || task.assignedTo;
  order.currentStage = 'documents'; order.currentAssignee = managerId; order.supervisionStatus = 'in_progress'; await order.save();
  return FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}documents` },
    { $set: { patientId: task.patientId, staffId: task.staffId, assignedTo: managerId, date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date(), type: 'other', status: 'planned',
      theme: '就医资料上传与审核', plannedContent: '请客户上传本次就医报告单和病历；健管专员核对资料完整、归属正确并完成审核。', content: '等待报告单和病历上传并审核',
      sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}documents`, taskRole: '', isBlocked: false, dependsOnTaskId: task._id,
      formData: { phase: 'document_review', reportRequired: true, medicalRecordRequired: true } } },
    { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function advanceStaffStage(task, staffId) {
  const stage = stageOf(task); const order = await Order.findById(task.sourceOrderId); if (!order) return;
  const patient = await User.findById(task.patientId).select('assignedFamilyDoctor').lean();
  if (stage === 'documents') {
    const advisorId = patient?.assignedFamilyDoctor;
    if (!advisorId) throw Object.assign(new Error('客户尚未分配健康顾问，不能进入随访计划确认'), { status: 409 });
    order.currentStage = 'plan_review'; order.currentAssignee = advisorId; await order.save();
    await FollowUp.findOneAndUpdate({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}plan_review` },
      { $set: { patientId: task.patientId, staffId: task.staffId, assignedTo: advisorId, date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date(), type: 'other', status: 'planned',
        theme: '查看就医资料并确认随访计划', plannedContent: '查看已审核的报告单和病历，确认后续随访计划；无需继续随访时记录结论。', content: '', sourceType: 'order', sourceOrderId: order._id,
        workflowKey: `${PREFIX}plan_review`, taskRole: 'executor', dependsOnTaskId: task._id, isBlocked: false, formData: { phase: 'plan_review' } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } else if (stage === 'plan_review') {
    order.status = 'completed'; order.tradeStatus = 'completed'; order.fulfillmentStatus = 'completed'; order.completedAt = new Date(); order.usedUnits = Math.max(order.usedUnits || 0, 1);
    order.currentStage = 'completed'; order.currentAssignee = null; order.supervisionStatus = 'completed'; await order.save();
    await Message.findOneAndUpdate({ dedupeKey: `medical-reminder-completed:${order._id}` }, { $setOnInsert: { user: task.patientId, type: 'planner', sender: 'AI健康规划师', title: '复查督办服务已完成',
      content: '报告单和病历已审核，健康顾问已确认后续随访计划，本次复查督办服务已结束。', conversationId: `${task.patientId}_planner`, isAI: true, unread: true, dedupeKey: `medical-reminder-completed:${order._id}` } }, { upsert: true });
  }
}

async function scanReminders(now = new Date()) {
  const due = await FollowUp.find({ workflowKey: `${PREFIX}followup`, status: { $in: ['planned', 'in_progress', 'missed'] }, reminderCount: { $lt: 3 }, remindAt: { $lte: now } });
  let sent = 0;
  for (const task of due) {
    const nextCount = Number(task.reminderCount || 0) + 1;
    await Message.findOneAndUpdate({ dedupeKey: `medical-reminder:${task._id}:${nextCount}` }, { $setOnInsert: { user: task.patientId, type: 'planner', sender: 'AI健康规划师', title: `就医随访提醒（${nextCount}/3）`,
      content: '请确认本次复查是否已结束；如已结束，请完成任务并上传报告单和病历。如需协助，可在对话中留言。', conversationId: `${task.patientId}_planner`, isAI: true, unread: true,
      dedupeKey: `medical-reminder:${task._id}:${nextCount}`, action: { type: 'medical_reminder_followup', followUpId: String(task._id), orderId: String(task.sourceOrderId) } } }, { upsert: true });
    const nextAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const set = { reminderCount: nextCount, lastRemindedAt: now, remindAt: nextAt, 'formData.reminderCount': nextCount };
    if (nextCount >= 3) { set.escalatedAt = now; set.status = 'in_progress'; set.content = `${task.plannedContent || task.content}\nAI已提醒3次，现转健管专员人工跟进。`; set['formData.phase'] = 'human_followup'; set.tags = Array.from(new Set([...(task.tags || []), '人工跟进'])); }
    await FollowUp.updateOne({ _id: task._id }, { $set: set }); sent += 1;
  }
  return sent;
}

module.exports = { PREFIX, isMedicalReminderOrder, stageOf, normalizeIntake, validateIntake, ensureAdvisorIntakeTask, start, markVisitCompleted, advanceStaffStage, scanReminders };
