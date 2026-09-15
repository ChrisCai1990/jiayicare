const Admin = require('../models/Admin');
const FollowUp = require('../models/FollowUp');
const MedicalReport = require('../models/MedicalReport');
const Order = require('../models/Order');
const ServiceRecord = require('../models/ServiceRecord');
const User = require('../models/User');

const PREFIX = 'medical_proxy:';
const STAGES = ['collect', 'audit', 'advisor', 'planner', 'booking', 'execute'];
const ALL_STAGES = [...STAGES, 'appointment_review', 'post_visit_audit', 'post_visit_review'];
const STAFF_DIRECT_SOURCE = 'staff_direct';
const isMedicalProxyOrder = orderOrName => orderOrName?.serviceWorkflowSnapshot?.key === 'medical_proxy'
  || /医疗代诊|专家约诊|就医规划/.test(String(typeof orderOrName === 'object' ? orderOrName?.serviceName : orderOrName || ''));
const stageOf = task => task?.sourceType === 'order' && String(task.workflowKey || '').startsWith(PREFIX)
  ? String(task.workflowKey).slice(PREFIX.length) : '';
const nonempty = value => String(value || '').trim();
const dateInput = value => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const appointmentAt = (date, time = '09:00') => new Date(`${date}T${time || '09:00'}:00+08:00`);
const preparationDueDate = (serviceDate, now = new Date()) => {
  const due = new Date(serviceDate);
  due.setDate(due.getDate() - 3);
  return due < now ? new Date(now) : due;
};

const chineseNumber = value => {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (value === '十') return 10;
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  }
  return digits[value] || 0;
};

function extractMedicalProxyRechecks(text, baseDate = new Date()) {
  const suggestions = [];
  const pattern = /([一二两三四五六七八九十\d]+)\s*(年|个?月|周|天)后\s*(复查|复诊)\s*([^。；;\n]*)/g;
  for (const match of String(text || '').matchAll(pattern)) {
    const amount = chineseNumber(match[1]);
    if (!amount) continue;
    const due = new Date(baseDate);
    if (Number.isNaN(due.getTime())) continue;
    if (match[2] === '年') due.setUTCFullYear(due.getUTCFullYear() + amount);
    else if (match[2].includes('月')) due.setUTCMonth(due.getUTCMonth() + amount);
    else due.setUTCDate(due.getUTCDate() + amount * (match[2] === '周' ? 7 : 1));
    const action = `${match[3]}${match[4].trim()}`;
    suggestions.push({ due, action, sourceText: match[0].trim() });
  }
  return suggestions;
}

