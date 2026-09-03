/**
 * 为存量年度健康管理规则绑定五类基础动作模板。
 * 默认仅预览；确认后使用：node scripts/migrate-health-management-standard-actions.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PlanTemplate = require('../src/models/PlanTemplate');
const FollowUpPlan = require('../src/models/FollowUpPlan');

const EXPECTED_NAMES = {
  medical_treatment: '需要安排就医',
  checkup_completion: '需要完善体检',
  abnormal_followup: '需要定期复查',
  vaccine: '疫苗接种',
  annual_checkup: '年度体检',
};

const normalizeName = value => String(value || '').replace(/[【】\s]/g, '');

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);

  const plans = await FollowUpPlan.find({ status: 'active' }).select('name').lean();
  const standardActionPlans = {};
  const missing = [];
  for (const [key, expectedName] of Object.entries(EXPECTED_NAMES)) {
    const plan = plans.find(item => normalizeName(item.name) === expectedName);
    if (plan) standardActionPlans[key] = { id: String(plan._id), name: plan.name };
    else missing.push(expectedName);
  }

  const templates = await PlanTemplate.find({ type: 'health_management', status: 'active' }).select('name content').lean();
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    matchedActions: standardActionPlans,
    missing,
    templates: templates.map(item => item.name),
  }, null, 2));

  if (apply) {
    if (missing.length) throw new Error(`缺少基础随访模板：${missing.join('、')}`);
    for (const template of templates) {
      await PlanTemplate.collection.updateOne(
        { _id: template._id },
        { $set: { 'content.standardActionPlans': standardActionPlans } },
      );
    }
    console.log(`迁移完成：已更新 ${templates.length} 个年度健康管理规则`);
  }
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
