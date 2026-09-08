/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const PRODUCT_NAME = '体检一站式服务';
const PLAN_NAME = '体检方案定制与审核';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const plans = db.collection('followupplans');
  const products = db.collection('products');
  const product = await products.findOne({ name: PRODUCT_NAME });
  if (!product) throw new Error(`${PRODUCT_NAME}不存在`);

  const existingPlan = await plans.findOne({ name: { $in: [PLAN_NAME, `【审核稿】${PLAN_NAME}`] } });
  const backupKey = `checkup-plan-design-v5-${new Date().toISOString()}`;
  await db.collection('maintenance_backups').insertOne({
    backupKey,
    reason: 'Before adding health-consultant checkup plan design to the standard workflow',
    createdAt: new Date(),
    product,
    followUpPlan: existingPlan,
  });

  const designPlan = await plans.findOneAndUpdate(
    { name: { $in: [PLAN_NAME, `【审核稿】${PLAN_NAME}`] } },
    { $set: {
      name: PLAN_NAME,
      category: 'checkup',
      defaultRole: 'familyDoctor',
      executorRole: 'familyDoctor',
      supervisorRole: '',
      remindDaysBefore: 1,
      executorDueOffsetDays: -5,
      supervisorDueOffsetDays: 1,
      requiresCoordination: false,
      fixedToServiceDate: false,
      completionStandard: '健康顾问已结合客户需求、既往资料、慢病与用药情况完成个性化体检项目设计，明确重点项目、必要的专项检查及注意事项，并形成可供预约执行的确认方案。',
      default_content: {
        fields: ['客户体检目标', '基础体检项目', '重点关注项目', '专项检查建议', '既往异常复查项目', '慢病与用药注意事项', '方案确认结论'],
        boundary: '健康顾问负责确定体检方案；健康规划师依据已确认方案预约，不替代专业判断。',
      },
      cycles: [{ cycleType: 'duration', cycleDuration: 1, cycleUnit: 'day', notes: '由本次体检服务日期和任务规则计算实际时间' }],
      reviewStatus: 'approved',
      status: 'active',
      reviewedAt: new Date(),
      reviewedBy: null,
      updatedAt: new Date(),
    }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );

  const modules = [...(product.serviceWorkflow?.modules || [])]
    .filter(item => String(item.planId) !== String(designPlan._id));
  const linkedIds = modules.map(item => item.planId);
  const linkedPlans = await plans.find({ _id: { $in: linkedIds } }, { projection: { name: 1 } }).toArray();
  const nameById = new Map(linkedPlans.map(item => [String(item._id), item.name]));
  const intakeIndex = modules.findIndex(item => nameById.get(String(item.planId)) === '体检需求与资料确认');
  const insertAt = intakeIndex >= 0 ? intakeIndex + 1 : 0;
  modules.splice(insertAt, 0, { planId: designPlan._id, mode: 'fixed', trigger: '', sequence: insertAt });
  modules.forEach((item, sequence) => { item.sequence = sequence; });

  await products.updateOne({ _id: product._id }, { $set: {
    'serviceWorkflow.key': 'checkup',
    'serviceWorkflow.modules': modules,
    'serviceWorkflow.followUpPlanIds': modules.map(item => item.planId),
    'serviceWorkflow.followUpPlanId': modules[0]?.planId || null,
    'serviceWorkflow.notes': '健管专员核对资料后，由健康顾问定制并审核体检方案；健康规划师依据确认方案预约，现场由指定陪同人员执行。',
    updatedAt: new Date(),
  } });

  console.log(JSON.stringify({ backupKey, product: PRODUCT_NAME, plan: PLAN_NAME, sequence: insertAt, moduleCount: modules.length }, null, 2));
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());

