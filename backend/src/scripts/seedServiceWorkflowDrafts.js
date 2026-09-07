/* eslint-disable no-console */
// Idempotent production-safe seed. Dry-run by default; pass --apply to write.
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const DRAFT = '【审核稿】';

const followUpDrafts = [
  {
    name: `${DRAFT}定期复诊管理`, category: 'recheck', cycles: [{ cycleType: 'duration', cycleDuration: 1, cycleUnit: 'month', notes: '默认1个月；建档时必须按医生医嘱或客户实际复诊周期调整' }],
    defaultRole: 'healthPlanner', executorRole: 'healthPlanner', supervisorRole: 'healthManager', remindDaysBefore: 7, executorDueOffsetDays: -3, supervisorDueOffsetDays: 1, requiresCoordination: true,
    completionStandard: '完成复诊风险评估和人工审核；确认是否需要约诊、陪诊或代办；向客户送达安排；复诊后收集病历、检查、处方及医嘱，并登记下一次复诊时间。',
    default_content: { aiDraft: true, fields: ['复诊依据/医生医嘱', '上次就诊信息', '建议复诊时间', '医院/科室/医生', '近期症状变化', '检查检验准备', '当前用药及变化', '是否需要约诊', '是否需要陪诊', '是否需要代办', '客户时间及地点', '风险升级事项', '复诊后资料', '下一次复诊时间'], safetyGate: 'AI先生成草稿，健康顾问审核后才能安排；紧急症状不得等待常规复诊。' }, status: 'active',
  },
  {
    name: `${DRAFT}健康档案持续更新`, category: 'general', cycles: [{ cycleType: 'duration', cycleDuration: 1, cycleUnit: 'month', notes: '资料新增时即时更新；每月检查完整性' }],
    defaultRole: 'healthManager', executorRole: 'healthManager', supervisorRole: 'healthManager', remindDaysBefore: 3, executorDueOffsetDays: 0, supervisorDueOffsetDays: 2,
    completionStandard: '新增资料完成归档、来源核验、关键信息提取和人工复核；异常内容已提示；客户需要时可按授权范围输出。',
    default_content: { aiDraft: true, fields: ['新增资料清单', '资料来源与日期', '归档分类', '关键信息提取', '人工复核结果', '异常提示', '缺失资料', '客户授权与输出记录'] }, status: 'active',
  },
  {
    name: `${DRAFT}健康评估后复查`, category: 'recheck', cycles: [{ cycleType: 'duration', cycleDuration: 1, cycleUnit: 'month', notes: '以评估结论确定实际复查时间' }],
    defaultRole: 'healthManager', executorRole: 'healthManager', supervisorRole: 'healthManager', remindDaysBefore: 7, executorDueOffsetDays: -3, supervisorDueOffsetDays: 1,
    completionStandard: '评估资料完整、AI草稿完成人工审核、建议已向客户解释；到期完成复查提醒，结果回收并复盘。',
    default_content: { aiDraft: true, fields: ['评估目的', '现有资料', '风险与优先级', '建议行动', '建议复查时间', '客户确认', '复查结果', '方案调整'] }, status: 'active',
  },
  {
    name: `${DRAFT}心理支持阶段随访`, category: 'general', cycles: [{ cycleType: 'duration', cycleDuration: 1, cycleUnit: 'week', notes: '频率由心理专业人员审核调整' }],
    defaultRole: 'psychologist', executorRole: 'psychologist', supervisorRole: 'healthManager', remindDaysBefore: 1, executorDueOffsetDays: 0, supervisorDueOffsetDays: 1,
    completionStandard: '完成状态回访、风险筛查、计划执行核对与阶段反馈；发现自伤他伤等高风险立即升级，不按普通随访闭环。',
    default_content: { aiDraft: true, fields: ['近期状态', '计划执行情况', '睡眠与情绪变化', '风险筛查', '专业反馈', '下一步安排'] }, status: 'active',
  },
  {
    name: `${DRAFT}口腔定期复诊`, category: 'recheck', cycles: [{ cycleType: 'duration', cycleDuration: 6, cycleUnit: 'month', notes: '默认半年；按牙医建议调整' }],
    defaultRole: 'healthPlanner', executorRole: 'healthPlanner', supervisorRole: 'healthManager', remindDaysBefore: 7, executorDueOffsetDays: -3, supervisorDueOffsetDays: 1, requiresCoordination: true,
    completionStandard: '确认复诊需求并完成预约或提醒；复诊结果和后续医嘱已归档；下一周期已登记。',
    default_content: { aiDraft: true, fields: ['上次口腔服务', '牙医建议周期', '近期症状', '预约需求', '复诊结果', '下一次复诊时间'] }, status: 'active',
  },
];

