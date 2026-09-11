/* eslint-disable no-console */
// Admin-reviewable first draft for the checkup one-stop product.
// Dry-run by default. Pass --apply to upsert pending-review task plans and link them to the product.
require('dotenv').config();
const mongoose = require('mongoose');

const PRODUCT_NAME = '体检一站式服务';
const DRAFT = '【审核稿】';

const TASK_PLAN_DRAFTS = [
  {
    key: 'intake',
    workflowStageKey: 'intake',
    name: `${DRAFT}体检需求与资料确认`,
    mode: 'fixed',
    trigger: '',
    category: 'checkup',
    executorRole: 'healthManager',
    remindDaysBefore: 1,
    executorDueOffsetDays: -7,
    completionStandard: '客户体检目的、既往报告、慢病与用药情况、重点关注项目和可安排时间均已核对；缺失资料及需健康顾问确认的问题已标记。',
    default_content: {
      fields: ['体检目的', '既往体检报告', '慢病与用药情况', '重点关注项目', '客户可安排时间', '缺失资料', '需专业确认事项'],
      boundary: '仅做信息收集与完整性核验，不替代健康顾问确定体检项目。',
    },
  },
  {
    key: 'plan_design',
    workflowStageKey: 'plan_design',
    name: `${DRAFT}体检方案定制与审核`,
    mode: 'fixed',
    trigger: '',
    category: 'checkup',
    executorRole: 'familyDoctor',
    remindDaysBefore: 1,
    executorDueOffsetDays: -5,
    completionStandard: '健康顾问已结合客户需求、既往资料、慢病与用药情况完成个性化体检项目设计，明确重点项目、必要的专项检查及注意事项，并形成可供预约执行的确认方案。',
    default_content: {
      fields: ['客户体检目标', '基础体检项目', '重点关注项目', '专项检查建议', '既往异常复查项目', '慢病与用药注意事项', '方案确认结论'],
      boundary: '健康顾问负责确定体检方案；健康规划师依据已确认方案预约，不替代专业判断。',
    },
  },
  {
    key: 'booking',
    workflowStageKey: 'booking',
    name: `${DRAFT}体检预约与行前确认`,
    mode: 'fixed',
    trigger: '',
    category: 'checkup',
    executorRole: 'healthPlanner',
    remindDaysBefore: 2,
    executorDueOffsetDays: -3,
    completionStandard: '体检机构、套餐或项目、日期、签到时间、承接科室及准备要求已确认；预约凭证和注意事项已发送客户。',
    default_content: {
      fields: ['体检机构', '套餐或检查项目', '体检日期', '集合或签到时间', '承接部门或科室', '预约凭证', '检查前准备', '客户确认结果', '陪同需求及交接事项'],
      boundary: '特殊检查、停药或用药调整必须依据医生或检查机构的明确要求。',
    },
  },
  {
    key: 'onsite',
    workflowStageKey: 'onsite',
    name: `${DRAFT}陪同体检与现场记录`,
    mode: 'fixed',
    trigger: '',
    category: 'checkup',
    executorRole: 'medicalAssistant',
    remindDaysBefore: 1,
    executorDueOffsetDays: 0,
    fixedToServiceDate: true,
    completionStandard: '陪同人员已按约定完成会合、签到和现场流程协助；已记录完成、遗漏、中止及需补检项目，并明确报告获取方式。',
    default_content: {
      fields: ['实际陪同人员', '会合与签到情况', '已完成项目', '遗漏或中止项目', '需补检项目', '现场异常', '报告获取方式与预计时间'],
      boundary: 'Admin只规定陪同执行岗位；具体陪同人员在客户方案中单选。现场异常按体检机构医疗流程处理，陪同人员不作临床判断。',
    },
  },
  {
    key: 'report_collection',
    workflowStageKey: 'report_collection',
    name: `${DRAFT}体检报告回收与归档`,
    mode: 'fixed',
    trigger: '',
    category: 'checkup',
    executorRole: 'healthManager',
    remindDaysBefore: 1,
    executorDueOffsetDays: 7,
    completionStandard: '体检报告已完整回收并关联本次服务来源；缺页或缺项已追补，报告已进入AI解析和健管审核链路。',
    default_content: {
      fields: ['报告预计出具时间', '报告回收状态', '缺页或缺项', '追补记录', '报告来源关联', '进入解析状态'],
      boundary: '本任务只负责回收和归档；AI解析及健管审核继续使用现有报告专用流程，不重复生成岗位任务。',
    },
  },
  {
    key: 'result_review',
    workflowStageKey: 'result_review',
    name: `${DRAFT}体检结果评估与随访计划`,
    mode: 'fixed',
    trigger: '',
    category: 'recheck',
    executorRole: 'familyDoctor',
    activationEvent: 'report_audited',
    remindDaysBefore: 0,
    executorDueOffsetDays: 8,
    completionStandard: '健康顾问已查看健管审核通过的正式体检报告，完成结果评估；需要后续跟进时已形成明确的随访计划，不需要跟进时已记录无需随访的结论和依据。',
    default_content: {
      fields: ['正式报告审核状态', '主要结果评估', '异常与风险优先级', '随访目标', '随访事项与时间', '责任岗位', '无需随访结论及依据'],
      boundary: '必须基于已经解析并经健管专员审核的正式报告；不能用未审核AI结果替代专业评估。',
    },
  },
  {
    key: 'final_acceptance',
    workflowStageKey: 'final_acceptance',
    workflowTaskRole: 'supervisor',
    name: `${DRAFT}体检一站式总督办与最终验收`,
    mode: 'fixed',
    trigger: '',
    category: 'checkup',
    executorRole: 'healthPlanner',
    activationEvent: 'previous_completed',
    closesService: true,
    remindDaysBefore: 0,
    executorDueOffsetDays: 9,
    completionStandard: '健康规划师已确认需求、方案、预约、现场执行、报告回收、解析审核和健康顾问随访安排均已闭环；未完成事项已处理或明确转入后续服务。',
    default_content: {
      fields: ['全流程节点核对', '遗留事项', '后续服务交接', '客户沟通结果', '最终验收结论'],
      boundary: '该任务从服务启动起持续作为总督办显示；只有健康顾问完成结果评估与随访计划后才能最终验收。',
    },
  },
  {
    key: 'abnormal_followup',
    workflowStageKey: 'abnormal_followup',
    name: `${DRAFT}体检异常后续方案审核`,
    mode: 'conditional',
    trigger: 'abnormal_found',
    category: 'recheck',
    executorRole: 'familyDoctor',
    remindDaysBefore: 0,
    executorDueOffsetDays: 1,
    completionStandard: '健康顾问已结合审核后的体检结果确认异常事项的优先级、复查或就医建议、执行时间及是否需要预约协助；不需要跟进时已记录依据。',
    default_content: {
      aiDraft: true,
      fields: ['异常依据', '风险优先级', '建议复查或就医项目', '建议时间', '是否需要预约协助', '客户沟通结果', '无需跟进依据'],
      boundary: 'AI仅生成草稿；必须由健康顾问审核，紧急风险立即升级，不等待普通任务。',
    },
  },
].map((item, sequence) => ({
  ...item,
  sequence,
  defaultRole: item.executorRole,
  supervisorRole: '',
  supervisorDueOffsetDays: 1,
  requiresCoordination: false,
  workflowTaskRole: item.workflowTaskRole || 'executor',
  activationEvent: item.activationEvent || '',
  closesService: !!item.closesService,
  fixedToServiceDate: !!item.fixedToServiceDate,
  reviewStatus: 'pending_review',
  status: 'active',
  cycles: [{ cycleType: 'duration', cycleDuration: 1, cycleUnit: 'day', notes: '由本次体检服务日期和任务规则计算实际时间' }],
}));

