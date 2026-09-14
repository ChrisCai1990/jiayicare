const Admin = require('../models/Admin');
const FollowUp = require('../models/FollowUp');
const MedicalReport = require('../models/MedicalReport');
const Order = require('../models/Order');
const User = require('../models/User');

const PREFIX = 'medical_proxy:';
const STAGES = ['collect', 'audit', 'advisor', 'planner', 'execute'];
const isMedicalProxyOrder = name => /医疗代诊/.test(String(name || ''));
const stageOf = task => task?.sourceType === 'order' && String(task.workflowKey || '').startsWith(PREFIX)
  ? String(task.workflowKey).slice(PREFIX.length) : '';
const nonempty = value => String(value || '').trim();
const preparationDueDate = (serviceDate, now = new Date()) => {
  const due = new Date(serviceDate);
  due.setDate(due.getDate() - 3);
  return due < now ? new Date(now) : due;
};

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

async function startMedicalProxyWorkflow(order, plannerId, serviceTime, serviceContent, customerNeed) {
  const existing = await FollowUp.exists({ sourceType: 'order', sourceOrderId: order._id, workflowKey: { $in: STAGES.map(stage => `${PREFIX}${stage}`).concat(`${PREFIX}intake`) } });
  if (existing) throw Object.assign(new Error('该订单已进入医疗代诊分阶段流程，请在服务任务中继续办理'), { status: 409 });
  const patient = await User.findById(order.user).select('assignedHealthManager assignedHealthPlanner memberType servicePackage').lean();
  const manager = patient?.assignedHealthManager;
  if (!manager) throw Object.assign(new Error('该客户尚未分配健管专员，请先完成分配'), { status: 409 });
  const date = serviceTime ? new Date(serviceTime) : new Date();
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('服务日期无效'), { status: 400 });
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
      theme: `医疗代诊：健康规划师全程督办 · ${order.serviceName}`,
      plannedContent: `服务日期：${date.toLocaleDateString('zh-CN')}\n服务内容：${serviceContent}\n客户诉求：${customerNeed}\n持续督办资料审核、健康顾问方案确认和就医专员代诊；代诊执行结束后关闭。`,
      formData: { serviceContent, customerNeed, currentStage: 'collect' },
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
  const task = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}collect` },
    { $setOnInsert: {
      patientId: order.user, staffId: plannerId, assignedTo: plannerId, type: 'other', status: 'planned',
      date: collectionDueAt, remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}collect`, taskRole: 'executor',
      theme: `医疗代诊：指导上传并选定本次资料 · ${order.serviceName}`,
      plannedContent: `服务内容：${serviceContent}\n客户诉求：${customerNeed}\n指导客户上传病历、既往报告、当前用药、身份医保资料和代诊问题清单；选定本次需审核的资料后交健管专员审核。`,
      formData: { serviceContent, customerNeed, reportIds: carriedReportIds, carriedReportIds, annualMember: /年度|年卡|一年|12个月/.test(`${patient.memberType || ''} ${patient.servicePackage || ''}`) },
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await FollowUp.updateMany(
    { sourceType: 'order', sourceOrderId: order._id, _id: { $nin: [task._id, supervisor._id] }, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'cancelled', cancelReason: '医疗代诊已进入分阶段服务流程' } },
  );
  return task;
}

