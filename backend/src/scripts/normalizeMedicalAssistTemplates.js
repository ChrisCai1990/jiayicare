/* eslint-disable no-console */
const mongoose = require('mongoose');
const PlanTemplate = require('../models/PlanTemplate');

const common = {
  requiresExecutor: true,
  requiresSupervisor: true,
  staffName: '',
  datetime: '',
  hotel: '',
  transport: '',
};

const TEMPLATE_NORMALIZATION = {
  '健康咨询服务': {
    serviceDomain: 'professional_consultation', assistanceType: 'consultation', requiresDoctorConfirm: true,
    applicableScenario: '客户已有明确健康问题、报告解读或专业咨询需求。',
    standardSteps: '确认咨询诉求与问题清单\n核对既往资料、报告和用药信息\n安排合适的专业人员与咨询时间\n完成咨询并整理专业意见\n向客户反馈结论及后续待办',
    requiredMaterials: '身份信息、既往检查报告、当前用药或营养素清单、拟咨询问题清单。',
    completionStandard: '咨询已完成，专业意见、客户反馈及后续待办已归档。',
    optionalLogistics: '', riskNotes: '不替代线下诊疗；出现急症或明显加重时应及时就医。',
  },
  '医疗代诊服务': {
    serviceDomain: 'medical_assist', assistanceType: 'proxy_visit', requiresDoctorConfirm: true,
    applicableScenario: '客户不便到场，且医疗机构允许依据完整资料代为咨询。',
    standardSteps: '确认代诊目的、医院、科室与专家\n核对病历、报告和问题清单\n确认是否需要客户远程连线\n完成代诊并准确记录医嘱\n向客户和家庭医生反馈并归档',
    requiredMaterials: '有效身份证明、病历及检查资料、当前用药清单、授权信息、问题清单。',
    completionStandard: '已取得可追溯的专业意见，完整反馈客户并写入服务档案。',
    optionalLogistics: '资料递送或取回（确有需要时）。', riskNotes: '须符合医院规定；涉及诊断、处方或治疗调整时由医生确认。',
  },
  '医务代办服务-代约检（常规）': {
    serviceDomain: 'medical_assist', assistanceType: 'agency', requiresDoctorConfirm: false,
    applicableScenario: '已有明确的常规检查医嘱，需要代为预约。',
    standardSteps: '核对检查医嘱、项目与机构\n确认可预约日期和客户时间\n核实检查前准备要求\n完成预约并发送预约凭证\n将时间和准备事项同步至随访任务',
    requiredMaterials: '检查医嘱或申请单、身份信息、医保信息（如需）、相关病历。',
    completionStandard: '预约成功，时间、地点、准备事项和凭证已反馈客户及执行人员。',
    optionalLogistics: '', riskNotes: '准备要求以开单医生和检查机构为准，不自动建议停药或调整用药。',
  },
  '医务代办服务-代约检（特殊检查）': {
    serviceDomain: 'medical_assist', assistanceType: 'agency', requiresDoctorConfirm: true,
    applicableScenario: '已有特殊检查医嘱，需要核实适应证、禁忌证或特殊准备后预约。',
    standardSteps: '核对检查医嘱与检查目的\n确认禁忌证、过敏史及特殊准备\n与开单医生或检查机构核实要求\n完成预约并发送预约凭证\n同步检查准备、风险提示及后续安排',
    requiredMaterials: '检查医嘱、相关病历和既往报告、过敏史、当前用药、身份及医保信息。',
    completionStandard: '特殊检查预约成功，准备要求经确认并已完整告知客户。',
    optionalLogistics: '陪同或接送（客户确有需要时）。', riskNotes: '涉及造影、麻醉、停药或用药调整必须由医生确认。',
  },
  '医务代办服务-代配药': {
    serviceDomain: 'medical_assist', assistanceType: 'medication', requiresDoctorConfirm: true,
    applicableScenario: '客户持有有效处方或已确认医嘱，需要协助配药和交付。',
    standardSteps: '核对有效处方、药名、规格与数量\n确认配药机构、费用及领取方式\n完成配药并核对药品和票据\n向客户交付并确认签收\n将结果及异常情况归档',
    requiredMaterials: '有效处方或医嘱、身份及医保信息、既往取药凭证（如需）。',
    completionStandard: '药品、数量、票据核对无误并完成交付，结果已归档。',
    optionalLogistics: '药品配送（符合法规且客户需要时）。', riskNotes: '不得自行更换药品、剂量或频次；处方无效或信息不一致时退回医生确认。',
  },
  '陪同就医服务': {
    serviceDomain: 'medical_assist', assistanceType: 'escort', requiresDoctorConfirm: false,
    applicableScenario: '客户需要现场陪同完成门诊就医流程。',
    standardSteps: '确认医院、科室、日期和会合安排\n核对就医资料及客户重点诉求\n陪同完成挂号、就诊、缴费和检查安排\n准确记录医嘱与后续事项\n反馈客户和家庭医生并归档',
    requiredMaterials: '身份证明、医保凭证、病历及检查报告、用药清单、问题清单。',
    completionStandard: '本次就医环节完成，医嘱、结果和后续待办已反馈并归档。',
    optionalLogistics: '交通、轮椅或其他现场协助（按客户需要确认）。', riskNotes: '不代替医生作临床判断；突发不适时立即按院方流程处理。',
  },
  '陪同检查服务': {
    serviceDomain: 'medical_assist', assistanceType: 'escort', requiresDoctorConfirm: false,
    applicableScenario: '客户已有检查预约，需要现场陪同和流程协助。',
    standardSteps: '确认检查项目、时间、地点和准备要求\n核对申请单及相关资料\n陪同签到、缴费并完成检查\n确认报告领取方式和时间\n反馈完成情况并归档',
    requiredMaterials: '检查申请单、身份及医保信息、相关病历与既往报告。',
    completionStandard: '检查已完成，报告获取方式及后续安排已明确并归档。',
    optionalLogistics: '交通、轮椅或其他现场协助（按客户需要确认）。', riskNotes: '检查准备以开单医生和检查机构要求为准。',
  },
  '陪同治疗服务': {
    serviceDomain: 'medical_assist', assistanceType: 'treatment', requiresDoctorConfirm: true,
    applicableScenario: '客户已有明确治疗医嘱，需要现场陪同和流程协助。',
    standardSteps: '核对治疗医嘱、疗程、日期和地点\n确认治疗前准备及风险告知\n陪同签到并协助完成治疗流程\n记录治疗完成情况和异常反馈\n明确下次治疗或复诊安排并归档',
    requiredMaterials: '治疗医嘱、身份及医保信息、病历、近期检查报告和用药清单。',
    completionStandard: '当次治疗完成，异常情况和后续计划已记录并反馈。',
    optionalLogistics: '交通或照护协助（按客户需要确认）。', riskNotes: '必须依据有效治疗医嘱执行；发生异常立即通知医护人员。',
  },
  '健康体检服务': {
    serviceDomain: 'annual_checkup', assistanceType: 'checkup', requiresDoctorConfirm: true,
    applicableScenario: '需要安排年度健康体检或按家庭医生建议完善基础检查。',
    standardSteps: '确认体检目的、套餐和重点加项\n确认机构、日期和检查前准备\n完成预约并发送体检须知\n跟进体检完成及报告回收\n将报告纳入体检子方案并安排解读',
    requiredMaterials: '身份信息、既往体检报告、慢病及用药信息、家庭医生建议。',
    completionStandard: '体检完成，报告已回收归档，异常项已进入后续评估或复查。',
    optionalLogistics: '陪同、交通或分日安排（按客户需要确认）。', riskNotes: '体检项目及特殊准备须由专业人员确认，不以通用提示替代个体医嘱。',
  },
  '陪同体检服务': {
    serviceDomain: 'annual_checkup', assistanceType: 'checkup', requiresDoctorConfirm: false,
    applicableScenario: '客户已有体检安排，需要现场陪同和流程协助。',
    standardSteps: '确认体检机构、日期、套餐及特殊项目\n核对准备要求和会合安排\n陪同签到并协助完成体检流程\n确认遗漏项目和报告领取方式\n反馈完成情况并归档',
    requiredMaterials: '身份证明、体检预约信息、既往报告及特殊检查资料。',
    completionStandard: '体检流程完成，遗漏项目及报告回收安排均已明确。',
    optionalLogistics: '交通、轮椅或分日安排（按客户需要确认）。', riskNotes: '空腹、留样等要求以体检机构通知为准。',
  },
  '体检一站式服务': {
    serviceDomain: 'annual_checkup', assistanceType: 'one_stop', requiresDoctorConfirm: true,
    applicableScenario: '需要从体检规划、预约执行到报告解读和后续就医的连续服务。',
    standardSteps: '家庭医生确认体检目标与重点项目\n完成体检套餐、机构及日期安排\n协调特殊检查和现场执行\n回收报告并完成家庭医生解读\n异常项转入复查、门诊或年度管理计划',
    requiredMaterials: '身份信息、既往体检报告、慢病及用药资料、家庭医生评估结论。',
    completionStandard: '体检、报告回收、专业解读及异常项后续安排形成闭环。',
    optionalLogistics: '陪同、交通、分日体检或住宿（确有需要时单独确认）。', riskNotes: '所有特殊准备与用药调整均须按医生或检查机构确认结果执行。',
  },
  '门诊一站式服务': {
    serviceDomain: 'medical_assist', assistanceType: 'one_stop', requiresDoctorConfirm: true,
    applicableScenario: '需要家庭医生评估、预约检查、门诊就医及结果归档的连续服务。',
    standardSteps: '家庭医生评估诉求并确定就医方向\n安排医院、科室、专家及必要检查\n完成预约和就诊前准备\n陪同或协助完成门诊就医\n归档医嘱并生成后续复查或随访任务',
    requiredMaterials: '身份及医保信息、病历、既往报告、用药清单和问题清单。',
    completionStandard: '门诊服务完成，医嘱、结果及后续任务已反馈并归档。',
    optionalLogistics: '陪同、交通或住宿（确有需要时单独确认）。', riskNotes: '涉及临床决策和用药调整由医生确认。',
  },
  '住院一站式服务': {
    serviceDomain: 'medical_assist', assistanceType: 'one_stop', requiresDoctorConfirm: true,
    applicableScenario: '已有明确住院评估或入院需求，需要入院前、住院及出院后的连续协调。',
    standardSteps: '家庭医生核对住院必要性及目标\n协调医院、科室、床位或入院通知\n协助完成入院前检查和资料准备\n跟进入院及住院期间关键事项\n归档出院小结并安排复诊、康复和随访',
    requiredMaterials: '身份证明、医保资料、住院证或医生意见、病历及检查报告、用药清单。',
    completionStandard: '住院协调完成，出院资料归档，复诊、康复及随访任务已建立。',
    optionalLogistics: '交通、陪护或住宿（确有需要时单独确认）。', riskNotes: '床位和入院时间以医院确认为准；紧急情况按急诊流程处理。',
  },
};

function normalizedContent(existing, normalized) {
  return {
    ...(existing || {}), ...common, ...normalized,
    tasks: normalized.standardSteps,
    notes: normalized.riskNotes,
  };
}

async function run({ apply = false } = {}) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare';
  await mongoose.connect(uri);
  try {
    const templates = await PlanTemplate.find({ type: 'medical_assist', name: { $in: Object.keys(TEMPLATE_NORMALIZATION) } });
    const found = new Set(templates.map(t => t.name));
    const missing = Object.keys(TEMPLATE_NORMALIZATION).filter(name => !found.has(name));
    for (const template of templates) {
      template.content = normalizedContent(template.content, TEMPLATE_NORMALIZATION[template.name]);
      if (apply) await template.save();
      console.log(`${apply ? 'UPDATED' : 'WOULD UPDATE'} ${template.name}`);
    }
    if (missing.length) console.warn(`MISSING ${missing.join('、')}`);
    console.log(JSON.stringify({ matched: templates.length, missing, applied: apply }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run({ apply: process.argv.includes('--apply') }).catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { TEMPLATE_NORMALIZATION, normalizedContent };