function validateDrafts(drafts = TASK_PLAN_DRAFTS) {
  const errors = [];
  const names = new Set();
  drafts.forEach((draft, index) => {
    if (!draft.name || names.has(draft.name)) errors.push(`第${index + 1}项名称为空或重复`);
    names.add(draft.name);
    if (!draft.executorRole) errors.push(`${draft.name}缺少执行岗位`);
    if (draft.requiresCoordination && draft.executorRole === draft.supervisorRole) errors.push(`${draft.name}执行岗位与督办岗位相同`);
    if (draft.mode === 'conditional' && !draft.trigger) errors.push(`${draft.name}条件任务缺少触发条件`);
    if (draft.mode !== 'conditional' && draft.trigger) errors.push(`${draft.name}固定任务不应配置触发条件`);
  });
  return errors;
}

async function run({ apply = false, approve = false } = {}) {
  const errors = validateDrafts();
  if (errors.length) throw new Error(errors.join('；'));
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare';
  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    const plans = db.collection('followupplans');
    const products = db.collection('products');
    const product = await products.findOne({ name: PRODUCT_NAME });
    if (!product) throw new Error(`${PRODUCT_NAME}不存在`);

    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', product: PRODUCT_NAME, taskPlans: TASK_PLAN_DRAFTS }, null, 2));
      return;
    }

    const allDraftNames = TASK_PLAN_DRAFTS.flatMap(item => [item.name, item.name.replace(DRAFT, '')]);
    const existingPlans = await plans.find({ name: { $in: allDraftNames } }).toArray();
    const backupKey = `checkup-one-stop-workflow-draft-${new Date().toISOString()}`;
    await db.collection('maintenance_backups').insertOne({
      backupKey,
      reason: 'Before creating Admin-reviewable checkup one-stop workflow draft',
      createdAt: new Date(),
      product,
      followUpPlans: existingPlans,
    });

    const linked = [];
    for (const draft of TASK_PLAN_DRAFTS) {
      const { key, mode, trigger, sequence, ...planFields } = draft;
      const approvedName = draft.name.replace(DRAFT, '');
      const result = await plans.findOneAndUpdate(
        { name: { $in: [draft.name, approvedName] } },
        { $set: {
          ...planFields,
          name: approve ? approvedName : draft.name,
          reviewStatus: approve ? 'approved' : 'pending_review',
          reviewedAt: approve ? new Date() : null,
          reviewedBy: null,
          updatedAt: new Date(),
        }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, returnDocument: 'after' }
      );
      linked.push({ planId: result._id, mode, trigger, sequence });
    }

    await products.updateOne({ _id: product._id }, { $set: {
      'serviceWorkflow.key': 'checkup',
      'serviceWorkflow.modules': linked,
      'serviceWorkflow.followUpPlanIds': linked.map(item => item.planId),
      'serviceWorkflow.followUpPlanId': linked[0]?.planId || null,
      'serviceWorkflow.notes': '标准流程：健管专员先核对资料，健康顾问定制并审核体检方案，健康规划师再预约，具体陪同人员负责现场执行；不创建同岗位督办任务；AI解析和健管报告审核沿用报告专用链路。',
      updatedAt: new Date(),
    } });

    console.log(JSON.stringify({ mode: 'applied', reviewStatus: approve ? 'approved' : 'pending_review', backupKey, product: PRODUCT_NAME, plansUpserted: linked.length }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run({ apply: process.argv.includes('--apply') || process.argv.includes('--approve'), approve: process.argv.includes('--approve') }).catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { PRODUCT_NAME, TASK_PLAN_DRAFTS, validateDrafts, run };
