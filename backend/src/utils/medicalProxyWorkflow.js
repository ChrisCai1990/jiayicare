const Admin = require('../models/Admin');
const FollowUp = require('../models/FollowUp');
const MedicalReport = require('../models/MedicalReport');
const Order = require('../models/Order');
const ServiceRecord = require('../models/ServiceRecord');
const User = require('../models/User');

const PREFIX = 'medical_proxy:';
const STAGES = ['collect', 'audit', 'advisor', 'planner', 'booking', 'execute'];
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
  const existing = await FollowUp.exists({ sourceType: 'order', sourceOrderId: order._id, workflowKey: { $in: STAGES.map(stage => `${PREFIX}${stage}`).concat(`${PREFIX}intake`) } });
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
    workflowKey: { $in: STAGES.map(stage => `${PREFIX}${stage}`).concat(`${PREFIX}intake`) },
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
  return task;
}

async function startStaffMedicalProxyWorkflow({ patient, advisorId, plan }) {
  const appointmentOnly = plan.appointmentOnly === true;
  if (!patient.assignedHealthManager || (!appointmentOnly && !patient.assignedHealthPlanner)) {
    throw Object.assign(new Error(appointmentOnly ? '请先为客户分配健管专员' : '请先为客户分配健康规划师和健管专员'), { status: 409 });
  }
  const reportIds = [...new Set((plan.selectedReportIds || []).map(String).filter(Boolean))];
  if (!appointmentOnly) {
    const reportCount = await MedicalReport.countDocuments({ _id: { $in: reportIds }, user: patient._id, audit_status: 'audited' });
    if (!reportIds.length || reportCount !== reportIds.length) throw Object.assign(new Error('请选择该客户至少一份已审核资料'), { status: 400 });
  }
  const date = new Date();
  const serviceName = appointmentOnly ? '专家约诊服务' : '医疗代诊服务';
  const order = await Order.create({
    user: patient._id, tenantId: patient.tenantId || null, serviceId: `annual-member-medical-proxy-${Date.now()}`,
    serviceName, servicePrice: 0, unitPrice: 0, paymentStatus: 'unpaid', tradeStatus: 'fulfilling',
    status: 'pending', initiationSource: STAFF_DIRECT_SOURCE,
    desiredServiceDate: appointmentOnly ? appointmentAt(plan.preferredDateStart) : null,
    desiredServiceDateEnd: appointmentOnly ? appointmentAt(plan.preferredDateEnd) : null,
    serviceRequirements: appointmentOnly ? [plan.hospital, plan.campus, plan.department, plan.expert].filter(Boolean).join(' ') : `${plan.proxyGoal}\n${plan.communicationContent}`,
    serviceWorkflowSnapshot: { key: 'medical_proxy', source: STAFF_DIRECT_SOURCE },
  });
  if (appointmentOnly) {
    const booking = await FollowUp.create({
      patientId: patient._id, staffId: advisorId, assignedTo: patient.assignedHealthManager,
      type: 'other', status: 'planned', date, remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}booking`, taskRole: 'executor', theme: `医疗代诊：健管专员完成专家门诊预约 · ${serviceName}`,
      plannedContent: '健康顾问已发起专家约诊，请完成预约并记录实际日期时间。',
      formData: {
        planSnapshot: { serviceContent: [plan.hospital, plan.campus, plan.department, plan.expert].filter(Boolean).join(' '), initiationSource: STAFF_DIRECT_SOURCE },
        preferredDateStart: plan.preferredDateStart, preferredDateEnd: plan.preferredDateEnd,
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
  if (stage === 'advisor' && data.medicalPlanning === true && ['problemAnalysis', 'hospitalRecommendations', 'departmentRecommendations', 'expertRecommendation1', 'expertRecommendation2'].some(key => !nonempty(data[key]))) return '请填写问题分析、建议医院与科室，并至少推荐两位专家';
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
    const bookingOrder = task.sourceOrderId ? await Order.findById(task.sourceOrderId).select('serviceName').lean() : null;
    if (!/专家约诊/.test(bookingOrder?.serviceName || '')) {
      const assistant = await Admin.findOne({ _id: data.medicalAssistantId, role: 'medicalAssistant', staffStatus: 'active' }).select('_id').lean();
      if (!assistant) return data.planSnapshot?.initiationSource === STAFF_DIRECT_SOURCE ? '请在预约完成后指派有效的就医专员' : '原预指派就医专员已失效，请退回健康规划师重新指派';
    }
  }
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
      const appointmentText = `预约时间：${task.formData.appointmentDate} ${task.formData.appointmentTime}\n约诊需求：${requirement || '已确认'}`;
      await require('./appointmentReminderScheduler').scheduleExpertAppointmentReminders({
        order, appointmentDate: order.scheduledAt, appointmentText,
      });
      await require('../models/Message').findOneAndUpdate(
        { dedupeKey: `expert-appointment-confirmed:${order._id}` },
        { $setOnInsert: {
          user: order.user, type: 'manager', sender: '嘉医管家', title: '专家约诊成功',
          content: `您的专家约诊已完成。\n约诊需求：${requirement || '已确认'}\n预约时间：${task.formData.appointmentDate} ${task.formData.appointmentTime}${task.formData.dateDifferenceNote ? `\n补充说明：${task.formData.dateDifferenceNote}` : ''}`,
          conversationId: `${order.user}_manager`, unread: true, isAI: false, aiGenerated: false,
          dedupeKey: `expert-appointment-confirmed:${order._id}`,
          action: { type: 'expert_appointment_confirmed', orderId: String(order._id) },
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await FollowUp.updateOne(
        { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise`, status: { $in: ['planned', 'in_progress'] } },
        { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', content: '健管专员已完成专家约诊，预约信息已发送客户。', 'formData.currentStage': 'completed' } },
      );
      order.status = 'completed';
      order.tradeStatus = 'completed';
      order.completedAt = new Date();
      await order.save();
      return;
    }
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
    return;
  }
  const next = stage === 'advisor' && task.formData?.initiationSource === STAFF_DIRECT_SOURCE ? 'booking' : STAGES[index + 1];
  const assignee = next === 'audit' ? patient?.assignedHealthManager
    : next === 'advisor' ? patient?.assignedFamilyDoctor
    : next === 'planner' ? patient?.assignedHealthPlanner
      : next === 'booking' ? patient?.assignedHealthManager
      : task.formData?.medicalAssistantId;
  if (!assignee) throw Object.assign(new Error(`客户尚未分配${next === 'audit' || next === 'booking' ? '健管专员' : next === 'advisor' ? '健康顾问' : next === 'planner' ? '健康规划师' : '就医专员'}，无法流转`), { status: 409 });
  const labels = { audit: '健管专员审核本次资料', advisor: '健康顾问确认代诊方案', planner: '审核方案并预指派就医专员', booking: '健管专员完成专家门诊预约', execute: '就医专员执行代诊' };
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
        : next === 'planner' ? '核对健康顾问确认的代诊方案，预指派就医专员。'
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
}

module.exports = { isMedicalProxyOrder, stageOf, preparationDueDate, reportIdsFromTask, findRecentSelectedReportIds, extractMedicalProxyRechecks, startMedicalProxyWorkflow, startStaffMedicalProxyWorkflow, upsertMedicalProxyServiceRecord, validateMedicalProxyStage, advanceMedicalProxyWorkflow };