const templateDrafts = planIds => [
  { type: 'health_record', name: `${DRAFT}健康档案管理方案`, status: 'active', content: { applicableScenario: '客户需要集中管理跨医院、跨时间的健康资料。', standardSteps: '收集并确认资料来源\n按类型和时间归档\nAI提取关键信息草稿\n健康顾问人工核验\n提示异常及资料缺口\n持续更新并按授权输出', requiredMaterials: '检查报告、病历、处方、出院记录及客户授权信息。', completionStandard: '资料可追溯、关键信息经人工核验、缺失及异常已提示、更新记录完整。', updateFrequency: '资料新增时及时更新；每月检查完整性。', riskNotes: 'AI仅生成提取草稿，不替代专业判断；紧急风险立即升级。', followUpPlans: [{ id: planIds.archive, name: `${DRAFT}健康档案持续更新` }] } },
  { type: 'health_assessment', name: `${DRAFT}健康评估与复查方案`, status: 'active', content: { applicableScenario: '轻量健康计划、健康咨询、风险评估及体验型服务。', standardSteps: '确认目标和资料\n完成基础评估\nAI生成风险与建议草稿\n健康顾问审核解释\n形成客户行动项\n按审核结论设置复查\n回收结果并调整', requiredMaterials: '健康问卷、既往资料、近期测量或检查结果。', completionStandard: '评估结论经人工审核并向客户解释，行动项和复查时间明确，复查结果完成闭环。', reassessmentRule: '由健康顾问按风险等级、专业意见和客户实际情况确定。', riskNotes: '出现急性或高风险征象应转就医，不等待常规复查。', followUpPlans: [{ id: planIds.assessment, name: `${DRAFT}健康评估后复查` }] } },
  { type: 'medical_assist', name: `${DRAFT}定期复诊管理方案`, status: 'active', content: { serviceDomain: 'medical_assist', assistanceType: 'one_stop', serviceMode: 'hybrid', applicableScenario: '客户因慢病、治疗后观察、专科管理或医生医嘱需要定期看医生。', standardSteps: '读取上次医嘱并确认复诊周期\n提前7天生成AI信息与风险草稿\n健康顾问审核并联系客户\n判断仅提醒或需要约诊、陪诊、代办\n需要约诊时完成医院科室医生和时间协调\n执行并记录服务\n复诊后回收病历检查处方和医嘱\n登记下一次复诊时间', requiredMaterials: '上次病历和医嘱、近期检查、当前用药、症状变化、身份证/医保卡及客户可就诊时间。', completionStandard: '人工风险审核完成；服务需求已确认；相关安排已送达；复诊资料和下一周期均已归档。', requiresDoctorConfirm: true, requiresExecutor: true, requiresSupervisor: true, followUpPlanId: planIds.revisit, followUpPlanName: `${DRAFT}定期复诊管理`, followUpPlans: [{ id: planIds.revisit, name: `${DRAFT}定期复诊管理` }], optionalLogistics: '按客户需要提供交通、住宿等协调，不默认生成。', riskNotes: 'AI不得直接通过审核；急症风险立即建议急诊；不得擅自停药、换药或调整剂量。' } },
  { type: 'psychology', name: `${DRAFT}心理支持阶段管理方案`, status: 'active', content: { frequency: '由心理专业人员确定', sessionCount: '按评估结果确定', duration: '按服务产品约定', mode: '线上/线下按需', homework: '由心理专业人员审核后布置', assessmentTools: '使用经确认的筛查或评估工具', followUpPlans: [{ id: planIds.psychology, name: `${DRAFT}心理支持阶段随访` }], riskNotes: '自伤、他伤或严重精神症状立即升级。' } },
  { type: 'medical_assist', name: `${DRAFT}口腔定期复诊方案`, status: 'active', content: { serviceDomain: 'professional_consultation', assistanceType: 'consultation', serviceMode: 'hybrid', applicableScenario: '口腔会员、治疗后复诊或牙医建议定期检查。', standardSteps: '读取上次口腔记录\n提前提醒并确认症状\n按需预约\n完成复诊\n归档结果和下一周期', requiredMaterials: '既往口腔记录、影像、治疗医嘱及近期症状。', completionStandard: '预约或提醒已完成，复诊结果及下一周期已归档。', requiresDoctorConfirm: true, requiresExecutor: true, requiresSupervisor: true, followUpPlanId: planIds.oral, followUpPlanName: `${DRAFT}口腔定期复诊`, followUpPlans: [{ id: planIds.oral, name: `${DRAFT}口腔定期复诊` }] } },
];

