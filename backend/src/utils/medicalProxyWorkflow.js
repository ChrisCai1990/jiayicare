const Admin = require('../models/Admin');
const FollowUp = require('../models/FollowUp');
const MedicalReport = require('../models/MedicalReport');
const Order = require('../models/Order');
const User = require('../models/User');

const PREFIX = 'medical_proxy:';
const STAGES = ['intake', 'advisor', 'planner', 'execute'];
const isMedicalProxyOrder = name => /医疗代诊/.test(String(name || ''));
const stageOf = task => task?.sourceType === 'order' && String(task.workflowKey || '').startsWith(PREFIX)
  ? String(task.workflowKey).slice(PREFIX.length) : '';
const nonempty = value => String(value || '').trim();

async function startMedicalProxyWorkflow(order, plannerId, serviceTime, customerNeed) {
  const existing = await FollowUp.exists({ sourceType: 'order', sourceOrderId: order._id, workflowKey: { $regex: '^medical_proxy:' } });
  if (existing) throw Object.assign(new Error('该订单已进入医疗代诊分阶段流程，请在服务任务中继续办理'), { status: 409 });
  const patient = await User.findById(order.user).select('assignedHealthManager').lean();
  const manager = patient?.assignedHealthManager;
  if (!manager) throw Object.assign(new Error('该客户尚未分配健管专员，请先完成分配'), { status: 409 });
  const date = serviceTime ? new Date(serviceTime) : new Date();
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('服务日期无效'), { status: 400 });
  const task = await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}intake` },
    { $setOnInsert: {
      patientId: order.user, staffId: plannerId, assignedTo: manager, type: 'other', status: 'planned',
      date, remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}intake`, taskRole: 'executor',
      theme: `医疗代诊：资料收集与审核 · ${order.serviceName}`,
      plannedContent: `客户诉求：${customerNeed}\n请收集病历、既往报告、当前用药、身份及医保资料和代诊问题清单；将资料上传报告管理并完成审核后，在本任务中关联已审核资料。`,
      formData: { customerNeed, reportIds: [] },
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await FollowUp.updateMany(
    { sourceType: 'order', sourceOrderId: order._id, _id: { $ne: task._id }, workflowKey: { $in: ['', null] }, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'cancelled', cancelReason: '医疗代诊已进入分阶段服务流程' } },
  );
  return task;
}

async function validateMedicalProxyStage(task, body, staff) {
  const stage = stageOf(task);
  if (!stage || body.status !== 'completed') return '';
  if (staff.role !== 'superadmin' && String(task.assignedTo || '') !== String(staff._id)) return '仅当前阶段负责人可完成此任务';
  const data = body.formData || {};
  if (stage === 'intake') {
    const ids = [...new Set((data.reportIds || []).map(String).filter(Boolean))];
    if (!nonempty(data.customerNeed) || !nonempty(data.materialSummary) || !ids.length) return '请填写客户诉求、资料核对结果，并关联至少一份已审核资料';
    const count = await MedicalReport.countDocuments({ _id: { $in: ids }, user: task.patientId, audit_status: 'audited' });
    if (count !== ids.length) return '所选资料必须属于该客户且已审核通过';
  }
  if (stage === 'advisor' && ['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].some(key => !nonempty(data[key]))) {
    return '请确认代诊医院、科室、专家、代诊目标和与医生交流内容';
  }
  if (stage === 'advisor') {
    const ids = [...new Set((data.intakeSnapshot?.reportIds || []).map(String).filter(Boolean))];
    const count = ids.length ? await MedicalReport.countDocuments({ _id: { $in: ids }, user: task.patientId, audit_status: 'audited' }) : 0;
    if (!ids.length || count !== ids.length) return '健管专员关联的资料已失效或尚未审核，请退回上一环节补齐';
  }
  if (stage === 'planner') {
    if (!nonempty(data.medicalAssistantId)) return '请指派就医专员';
    const assistant = await Admin.findOne({ _id: data.medicalAssistantId, role: 'medicalAssistant', staffStatus: 'active' }).select('_id').lean();
    if (!assistant) return '请选择当前有效的就医专员';
  }
  if (stage === 'execute' && !nonempty(data.executionResult)) return '请填写代诊执行结果';
  if (stage === 'intake' || stage === 'advisor') {
    const patient = await User.findById(task.patientId).select('assignedFamilyDoctor assignedHealthPlanner').lean();
    if (stage === 'intake' && !patient?.assignedFamilyDoctor) return '客户尚未分配健康顾问，无法流转';
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
  const patient = await User.findById(task.patientId).select('assignedFamilyDoctor assignedHealthPlanner').lean();
  if (stage === 'advisor') {
    order.medicalProxyPlan = { ...task.formData, confirmedBy: task.assignedTo, confirmedAt: new Date(), intakeTaskId: task.dependsOnTaskId };
    order.markModified('medicalProxyPlan');
    await order.save();
  }
  if (index === STAGES.length - 1) return;
  const next = STAGES[index + 1];
  const assignee = next === 'advisor' ? patient?.assignedFamilyDoctor
    : next === 'planner' ? patient?.assignedHealthPlanner
      : task.formData?.medicalAssistantId;
  if (!assignee) throw Object.assign(new Error(`客户尚未分配${next === 'advisor' ? '健康顾问' : next === 'planner' ? '健康规划师' : '就医专员'}，无法流转`), { status: 409 });
  const labels = { advisor: '健康顾问确认代诊方案', planner: '审核方案并指派就医专员', execute: '就医专员执行代诊' };
  await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: `${PREFIX}${next}` },
    { $setOnInsert: {
      patientId: task.patientId, staffId: task.staffId, assignedTo: assignee, type: 'other', status: 'planned',
      date: new Date(), remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id,
      workflowKey: `${PREFIX}${next}`, taskRole: 'executor', dependsOnTaskId: task._id,
      theme: `医疗代诊：${labels[next]} · ${order.serviceName}`,
      plannedContent: next === 'advisor'
        ? '核对健管专员已审核的资料及客户诉求，确认医院、科室、专家、代诊目标和与医生交流的具体内容。'
        : next === 'planner' ? '核对健康顾问确认的代诊方案，指派就医专员执行。'
          : '按健康顾问确认的方案完成代诊，记录医生反馈、医嘱和后续事项。',
      formData: next === 'advisor' ? { intakeSnapshot: task.formData } : next === 'planner' ? { planSnapshot: order.medicalProxyPlan } : { planSnapshot: order.medicalProxyPlan },
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

module.exports = { isMedicalProxyOrder, stageOf, startMedicalProxyWorkflow, validateMedicalProxyStage, advanceMedicalProxyWorkflow };