async function archiveMedicalProxyRecords(task, order, tenantId) {
  const files = Array.isArray(task.formData?.medicalRecordAttachments) ? task.formData.medicalRecordAttachments : [];
  const checkDate = dateInput(task.date || new Date());
  for (const [index, file] of files.entries()) {
    if (!file?.url) continue;
    await MedicalReport.findOneAndUpdate(
      { user: task.patientId, sourceType: 'order', sourceOrderId: order._id, fileUrl: file.url },
      { $setOnInsert: {
        user: task.patientId, tenantId: tenantId || null, title: files.length > 1 ? `医疗代诊病历（${index + 1}）` : '医疗代诊病历',
        type: 'other', documentCategory: 'outpatient_record', hospital: order.medicalProxyPlan?.hospital || '',
        institution: order.medicalProxyPlan?.hospital || '', date: checkDate, checkDate,
        reportYear: Number(checkDate.slice(0, 4)) || new Date().getFullYear(), fileUrl: file.url, fileUrls: [file.url],
        ossKey: file.ossKey || '', ossKeys: file.ossKey ? [file.ossKey] : [], mimeType: file.mimeType || '', fileSize: String(file.fileSize || ''),
        uploadedBy: task.assignedTo, uploadedByRole: 'medicalAssistant', sourceType: 'order', sourceOrderId: order._id,
        audit_status: 'unaudited', aiStatus: 'none', note: `医疗代诊执行任务：${task.theme || ''}`,
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
}

async function upsertMedicalProxyServiceRecord(task, order, completed = false) {
  const plan = order.medicalProxyPlan || task.formData?.planSnapshot || {};
  const booking = plan.booking || task.formData?.bookingSnapshot || (stageOf(task) === 'booking' ? task.formData : {});
  const appointment = booking.appointmentDate && booking.appointmentTime ? appointmentAt(booking.appointmentDate, booking.appointmentTime) : (order.scheduledAt || task.date || new Date());
  const content = [
    plan.hospital && `医院：${plan.hospital}`, plan.department && `科室：${plan.department}`, plan.expert && `专家：${plan.expert}`,
    plan.proxyGoal && `代诊目标：${plan.proxyGoal}`, plan.communicationContent && `交流内容：${plan.communicationContent}`,
    booking.preferredDateStart && `客户期望日期：${booking.preferredDateStart} 至 ${booking.preferredDateEnd || booking.preferredDateStart}`,
    booking.appointmentDate && `实际约诊时间：${booking.appointmentDate} ${booking.appointmentTime || ''}`,
    booking.dateDifferenceNote && `日期差异确认：${booking.dateDifferenceNote}`,
  ].filter(Boolean).join('\n');
  const update = { staffId: task.assignedTo, patientId: task.patientId, date: appointment, title: '医疗代诊服务', content,
    medicalEscort: { serviceType: 'proxy_visit', hospital: plan.hospital || '', department: plan.department || '', doctor: plan.expert || '' } };
  if (completed) {
    update.result = nonempty(task.formData?.executionResult);
    update.attachments = (task.formData?.medicalRecordAttachments || []).filter(file => file?.url);
  }
  const recordUpdate = { $set: update, $setOnInsert: { sourceOrderId: order._id, type: 'medical_visit' } };
  if (!completed) recordUpdate.$setOnInsert.result = '';
  return ServiceRecord.findOneAndUpdate(
    { sourceOrderId: order._id, type: 'medical_visit' },
    recordUpdate,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function createMedicalProxyFollowUpDrafts(task, order, familyDoctorId) {
  if (!familyDoctorId) return;
  const result = nonempty(task.formData?.executionResult);
  for (const suggestion of extractMedicalProxyRechecks(result, task.date || new Date())) {
    const dueDate = dateInput(suggestion.due);
    const key = `medical_proxy_recheck:${dueDate}:${suggestion.action}`;
    await FollowUp.findOneAndUpdate(
      { patientId: task.patientId, sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: key },
      { $setOnInsert: {
        patientId: task.patientId, staffId: familyDoctorId, assignedTo: familyDoctorId,
        date: suggestion.due, remindAt: suggestion.due, type: 'other', status: 'planned',
        theme: `医疗代诊后${suggestion.action}`, plannedContent: `代诊反馈：${result}\n建议：${suggestion.sourceText}`,
        content: suggestion.sourceText, tags: ['医疗代诊', '复查建议'], sourceType: 'order', sourceOrderId: order._id,
        sourceScheduleKey: key, aiStatus: 'pending', reviewRole: 'familyDoctor',
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
}

async function createExpertAppointmentFollowUpPlan(task, order, patient, reportIds) {
  const reports = reportIds.length ? await MedicalReport.find({ _id: { $in: reportIds }, user: task.patientId, audit_status: 'audited' }).select('title documentCategory checkDate hospital reportItems aiSummary keyFindings note').lean() : [];
  const sourceText = reports.map(report => {
    const items = (report.reportItems || []).slice(0, 80).map(item => [item.name, item.value, item.unit, item.findings, item.diagnosis, item.conclusion].filter(Boolean).join('｜')).join('\n');
    return `【${report.title || '就诊资料'}】${items || report.aiSummary || (report.keyFindings || []).join('；') || report.note || '仅有附件，待健康顾问查看原件'}`;
  }).join('\n\n');
  const fallbackContent = reports.length ? '查看本次就诊资料，跟进专家意见、检查结果、用药及复查安排；具体时间由健康顾问审核确认。' : '客户确认本次就诊暂无检查资料或病历可上传；健康顾问结合预约情况确认是否需要后续联系。';
  let content = fallbackContent;
  let followUpDate = new Date(); followUpDate.setDate(followUpDate.getDate() + 7);
  try {
    const { chat } = require('./ai');
    const prompt = `你是医疗服务随访计划助手。根据专家约诊信息和已审核的就诊后资料生成一条简明、可执行的随访计划草稿。不得补写不存在的诊断、药物或检查结果；没有资料时明确需由健康顾问确认客户是否需要后续联系。仅输出JSON：{"content":"随访事项","daysLater":1到30的整数}。\n约诊信息：${order.serviceRequirements || ''}\n健管审核：${task.formData?.auditSummary || ''}\n资料：${sourceText || '客户或健管专员确认暂无资料上传'}`;
    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 700, temperature: 0 });
    const match = String(text || '').match(/\{[\s\S]*\}/);
    const draft = match ? JSON.parse(match[0]) : {};
    if (nonempty(draft.content)) content = nonempty(draft.content);
    const days = Math.max(1, Math.min(30, Number(draft.daysLater) || 7));
    followUpDate = new Date(); followUpDate.setDate(followUpDate.getDate() + days);
  } catch (error) {
    console.error('[expert-appointment] AI随访计划生成失败，使用安全草稿', error.message);
  }
  return FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `expert_appointment_followup:${order._id}` },
    { $setOnInsert: { patientId: task.patientId, staffId: patient.assignedFamilyDoctor, assignedTo: patient.assignedFamilyDoctor, date: followUpDate, remindAt: followUpDate, type: 'other', status: 'planned', theme: '专家约诊后随访计划', content, plannedContent: content, tags: ['专家约诊', '就诊后随访'], sourceType: 'order', sourceOrderId: order._id, sourceScheduleKey: `expert_appointment_followup:${order._id}`, aiStatus: 'pending', reviewRole: 'familyDoctor', formData: { reportIds, auditSummary: task.formData?.auditSummary || '', generatedFromExpertAppointment: true } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function reportIdsFromTask(task = {}) {
  return [...new Set([
    ...(task.formData?.selectedReportIds || []),
    ...(task.formData?.reportIds || []),
    ...(task.serviceChecklist || []).flatMap(item => item?.reportIds || []),
  ].map(String).filter(Boolean))];
}

async function findRecentSelectedReportIds(patientId) {
  const tasks = await FollowUp.find({
    patientId, sourceType: 'health_plan', status: 'completed',
    $or: [
      { 'formData.selectedReportIds.0': { $exists: true } },
      { 'formData.reportIds.0': { $exists: true } },
      { 'serviceChecklist.reportIds.0': { $exists: true } },
    ],
  }).sort({ completedAt: -1, updatedAt: -1 }).limit(20).select('formData serviceChecklist').lean();
  for (const priorTask of tasks) {
    const ids = reportIdsFromTask(priorTask);
    if (!ids.length) continue;
    const valid = await MedicalReport.find({ _id: { $in: ids }, user: patientId }).select('_id').lean();
    const validSet = new Set(valid.map(report => String(report._id)));
    const selected = ids.filter(id => validSet.has(id));
    if (selected.length) return selected;
  }
  return [];
}

async function startMedicalProxyWorkflow(order, plannerId, serviceTime, serviceTimeEnd, serviceContent, customerNeed, communicationWindow = {}) {
  const existing = await FollowUp.exists({ sourceType: 'order', sourceOrderId: order._id, workflowKey: { $in: ALL_STAGES.map(stage => `${PREFIX}${stage}`).concat(`${PREFIX}intake`) } });
  if (existing) throw Object.assign(new Error('该订单已进入医疗代诊分阶段流程，请在服务任务中继续办理'), { status: 409 });
  if (/就医规划/.test(order.serviceName || '') && (!nonempty(communicationWindow.communicationDate) || !nonempty(communicationWindow.communicationTimeStart) || !nonempty(communicationWindow.communicationTimeEnd))) {
    throw Object.assign(new Error('请确认客户预期沟通日期和起止时间'), { status: 400 });
  }
  if (/就医规划/.test(order.serviceName || '') && communicationWindow.communicationTimeEnd <= communicationWindow.communicationTimeStart) {
    throw Object.assign(new Error('预期沟通结束时间必须晚于开始时间'), { status: 400 });
  }
  const patient = await User.findById(order.user).select('assignedHealthManager assignedHealthPlanner assignedFamilyDoctor memberType servicePackage').lean();
  const medicalPlanning = /就医规划/.test(order.serviceName || '');
  if (medicalPlanning && !patient?.assignedFamilyDoctor) throw Object.assign(new Error('该客户尚未分配健康顾问，无法转交'), { status: 409 });
  const manager = patient?.assignedHealthManager;
  if (!manager) throw Object.assign(new Error('该客户尚未分配健管专员，请先完成分配'), { status: 409 });
  const date = serviceTime ? new Date(serviceTime) : new Date();
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('服务日期无效'), { status: 400 });
  const endDate = serviceTimeEnd ? new Date(`${serviceTimeEnd}T00:00:00+08:00`) : date;
  if (Number.isNaN(endDate.getTime()) || endDate < date) throw Object.assign(new Error('服务结束日期不能早于开始日期'), { status: 400 });
  const collectionDueAt = preparationDueDate(date);
  const carriedReportIds = await findRecentSelectedReportIds(order.user);
  // 旧版曾创建不带 workflowKey / sourceOrderId 的同名督办卡。新流程启动前先关闭，
  // 避免同一客户同时看到旧督办和订单级新督办。
  await FollowUp.updateMany({
    patientId: order.user, status: { $in: ['planned', 'in_progress'] },
    theme: /^医疗代诊[：:]\s*健康规划师全程督办\s*$/,
    $or: [{ workflowKey: { $exists: false } }, { workflowKey: { $in: ['', null] } }],
  }, { $set: { status: 'cancelled', cancelReason: '已由订单级医疗代诊全程督办任务替代' } });
  const supervisor = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` },
    { $setOnInsert: {
      patientId: order.user, staffId: plannerId, assignedTo: plannerId, type: 'other', status: 'in_progress',
      date, remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}supervise`, taskRole: 'supervisor',
      theme: medicalPlanning ? `就医规划：健康规划师全程督办 · ${order.serviceName}` : `医疗代诊：健康规划师全程督办 · ${order.serviceName}`,
      plannedContent: medicalPlanning ? `服务内容：${serviceContent}\n客户诉求：${customerNeed}\n预期沟通时段：${communicationWindow.communicationDate} ${communicationWindow.communicationTimeStart}–${communicationWindow.communicationTimeEnd}\n健康顾问提出就医规划建议后，与客户沟通是否需要其他就医协助服务，再由规划师结案。` : `期望服务日期：${date.toLocaleDateString('zh-CN')} 至 ${endDate.toLocaleDateString('zh-CN')}\n服务内容：${serviceContent}\n客户诉求：${customerNeed}\n持续督办资料审核、健康顾问方案确认和就医专员代诊；代诊执行结束后关闭。`,
      formData: { medicalPlanning, serviceContent, customerNeed, preferredDateStart: dateInput(date), preferredDateEnd: dateInput(endDate), currentStage: /专家约诊/.test(order.serviceName || '') ? 'booking' : medicalPlanning ? 'advisor' : 'collect' },
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await FollowUp.updateMany({
    _id: { $ne: supervisor._id }, patientId: order.user,
    sourceType: 'order', workflowKey: `${PREFIX}supervise`,
    sourceOrderId: { $ne: order._id }, status: { $in: ['planned', 'in_progress'] },
    theme: /^医疗代诊[：:]\s*健康规划师全程督办\s*$/,
    createdAt: { $lt: supervisor.createdAt },
  }, { $set: { status: 'cancelled', cancelReason: '旧版医疗代诊督办已由当前订单督办替代' } });
  await FollowUp.updateMany({
    patientId: order.user, sourceType: 'order', sourceOrderId: { $ne: order._id },
    workflowKey: { $in: ALL_STAGES.map(stage => `${PREFIX}${stage}`).concat(`${PREFIX}intake`) },
    status: { $in: ['planned', 'in_progress'] }, createdAt: { $lt: supervisor.createdAt },
  }, { $set: { status: 'cancelled', cancelReason: '旧医疗代诊订单任务已由当前订单替代' } });
  if (/专家约诊/.test(order.serviceName || '')) {
    return FollowUp.findOneAndUpdate(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}booking` },
      { $setOnInsert: {
        patientId: order.user, staffId: manager, assignedTo: manager, type: 'other', status: 'planned',
        date, remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
        workflowKey: `${PREFIX}booking`, taskRole: 'executor',
        theme: `医疗代诊：健管专员完成专家门诊预约 · ${order.serviceName}`,
        plannedContent: `客户已与健康规划师确认专家和期望日期区间，请完成专家门诊预约并记录实际时间。\n${serviceContent}`,
        formData: { planSnapshot: { serviceContent, customerNeed }, preferredDateStart: dateInput(date), preferredDateEnd: dateInput(endDate) },
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  const communicationDate = nonempty(communicationWindow.communicationDate || dateInput(date));
  const communicationTimeStart = nonempty(communicationWindow.communicationTimeStart);
  const communicationTimeEnd = nonempty(communicationWindow.communicationTimeEnd);
  if (medicalPlanning) {
    const advisorTask = await FollowUp.findOneAndUpdate(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor` },
      { $setOnInsert: {
        patientId: order.user, staffId: plannerId, assignedTo: patient.assignedFamilyDoctor,
        type: 'other', status: 'planned', date: new Date(), remindAt: new Date(),
        sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor`, taskRole: 'executor',
        theme: `就医规划：健康顾问评估 · ${order.serviceName}`,
        plannedContent: `健康规划师已核对服务内容和客户诉求，请在约定时段与客户沟通并评估。客户上传的报告仍须经健管专员审核后才能作为已审核资料使用。`,
        formData: { medicalPlanning: true, serviceContent, customerNeed, communicationDate, communicationTimeStart, communicationTimeEnd, reportIds: [] },
      } }, { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await FollowUp.updateMany(
      { sourceType: 'order', sourceOrderId: order._id, _id: { $nin: [advisorTask._id, supervisor._id] }, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } },
      { $set: { status: 'cancelled', cancelReason: '就医规划已转健康顾问评估' } },
    );
    return advisorTask;
  }
  const task = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}collect` },
    { $setOnInsert: {
      patientId: order.user, staffId: plannerId, assignedTo: plannerId, type: 'other', status: 'planned',
      date: collectionDueAt, remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}collect`, taskRole: 'executor',
      theme: `医疗代诊：指导上传并选定本次资料 · ${order.serviceName}`,
      plannedContent: `服务内容：${serviceContent}\n客户诉求：${customerNeed}\n指导客户上传病历、既往报告、当前用药、身份医保资料和代诊问题清单；选定本次需审核的资料后交健管专员审核。`,
      formData: { serviceContent, customerNeed, communicationDate, communicationTimeStart, communicationTimeEnd, reportIds: carriedReportIds, carriedReportIds, annualMember: /年度|年卡|一年|12个月/.test(`${patient.memberType || ''} ${patient.servicePackage || ''}`) },
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await FollowUp.updateMany(
    { sourceType: 'order', sourceOrderId: order._id, _id: { $nin: [task._id, supervisor._id] }, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'cancelled', cancelReason: '医疗代诊已进入分阶段服务流程' } },
  );
  await Order.updateOne({ _id: order._id }, { $set: {
    supervisorId: plannerId, currentStage: 'collect', currentAssignee: plannerId,
    closureMode: 'automatic', supervisionStatus: 'in_progress',
  } });
  return task;
}

async function startStaffMedicalProxyWorkflow({ patient, advisorId, plan }) {
  const appointmentOnly = plan.appointmentOnly === true;
  const medicationProxy = plan.medicationProxy === true;
  const appointmentRequirement = (medicationProxy ? [
    plan.hospital, plan.campus, plan.department, plan.expert,
    plan.notes && `备注：${String(plan.notes).trim()}`,
  ] : [
    plan.hospital, plan.campus, plan.department, plan.expert,
    `门诊类型：${plan.clinicType === 'international' ? '国际门诊' : '普通门诊'}`,
    `费用与保险：${plan.insuranceUse === 'high_end' ? '使用高端医疗险' : '自费'}`,
    plan.insuranceUse === 'high_end' && plan.insurerName && `保险公司：${String(plan.insurerName).trim()}`,
    plan.insuranceUse === 'high_end' && `结算方式：${({ direct: '直付', reimbursement: '先付后报' })[plan.settlementMethod] || '待核实'}`,
  ]).filter(Boolean).join('；');
  if (!patient.assignedHealthManager || ((!appointmentOnly || medicationProxy) && !patient.assignedHealthPlanner)) {
    throw Object.assign(new Error(appointmentOnly ? '请先为客户分配健管专员' : '请先为客户分配健康规划师和健管专员'), { status: 409 });
  }
  const reportIds = [...new Set((plan.selectedReportIds || []).map(String).filter(Boolean))];
  if (!appointmentOnly && !medicationProxy) {
    const reportCount = await MedicalReport.countDocuments({ _id: { $in: reportIds }, user: patient._id, audit_status: 'audited' });
    if (!reportIds.length || reportCount !== reportIds.length) throw Object.assign(new Error('请选择该客户至少一份已审核资料'), { status: 400 });
  }
  const date = new Date();
  const serviceName = medicationProxy ? '代配药服务' : appointmentOnly ? '专家约诊服务' : '医疗代诊服务';
  const order = await Order.create({
    user: patient._id, tenantId: patient.tenantId || null, serviceId: `annual-member-medical-proxy-${Date.now()}`,
    serviceName, servicePrice: 0, unitPrice: 0, paymentStatus: 'unpaid', tradeStatus: 'fulfilling',
    status: 'pending', initiationSource: STAFF_DIRECT_SOURCE,
    desiredServiceDate: (appointmentOnly || medicationProxy) ? appointmentAt(plan.preferredDateStart, String(plan.serviceTime || '').match(/^\d{2}:\d{2}/)?.[0] || '09:00') : null,
    desiredServiceDateEnd: (appointmentOnly || medicationProxy) ? appointmentAt(plan.preferredDateEnd || plan.preferredDateStart, String(plan.serviceTime || '').match(/^\d{2}:\d{2}/)?.[0] || '09:00') : null,
    serviceRequirements: (appointmentOnly || medicationProxy) ? appointmentRequirement : `${plan.proxyGoal}\n${plan.communicationContent}`,
    serviceWorkflowSnapshot: { key: 'medical_proxy', source: STAFF_DIRECT_SOURCE },
    medicalProxyPlan: medicationProxy ? { ...plan, initiationSource: STAFF_DIRECT_SOURCE } : null,
  });
  if (appointmentOnly || medicationProxy) {
    const booking = await FollowUp.create({
      patientId: patient._id, staffId: advisorId, assignedTo: patient.assignedHealthManager,
      type: 'other', status: 'planned', date, remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}booking`, taskRole: 'executor', theme: medicationProxy ? `代配药：健管专员预约配药门诊 · ${serviceName}` : `医疗代诊：健管专员完成专家门诊预约 · ${serviceName}`,
      plannedContent: medicationProxy ? '健康顾问已发起代配药服务，请完成配药门诊预约；预约后转健康规划师安排执行人员。' : '健康顾问已发起专家约诊，请完成预约并记录实际日期时间。',
      formData: {
        planSnapshot: { ...plan, serviceContent: appointmentRequirement, initiationSource: STAFF_DIRECT_SOURCE },
        preferredDateStart: plan.preferredDateStart, preferredDateEnd: plan.preferredDateEnd || plan.preferredDateStart, medicationProxy,
      },
    });
    return { order, booking };
  }
  const supervisor = await FollowUp.create({
    patientId: patient._id, staffId: patient.assignedHealthPlanner, assignedTo: patient.assignedHealthPlanner,
    type: 'other', status: 'in_progress', date, remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
    workflowKey: `${PREFIX}supervise`, taskRole: 'supervisor', theme: '医疗代诊：健康规划师全程督办 · 医疗代诊服务',
    plannedContent: `健康顾问已确认代诊方案。持续督办专家预约和代诊执行，服务完成后自动闭环。`,
    formData: { currentStage: 'advisor', initiationSource: STAFF_DIRECT_SOURCE },
  });
  const advisorTask = await FollowUp.create({
    patientId: patient._id, staffId: advisorId, assignedTo: advisorId, type: 'other', status: 'completed',
    date: new Date(), remindAt: new Date(), completedAt: new Date(), completedBy: 'staff', sourceType: 'order', sourceOrderId: order._id,
    workflowKey: `${PREFIX}advisor`, taskRole: 'executor', theme: '医疗代诊：健康顾问确认代诊方案 · 医疗代诊服务',
    plannedContent: '健康顾问直接从既有已审核资料制定代诊方案。',
    formData: { ...plan, selectedReportIds: reportIds, initiationSource: STAFF_DIRECT_SOURCE },
  });
  await advanceMedicalProxyWorkflow(advisorTask);
  return { order, supervisor };
}

async function validateMedicalProxyStage(task, body, staff) {
  const stage = stageOf(task);
  if (!stage) return '';
  if (stage === 'supervise') {
    const supervisorOrder = task.sourceOrderId ? await Order.findById(task.sourceOrderId).select('serviceName').lean() : null;
    if (!/就医规划/.test(supervisorOrder?.serviceName || '')) return '健康规划师督办任务将在代诊执行完成后自动结束';
    if (body.status !== 'completed') return '';
    if (staff.role !== 'superadmin' && String(task.assignedTo || '') !== String(staff._id)) return '仅健康规划师可结束本次就医规划';
    const advisor = await FollowUp.findOne({ sourceType: 'order', sourceOrderId: task.sourceOrderId, workflowKey: `${PREFIX}advisor`, status: 'completed' }).select('_id').lean();
    if (!advisor) return '请等待健康顾问完成就医规划建议后再与客户确认';
    const data = body.formData || {};
    if (!nonempty(data.customerCommunicationSummary) || !['no_additional_service', 'additional_service_needed'].includes(data.planningOutcome)) return '请记录与客户沟通结果，并确认是否需要其他就医协助服务';
    if (data.planningOutcome === 'additional_service_needed' && !nonempty(data.additionalServiceNote)) return '请记录拟启用的服务及后续安排';
    return '';
  }
  if (body.status !== 'completed') return '';
  if (staff.role !== 'superadmin' && String(task.assignedTo || '') !== String(staff._id)) return '仅当前阶段负责人可完成此任务';
  const data = body.formData || {};
  if (stage === 'collect') {
    const ids = [...new Set((data.reportIds || []).map(String).filter(Boolean))];
    if (!nonempty(data.customerNeed) || !nonempty(data.materialSummary) || !nonempty(data.communicationDate) || !nonempty(data.communicationTimeStart) || !nonempty(data.communicationTimeEnd) || !ids.length) return '请填写客户诉求、预期沟通时段和资料清单，并选定至少一份本次服务资料';
    if (data.communicationTimeEnd <= data.communicationTimeStart) return '预期沟通结束时间必须晚于开始时间';
    const count = await MedicalReport.countDocuments({ _id: { $in: ids }, user: task.patientId });
    if (count !== ids.length) return '所选资料必须属于该客户';
  }
  if (stage === 'intake') {
    const ids = [...new Set((data.reportIds || []).map(String).filter(Boolean))];
    if (!nonempty(data.customerNeed) || !nonempty(data.materialSummary) || !ids.length) return '请填写客户诉求、资料核对结果，并关联至少一份已审核资料';
    const count = await MedicalReport.countDocuments({ _id: { $in: ids }, user: task.patientId, audit_status: 'audited' });
    if (count !== ids.length) return '所选资料必须属于该客户且已审核通过';
  }
  if (stage === 'audit') {
    const ids = [...new Set((data.collectionSnapshot?.reportIds || []).map(String).filter(Boolean))];
    const count = ids.length ? await MedicalReport.countDocuments({ _id: { $in: ids }, user: task.patientId, audit_status: 'audited' }) : 0;
    if (!ids.length || count !== ids.length) return '请先在报告管理完成本次全部资料审核，退回或补传缺失资料后再流转';
    if (!nonempty(data.auditSummary)) return '请填写本次资料审核结论';
  }
  if (stage === 'advisor' && data.medicalPlanning === true && ['problemAnalysis', 'expertRecommendation1', 'expertRecommendation2'].some(key => !nonempty(data[key]))) return '请填写问题分析，并至少推荐两位专家（注明各自所在医院和科室）';
  if (stage === 'advisor' && data.medicalPlanning !== true && ['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].some(key => !nonempty(data[key]))) {
    return '请确认代诊医院、科室、专家、代诊目标和与医生交流内容';
  }
  if (stage === 'advisor' && data.medicalPlanning !== true) {
    const ids = [...new Set((data.auditSnapshot?.collectionSnapshot?.reportIds || data.intakeSnapshot?.reportIds || []).map(String).filter(Boolean))];
    const count = ids.length ? await MedicalReport.countDocuments({ _id: { $in: ids }, user: task.patientId, audit_status: 'audited' }) : 0;
    if (!ids.length || count !== ids.length) return '本次资料已失效或尚未审核，请退回上一环节补齐';
    if (data.auditSnapshot?.collectionSnapshot?.annualMember || data.initiationSource === STAFF_DIRECT_SOURCE) {
      const selected = [...new Set((data.selectedReportIds || []).map(String).filter(Boolean))];
      if (!selected.length || selected.some(id => !ids.includes(id))) return '年度会员请由健康顾问从本次已审核资料中选择制定方案所用资料';
    }
  }
  if (stage === 'planner') {
    if (!nonempty(data.medicalAssistantId)) return '请指派就医专员';
    const assistant = await Admin.findOne({ _id: data.medicalAssistantId, role: 'medicalAssistant', staffStatus: 'active' }).select('_id').lean();
    if (!assistant) return '请选择当前有效的就医专员';
  }
  if (stage === 'booking') {
    if (['preferredDateStart', 'preferredDateEnd', 'appointmentDate', 'appointmentTime'].some(key => !nonempty(data[key]))) {
      return '请完整填写客户期望日期区间和实际约诊日期时间';
    }
    if (![data.preferredDateStart, data.preferredDateEnd, data.appointmentDate].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || !/^\d{2}:\d{2}$/.test(data.appointmentTime)) return '预约日期或时间格式无效';
    if (data.preferredDateEnd < data.preferredDateStart) return '客户期望日期区间结束日期不能早于开始日期';
    if ((data.appointmentDate < data.preferredDateStart || data.appointmentDate > data.preferredDateEnd) && !nonempty(data.dateDifferenceNote)) return '约诊日期不在客户期望区间内，请说明差异及客户确认情况';
    const bookingOrder = task.sourceOrderId ? await Order.findById(task.sourceOrderId).select('serviceName serviceRequirements').lean() : null;
    const appointmentRequirement = nonempty(data.planSnapshot?.serviceContent || bookingOrder?.serviceRequirements);
    if (/(?:保险类型：高端险|费用与保险：使用高端医疗险)/.test(appointmentRequirement) && !['direct_verified', 'reimbursement_verified', 'self_pay_confirmed'].includes(data.insuranceOutcome)) return '请核实高端医疗险实际结算方式，并选择办理结果';
    if (/专家约诊/.test(bookingOrder?.serviceName || '') && /建议医院：/.test(appointmentRequirement) && !nonempty(data.campus)) return '请填写实际预约院区';
    if (!/专家约诊|代配药|代取药/.test(bookingOrder?.serviceName || '')) {
      const assistant = await Admin.findOne({ _id: data.medicalAssistantId, role: 'medicalAssistant', staffStatus: 'active' }).select('_id').lean();
      if (!assistant) return data.planSnapshot?.initiationSource === STAFF_DIRECT_SOURCE ? '请在预约完成后指派有效的就医专员' : '原预指派就医专员已失效，请退回健康规划师重新指派';
    }
  }
  if (stage === 'appointment_review') {
    if (!nonempty(data.serviceContent) || !nonempty(data.preferredDateStart) || !nonempty(data.preferredDateEnd) || data.preferredDateEnd < data.preferredDateStart) return '请完善回退约诊任务的新增类目和有效期望日期区间';
  }
  if (stage === 'post_visit_audit') {
    const ids = [...new Set((data.reportIds || []).map(String).filter(Boolean))];
    if (!ids.length && data.noMaterialsConfirmed !== true) return '请选择已审核资料；如本次确实没有检查资料或病历，请勾选确认无资料';
    if (!nonempty(data.auditSummary)) return '请填写健管专员审核结论';
    const order = await Order.findById(task.sourceOrderId).select('scheduledAt').lean();
    if (!order?.scheduledAt || new Date() < order.scheduledAt) return '就诊时间尚未到达，不能结束报告审核环节';
    const count = ids.length ? await MedicalReport.countDocuments({ _id: { $in: ids }, user: task.patientId, audit_status: 'audited', createdAt: { $gte: order.scheduledAt } }) : 0;
    if (count !== ids.length) return '只能选取本次就诊后上传且已由健管专员审核的报告';
  }
  if (stage === 'post_visit_review' && !nonempty(data.reviewSummary)) return '请查看本次已审核资料并填写健康顾问查看结论';
  if (stage === 'execute' && (!nonempty(data.executionResult) || !Array.isArray(data.medicalRecordAttachments) || !data.medicalRecordAttachments.some(file => nonempty(file?.url)))) return '请填写代诊执行结果并上传至少一份代诊病历';
  if (stage === 'collect' || stage === 'audit' || stage === 'advisor' || stage === 'planner' || stage === 'intake') {
    const patient = await User.findById(task.patientId).select('assignedFamilyDoctor assignedHealthPlanner assignedHealthManager').lean();
    if (stage === 'collect' && !patient?.assignedHealthManager) return '客户尚未分配健管专员，无法流转';
    if ((stage === 'audit' || stage === 'intake') && !patient?.assignedFamilyDoctor) return '客户尚未分配健康顾问，无法流转';
    if (stage === 'advisor' && !patient?.assignedHealthPlanner) return '客户尚未分配健康规划师，无法流转';
    if (stage === 'planner' && !patient?.assignedHealthManager) return '客户尚未分配健管专员，无法进入专家门诊预约环节';
  }
  return '';
}

async function advanceMedicalProxyWorkflow(task) {
  const stage = stageOf(task);
  if (!stage || task.status !== 'completed') return;
  if (stage === 'supervise') return;
  const index = STAGES.indexOf(stage);
  const order = await Order.findById(task.sourceOrderId);
  if (!order) return;
  const patient = await User.findById(task.patientId).select('tenantId assignedHealthManager assignedFamilyDoctor assignedHealthPlanner').lean();
  if (stage === 'appointment_review') {
    if (!patient?.assignedHealthManager) throw Object.assign(new Error('客户尚未分配健管专员，无法重新预约'), { status: 409 });
    const previousBooking = order.medicalProxyPlan?.booking || null;
    const bookingRevision = Number(order.medicalProxyPlan?.bookingRevision || 0) + 1;
    order.medicalProxyPlan = { ...(order.medicalProxyPlan || {}), previousBooking, bookingRevision, booking: null };
    order.serviceRequirements = task.formData.serviceContent.trim();
    order.desiredServiceDate = appointmentAt(task.formData.preferredDateStart);
    order.desiredServiceDateEnd = appointmentAt(task.formData.preferredDateEnd);
    order.scheduledAt = null; order.completedAt = null; order.status = 'pending'; order.tradeStatus = 'fulfilling';
    order.markModified('medicalProxyPlan');
    await order.save();
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}booking` }, { $set: { status: 'planned', assignedTo: patient.assignedHealthManager, staffId: patient.assignedHealthManager, completedAt: null, completedBy: null, date: new Date(), remindAt: new Date(), formData: { planSnapshot: { serviceContent: order.serviceRequirements, initiationSource: order.initiationSource }, preferredDateStart: task.formData.preferredDateStart, preferredDateEnd: task.formData.preferredDateEnd }, plannedContent: '原约诊任务已回退健康顾问，并已完善院区、门诊类型及保险等新增类目，请重新预约并记录实际日期时间。' } });
    await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: order._id, workflowKey: { $in: [`${PREFIX}post_visit_audit`, `${PREFIX}post_visit_review`] }, status: { $in: ['planned', 'in_progress'] } }, { $set: { status: 'cancelled', cancelReason: '健康顾问重新核对约诊需求' } });
    await require('../models/AppointmentReminder').updateMany({ orderId: order._id, status: { $in: ['pending', 'processing'] } }, { $set: { status: 'cancelled' } });
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` }, { $set: { 'formData.currentStage': 'booking', content: '原约诊任务已回退并完善新增类目，等待健管专员重新预约。' } });
    return;
  }
  if (stage === 'advisor') {
    order.medicalProxyPlan = { ...task.formData, confirmedBy: task.assignedTo, confirmedAt: new Date(), intakeTaskId: task.dependsOnTaskId };
    order.markModified('medicalProxyPlan');
    await order.save();
    if (task.formData?.medicalPlanning === true) {
      await FollowUp.updateOne(
        { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise`, status: { $in: ['planned', 'in_progress'] } },
        { $set: { theme: `就医规划：健康规划师客户沟通与结案 · ${order.serviceName}`, content: '健康顾问已完成就医规划建议，请与客户沟通是否需要其他就医协助服务。', 'formData.currentStage': 'planner_followup', 'formData.medicalPlanning': true, 'formData.advisorSnapshot': task.formData, remindAt: new Date() } },
      );
      return;
    }
  }
  if (stage === 'booking') {
    order.medicalProxyPlan = { ...(order.medicalProxyPlan || {}), booking: task.formData, bookedBy: task.assignedTo, bookedAt: new Date() };
    order.scheduledAt = appointmentAt(task.formData.appointmentDate, task.formData.appointmentTime);
    order.desiredServiceDate = task.formData.preferredDateStart ? appointmentAt(task.formData.preferredDateStart) : null;
    order.desiredServiceDateEnd = task.formData.preferredDateEnd ? appointmentAt(task.formData.preferredDateEnd) : null;
    order.status = 'scheduled';
    order.markModified('medicalProxyPlan');
    await order.save();
    await upsertMedicalProxyServiceRecord(task, order, false);
    if (/专家约诊/.test(order.serviceName || '')) {
      const requirement = nonempty(task.formData?.planSnapshot?.serviceContent || order.serviceRequirements);
      const confirmedRequirement = requirement.replace(/；结算方式：(待核实|直付|先付后报)/g, '');
      const insuranceResult = ({ direct_verified: '已核实可直付', reimbursement_verified: '已核实先付后报', self_pay_confirmed: '保险不适用，客户已确认自费' })[task.formData.insuranceOutcome];
      const appointmentText = `预约时间：${task.formData.appointmentDate} ${task.formData.appointmentTime}\n院区：${task.formData.campus}\n约诊需求：${confirmedRequirement || '已确认'}${insuranceResult ? `\n保险办理：${insuranceResult}` : ''}`;
      await require('./appointmentReminderScheduler').scheduleExpertAppointmentReminders({
        order, appointmentDate: order.scheduledAt, appointmentText,
      });
      const confirmationKey = `expert-appointment-confirmed:${order._id}${order.medicalProxyPlan?.bookingRevision ? `:${order.medicalProxyPlan.bookingRevision}` : ''}`;
        await require('../models/Message').findOneAndUpdate(
          { dedupeKey: confirmationKey },
          { $set: {
            user: order.user, type: 'system', sender: '嘉医管家', title: '专家就医提醒',
            content: `您的专家门诊预约已确认。就诊后请上传病历和检查报告；健管专员审核、健康顾问查看后，本项服务结束。\n约诊需求：${confirmedRequirement || '已确认'}\n院区：${task.formData.campus}\n预约时间：${task.formData.appointmentDate} ${task.formData.appointmentTime}${insuranceResult ? `\n保险办理：${insuranceResult}` : ''}${task.formData.dateDifferenceNote ? `\n补充说明：${task.formData.dateDifferenceNote}` : ''}`,
            conversationId: null, unread: true, readAt: null, isAI: false, aiGenerated: false,
            dedupeKey: confirmationKey,
            action: { type: 'expert_appointment_confirmed', orderId: String(order._id) },
          } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await FollowUp.findOneAndUpdate(
        { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}post_visit_audit` },
        { $setOnInsert: { patientId: task.patientId, staffId: task.assignedTo, assignedTo: patient?.assignedHealthManager, type: 'other', status: 'planned', date: order.scheduledAt, remindAt: order.scheduledAt, sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}post_visit_audit`, taskRole: 'executor', dependsOnTaskId: task._id, theme: `专家约诊：健管专员审核就诊后资料 · ${order.serviceName}`, plannedContent: '客户就诊后上传病历和检查报告；请在报告管理完成审核，再选定本次报告交健康顾问查看。', formData: { reportIds: [], appointmentAt: order.scheduledAt } } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` }, { $set: { 'formData.currentStage': 'post_visit_audit', content: '预约已确认，等待客户就诊后上传资料并由健管专员审核。' } });
      return;
    }
  }
  if (stage === 'post_visit_audit') {
    await createExpertAppointmentFollowUpPlan(task, order, patient, [...new Set((task.formData?.reportIds || []).map(String).filter(Boolean))]);
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` }, { $set: { 'formData.currentStage': 'followup_review', content: '健管专员已完成资料审核，AI已生成随访计划，等待健康顾问审核。' } });
    return;
  }
  if (stage === 'post_visit_review') {
    const ids = [...new Set((task.formData?.auditSnapshot?.reportIds || []).map(String).filter(Boolean))];
    await MedicalReport.updateMany({ _id: { $in: ids }, user: task.patientId, audit_status: 'audited' }, { $set: { familyDoctorViewedAt: new Date() } });
    order.status = 'completed'; order.tradeStatus = 'completed'; order.completedAt = new Date();
    await order.save();
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise`, status: { $in: ['planned', 'in_progress'] } }, { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', 'formData.currentStage': 'completed', content: '就诊后资料已由健管专员审核并由健康顾问查看，专家约诊服务结束。' } });
    return;
  }
  if (stage === 'intake') {
    await FollowUp.findOneAndUpdate(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor` },
      { $setOnInsert: {
        patientId: task.patientId, staffId: task.staffId, assignedTo: patient?.assignedFamilyDoctor,
        type: 'other', status: 'planned', date: new Date(), remindAt: new Date(),
        sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}advisor`,
        taskRole: 'executor', dependsOnTaskId: task._id,
        theme: `医疗代诊：健康顾问确认代诊方案 · ${order.serviceName}`,
        plannedContent: '查看健管专员已审核的本次资料，确认代诊医院、科室、专家、目标及交流内容。',
        formData: { intakeSnapshot: task.formData, selectedReportIds: task.formData?.reportIds || [] },
      } }, { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise` }, { $set: { 'formData.currentStage': 'advisor' } });
    await Order.updateOne({ _id: order._id }, { $set: {
      currentStage: 'advisor', currentAssignee: patient?.assignedFamilyDoctor, supervisionStatus: 'in_progress',
    } });
    return;
  }
  if (index === STAGES.length - 1) {
    await upsertMedicalProxyServiceRecord(task, order, true);
    await archiveMedicalProxyRecords(task, order, patient?.tenantId);
    await createMedicalProxyFollowUpDrafts(task, order, patient?.assignedFamilyDoctor);
    if (order.initiationSource === STAFF_DIRECT_SOURCE) {
      order.status = 'completed';
      order.tradeStatus = 'completed';
      order.completedAt = new Date();
      await order.save();
    }
    await FollowUp.updateOne(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise`, status: { $in: ['planned', 'in_progress'] } },
      { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', content: '就医专员已完成代诊，健康规划师全程督办闭环。', 'formData.currentStage': 'completed' } },
    );
    await Order.updateOne({ _id: order._id }, { $set: {
      currentStage: 'completed', currentAssignee: null, supervisionStatus: 'completed',
    } });
    return;
  }
  const medicationProxy = /代配药|代取药/.test(order.serviceName || '');
  const next = medicationProxy && stage === 'booking' ? 'planner'
    : medicationProxy && stage === 'planner' ? 'execute'
      : stage === 'advisor' && task.formData?.initiationSource === STAFF_DIRECT_SOURCE ? 'booking' : STAGES[index + 1];
  const assignee = next === 'audit' ? patient?.assignedHealthManager
    : next === 'advisor' ? patient?.assignedFamilyDoctor
    : next === 'planner' ? patient?.assignedHealthPlanner
      : next === 'booking' ? patient?.assignedHealthManager
      : task.formData?.medicalAssistantId;
  if (!assignee) throw Object.assign(new Error(`客户尚未分配${next === 'audit' || next === 'booking' ? '健管专员' : next === 'advisor' ? '健康顾问' : next === 'planner' ? '健康规划师' : '就医专员'}，无法流转`), { status: 409 });
  const labels = { audit: '健管专员审核本次资料', advisor: '健康顾问确认代诊方案', planner: medicationProxy ? '健康规划师安排配药人员' : '审核方案并预指派就医专员', booking: medicationProxy ? '健管专员预约配药门诊' : '健管专员完成专家门诊预约', execute: medicationProxy ? '执行人员完成配药' : '就医专员执行代诊' };
  const bookingNote = stage === 'booking' && task.content !== '医疗代诊专家门诊预约已完成' ? nonempty(task.content) : '';
  const nextDate = next === 'execute' && task.formData?.appointmentDate
    ? appointmentAt(task.formData.appointmentDate, task.formData.appointmentTime) : new Date();
  const nextTask = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${next}` },
    { $setOnInsert: {
      patientId: task.patientId, staffId: task.staffId, assignedTo: assignee, type: 'other', status: 'planned',
      date: nextDate, remindAt: next === 'execute' ? nextDate : new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}${next}`, taskRole: 'executor', dependsOnTaskId: task._id,
      theme: `医疗代诊：${labels[next]} · ${order.serviceName}`,
      plannedContent: next === 'audit' ? '审核健康规划师选定的本次资料；客户需补传时退回资料收集环节。'
        : next === 'advisor'
        ? '查看本次已审核资料及客户诉求，确认医院、科室、专家、代诊目标和与医生交流的具体内容。年度会员由健康顾问选定制定方案所用资料。'
        : next === 'planner' ? (medicationProxy ? '核对健管专员确认的预约信息，并安排实际配药人员。' : '核对健康顾问确认的代诊方案，预指派就医专员。')
          : next === 'booking' ? '依据健康顾问方案预约专家门诊；记录客户期望日期区间与实际约诊日期时间，超出期望区间时记录沟通确认结果。'
            : '按健康顾问方案和健管专员确认的预约信息完成代诊，记录医生反馈、医嘱和后续事项。',
      formData: next === 'audit' ? { collectionSnapshot: task.formData }
        : next === 'advisor' ? { auditSnapshot: task.formData, selectedReportIds: task.formData?.collectionSnapshot?.annualMember ? [] : task.formData?.collectionSnapshot?.reportIds || [] }
          : next === 'planner' ? { planSnapshot: order.medicalProxyPlan }
            : next === 'booking' ? { planSnapshot: order.medicalProxyPlan, medicalAssistantId: task.formData?.medicalAssistantId, preferredDateStart: dateInput(order.desiredServiceDate || order.scheduledAt), preferredDateEnd: dateInput(order.desiredServiceDateEnd || order.desiredServiceDate || order.scheduledAt) }
              : { planSnapshot: order.medicalProxyPlan, bookingSnapshot: { ...task.formData, additionalNote: bookingNote } },
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (nextTask.isBlocked) {
    const nextFormData = next === 'audit' ? { ...nextTask.formData, collectionSnapshot: task.formData }
      : next === 'advisor' ? { ...nextTask.formData, auditSnapshot: task.formData, selectedReportIds: task.formData?.collectionSnapshot?.annualMember ? [] : task.formData?.collectionSnapshot?.reportIds || [] }
        : next === 'planner' ? { ...nextTask.formData, planSnapshot: order.medicalProxyPlan }
          : next === 'booking' ? { ...nextTask.formData, planSnapshot: order.medicalProxyPlan, medicalAssistantId: task.formData?.medicalAssistantId, preferredDateStart: nextTask.formData?.preferredDateStart || dateInput(order.desiredServiceDate || order.scheduledAt), preferredDateEnd: nextTask.formData?.preferredDateEnd || dateInput(order.desiredServiceDateEnd || order.desiredServiceDate || order.scheduledAt) }
            : { ...nextTask.formData, planSnapshot: order.medicalProxyPlan, bookingSnapshot: { ...task.formData, additionalNote: bookingNote } };
    await FollowUp.updateOne({ _id: nextTask._id }, { $set: { status: 'planned', isBlocked: false, assignedTo: assignee, formData: nextFormData, date: nextDate, remindAt: next === 'execute' ? nextDate : new Date() } });
  }
  await FollowUp.updateOne(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise`, status: { $in: ['planned', 'in_progress'] } },
    { $set: { 'formData.currentStage': next, content: `当前环节：${labels[next]}` } },
  );
  await Order.updateOne({ _id: order._id }, { $set: {
    currentStage: next, currentAssignee: assignee, supervisionStatus: 'in_progress',
  } });
}

module.exports = { isMedicalProxyOrder, stageOf, preparationDueDate, reportIdsFromTask, findRecentSelectedReportIds, extractMedicalProxyRechecks, startMedicalProxyWorkflow, startStaffMedicalProxyWorkflow, upsertMedicalProxyServiceRecord, validateMedicalProxyStage, advanceMedicalProxyWorkflow };
