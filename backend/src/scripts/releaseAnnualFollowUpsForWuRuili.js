// One-time activation for the named customer. Read-only by default; pass --apply on the server.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const AnnualPlan = require('../models/AnnualPlan');

async function run() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const matches = await User.find({ name: '吴瑞砾', isDeleted: { $ne: true } }).select('_id name').limit(2).lean();
    if (matches.length !== 1) throw new Error(`客户姓名精确匹配到 ${matches.length} 条，停止操作`);
    const plans = await AnnualPlan.find({ patientId: matches[0]._id, pushedAt: { $ne: null }, reviewStatus: 'approved', confirmedAt: null })
      .select('_id year pushedAt followUpReleasedAt').sort({ pushedAt: -1 }).limit(2).lean();
    if (plans.length !== 1) throw new Error(`未确认且已发布的年度方案匹配到 ${plans.length} 条，停止操作`);
    const plan = plans[0];
    console.log(JSON.stringify({ customerId: String(matches[0]._id), planId: String(plan._id), year: plan.year, alreadyReleased: !!plan.followUpReleasedAt, apply }));
    if (!apply) return;
    await AnnualPlan.updateOne({ _id: plan._id, followUpReleasedAt: null, confirmedAt: null }, { $set: { followUpReleasedAt: plan.pushedAt } });
    const current = await AnnualPlan.findById(plan._id);
    if (!require('../utils/annualFollowUpEarlyRelease').released(current)) throw new Error('方案状态已变化，未生成随访');
    const count = await require('../utils/annualPlanFollowUps').syncAnnualPlanFollowUps(current);
    console.log(JSON.stringify({ released: true, created: count, customerConfirmed: !!current.confirmedAt }));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