async function validateMedicalProxyStage(task, body, staff) {
  const stage = stageOf(task);
  if (!stage) return '';
  if (stage === 'supervise') return '健康规划师督办任务将在代诊执行完成后自动结束';
  if (body.status !== 'completed') return '';
  if (staff.role !== 'superadmin' && String(task.assignedTo || '') !== String(staff._id)) return '仅当前阶段负责人可完成此任务';
  const data = body.formData || {};
  if (stage === 'collect') {
    const ids = [...new Set((data.reportIds || []).map(String).filter(Boolean))];
    if (!nonempty(data.customerNeed) || !nonempty(data.materialSummary) || !ids.length) return '请填写客户诉求和资料清单，并选定至少一份本次服务资料';
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
  if (stage === 'advisor' && ['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].some(key => !nonempty(data[key]))) {
    return '请确认代诊医院、科室、专家、代诊目标和与医生交流内容';
  }
  if (stage === 'advisor') {
    const ids = [...new Set((data.auditSnapshot?.collectionSnapshot?.reportIds || data.intakeSnapshot?.reportIds || []).map(String).filter(Boolean))];
    const count = ids.length ? await MedicalReport.countDocuments({ _id: { $in: ids }, user: task.patientId, audit_status: 'audited' }) : 0;
    if (!ids.length || count !== ids.length) return '本次资料已失效或尚未审核，请退回上一环节补齐';
    if (data.auditSnapshot?.collectionSnapshot?.annualMember) {
      const selected = [...new Set((data.selectedReportIds || []).map(String).filter(Boolean))];
      if (!selected.length || selected.some(id => !ids.includes(id))) return '年度会员请由健康顾问从本次已审核资料中选择制定方案所用资料';
    }
  }
  if (stage === 'planner') {
    if (!nonempty(data.medicalAssistantId)) return '请指派就医专员';
    const assistant = await Admin.findOne({ _id: data.medicalAssistantId, role: 'medicalAssistant', staffStatus: 'active' }).select('_id').lean();
    if (!assistant) return '请选择当前有效的就医专员';
  }
  if (stage === 'execute' && !nonempty(data.executionResult)) return '请填写代诊执行结果';
  if (stage === 'collect' || stage === 'audit' || stage === 'advisor' || stage === 'intake') {
    const patient = await User.findById(task.patientId).select('assignedFamilyDoctor assignedHealthPlanner assignedHealthManager').lean();
    if (stage === 'collect' && !patient?.assignedHealthManager) return '客户尚未分配健管专员，无法流转';
    if ((stage === 'audit' || stage === 'intake') && !patient?.assignedFamilyDoctor) return '客户尚未分配健康顾问，无法流转';
    if (stage === 'advisor' && !patient?.assignedHealthPlanner) return '客户尚未分配健康规划师，无法流转';
  }
  return '';
}

async function advanceMedicalProxyWorkflow(task) {
  const stage = stageOf(task);
  if (!stage || task.status !== 'completed') return;
  const index = STAGES.indexOf(stage);
  const order = await Order.findById(task.sourceOrderId);
  if (!order) return;
  const patient = await User.findById(task.patientId).select('assignedHealthManager assignedFamilyDoctor assignedHealthPlanner').lean();
  if (stage === 'advisor') {
    order.medicalProxyPlan = { ...task.formData, confirmedBy: task.assignedTo, confirmedAt: new Date(), intakeTaskId: task.dependsOnTaskId };
    order.markModified('medicalProxyPlan');
    await order.save();
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
    await FollowUp.updateOne(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise`, status: { $in: ['planned', 'in_progress'] } },
      { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', content: '就医专员已完成代诊，健康规划师全程督办闭环。', 'formData.currentStage': 'completed' } },
    );
    return;
  }
  const next = STAGES[index + 1];
  const assignee = next === 'audit' ? patient?.assignedHealthManager
    : next === 'advisor' ? patient?.assignedFamilyDoctor
    : next === 'planner' ? patient?.assignedHealthPlanner
      : task.formData?.medicalAssistantId;
  if (!assignee) throw Object.assign(new Error(`客户尚未分配${next === 'audit' ? '健管专员' : next === 'advisor' ? '健康顾问' : next === 'planner' ? '健康规划师' : '就医专员'}，无法流转`), { status: 409 });
  const labels = { audit: '健管专员审核本次资料', advisor: '健康顾问确认代诊方案', planner: '审核方案并指派就医专员', execute: '就医专员执行代诊' };
  const nextTask = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${next}` },
    { $setOnInsert: {
      patientId: task.patientId, staffId: task.staffId, assignedTo: assignee, type: 'other', status: 'planned',
      date: new Date(), remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}${next}`, taskRole: 'executor', dependsOnTaskId: task._id,
      theme: `医疗代诊：${labels[next]} · ${order.serviceName}`,
      plannedContent: next === 'audit' ? '审核健康规划师选定的本次资料；客户需补传时退回资料收集环节。'
        : next === 'advisor'
        ? '查看本次已审核资料及客户诉求，确认医院、科室、专家、代诊目标和与医生交流的具体内容。年度会员由健康顾问选定制定方案所用资料。'
        : next === 'planner' ? '核对健康顾问确认的代诊方案，指派就医专员执行。'
          : '按健康顾问确认的方案完成代诊，记录医生反馈、医嘱和后续事项。',
      formData: next === 'audit' ? { collectionSnapshot: task.formData }
        : next === 'advisor' ? { auditSnapshot: task.formData, selectedReportIds: task.formData?.collectionSnapshot?.annualMember ? [] : task.formData?.collectionSnapshot?.reportIds || [] }
          : { planSnapshot: order.medicalProxyPlan },
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (nextTask.isBlocked) {
    const nextFormData = next === 'audit' ? { ...nextTask.formData, collectionSnapshot: task.formData }
      : next === 'advisor' ? { ...nextTask.formData, auditSnapshot: task.formData, selectedReportIds: task.formData?.collectionSnapshot?.annualMember ? [] : task.formData?.collectionSnapshot?.reportIds || [] }
        : { ...nextTask.formData, planSnapshot: order.medicalProxyPlan };
    await FollowUp.updateOne({ _id: nextTask._id }, { $set: { status: 'planned', isBlocked: false, assignedTo: assignee, formData: nextFormData, remindAt: new Date() } });
  }
  await FollowUp.updateOne(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}supervise`, status: { $in: ['planned', 'in_progress'] } },
    { $set: { 'formData.currentStage': next, content: `当前环节：${labels[next]}` } },
  );
}

module.exports = { isMedicalProxyOrder, stageOf, preparationDueDate, reportIdsFromTask, findRecentSelectedReportIds, startMedicalProxyWorkflow, validateMedicalProxyStage, advanceMedicalProxyWorkflow };