function includesAny(name, words) { return words.some(word => name.includes(word)); }

function classify(product, planIds, known) {
  const name = String(product.name || '');
  const category = String(product.category || '');
  const current = product.serviceWorkflow || {};
  let key = current.key || 'generic_followup';
  let plans = [];
  let reason = '';

  if (name === '健康档案管家') { key = 'health_record_management'; plans = [planIds.archive]; reason = '持续归档、人工核验和授权输出'; }
  else if (includesAny(name, ['轻享健康计划', '健康咨询服务', '健康风险评估', '轻咨询计划', '企业家健康决策计划'])) { key = 'health_assessment'; plans = [planIds.assessment, known.healthConsult].filter(Boolean); reason = '评估后形成行动项并按风险设置复查'; }
  else if (includesAny(name, ['心理健康陪伴', '心理咨询'])) { key = 'psychology'; plans = [planIds.psychology]; reason = '心理专业服务按阶段随访并设置风险升级'; }
  else if (name.includes('口腔365')) { key = 'annual_management'; plans = [planIds.oral]; reason = '按牙医建议周期开展口腔复诊'; }
  else if (name === '营养改变生活') { key = 'nutrition_intervention'; plans = [known.nutrition, known.supplement].filter(Boolean); reason = '自研营养代餐属于干预服务，补充履约仅为其中分支'; }
  else if (includesAny(name, ['叶酸', '益生菌', '纾炏宁', '维生素D'])) { key = 'supplement_supply'; plans = [known.supplement].filter(Boolean); reason = '营养素补充需提前3天启动并由营养师审核'; }
  else if (includesAny(name, ['动态心电', '动态血压', '动态血糖'])) { key = 'checkup'; plans = [name.includes('心电') ? known.ecg : name.includes('血压') ? known.bp : known.glucose, known.report].filter(Boolean); reason = '监测执行、结果解读与异常跟进'; }
  else if (key === 'checkup') { plans = [known.checkupBooking, known.report, known.recheck].filter(Boolean); reason = '检查准备、结果解读与异常复查'; }
  else if (key === 'medical_assist') { plans = [name.includes('陪') ? known.escort : name.includes('代诊') ? known.proxy : name.includes('代办') ? known.agency : known.revisit, planIds.revisit].filter(Boolean); reason = '先评估实际需求，再按需约诊、陪诊或代办并闭环'; }
  else if (key === 'annual_management') { plans = [known.daily, known.annualCheckup, known.recheck].filter(Boolean); reason = '年度目标、周期服务、阶段复盘和年度总结'; }
  else if (key === 'nutrition_intervention') { plans = [known.nutrition, known.recheck].filter(Boolean); reason = '营养评估、执行跟踪、指标复评和方案调整'; }
  else if (key === 'psychology') { plans = [planIds.psychology]; reason = '阶段跟踪与风险升级'; }
  else if (key === 'supplement_supply') { plans = [known.supplement].filter(Boolean); reason = '提前3天启动、营养师审核和购买配送闭环'; }
  else if (key === 'medication_supply') { plans = [known.medication].filter(Boolean); reason = '提前3天启动、健康顾问审核和配药闭环'; }
  else { plans = current.followUpPlanIds || (current.followUpPlanId ? [current.followUpPlanId] : []); reason = '沿用现有主流程，待结合实际服务审核细化'; }

  plans = [...new Set(plans.filter(Boolean).map(String))];
  return { key, followUpPlanId: plans[0] || null, followUpPlanIds: plans, notes: `${DRAFT}${reason}；按客户实际情况生成任务，AI先出草稿、人工审核。` };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const followups = db.collection('followupplans');
  const templates = db.collection('plantemplates');
  const products = db.collection('products');

  const existingPlans = await followups.find({}, { projection: { name: 1 } }).toArray();
  const findId = words => existingPlans.find(p => words.every(word => p.name.includes(word)))?._id;
  const known = {
    agency: findId(['代办服务']), proxy: findId(['代诊服务']), escort: findId(['陪诊服务']), healthConsult: findId(['健康咨询']),
    report: findId(['体检报告解读']), checkupBooking: findId(['体检预约协调']), recheck: findId(['定期复查']), annualCheckup: findId(['年度体检']), daily: findId(['日常跟进']),
    nutrition: findId(['强化营养干预']), medication: findId(['药品定期配取']), supplement: findId(['营养素定期补充']),
    ecg: findId(['动态心电']), bp: findId(['动态血压']), glucose: findId(['动态血糖']), revisit: findId(['就医提醒']),
  };

  if (!APPLY) {
    const count = await products.countDocuments({});
    console.log(JSON.stringify({ mode: 'dry-run', products: count, newFollowUpPlans: followUpDrafts.map(v => v.name), newTemplates: templateDrafts({ revisit: 'pending', archive: 'pending', assessment: 'pending', psychology: 'pending', oral: 'pending' }).map(v => v.name) }, null, 2));
    return;
  }

  const backupKey = `service-workflow-drafts-${new Date().toISOString()}`;
  const productSnapshot = await products.find({}, { projection: { name: 1, serviceWorkflow: 1 } }).toArray();
  await db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Before unified service workflow draft seeding', createdAt: new Date(), products: productSnapshot });

  const planIds = {};
  const keys = ['revisit', 'archive', 'assessment', 'psychology', 'oral'];
  for (let i = 0; i < followUpDrafts.length; i += 1) {
    const draft = followUpDrafts[i];
    const result = await followups.findOneAndUpdate({ name: draft.name }, { $set: { ...draft, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: 'after' });
    planIds[keys[i]] = result._id;
  }

  for (const draft of templateDrafts(planIds)) {
    await templates.updateOne({ name: draft.name, type: draft.type }, { $set: { ...draft, clientBrand: 'jiayiguanjia', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  }

  const allProducts = await products.find({}).toArray();
  const counts = {};
  for (const product of allProducts) {
    const serviceWorkflow = classify(product, planIds, known);
    await products.updateOne({ _id: product._id }, { $set: { serviceWorkflow, updatedAt: new Date() } });
    counts[serviceWorkflow.key] = (counts[serviceWorkflow.key] || 0) + 1;
  }
  console.log(JSON.stringify({ mode: 'applied', backupKey, productsUpdated: allProducts.length, flowCounts: counts, planIds }, null, 2));
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());
