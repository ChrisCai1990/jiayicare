// 为现有年度管理规则选用已审核的【日常跟进】模板。默认只读；显式 --apply 才更新。
require('dotenv').config();
const mongoose = require('mongoose');
const PlanTemplate = require('../models/PlanTemplate');
const FollowUpPlan = require('../models/FollowUpPlan');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 未配置');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const candidates = await FollowUpPlan.find({ name: '【日常跟进】', status: 'active', reviewStatus: { $ne: 'pending_review' } })
      .select('_id name').lean();
    if (candidates.length !== 1) throw new Error(`启用且已审核的【日常跟进】模板应恰好为1项，当前为${candidates.length}项`);
    const daily = candidates[0];
    const templates = await PlanTemplate.find({ type: 'health_management', status: 'active' })
      .select('_id name updatedAt content.personalizedFollowUpPlans').lean();
    if (!templates.length) throw new Error('没有启用的年度管理规则');
    const pending = templates.filter(row => !(row.content?.personalizedFollowUpPlans || [])
      .some(item => String(item?.id || '') === String(daily._id)));
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', dailyPlanId: String(daily._id),
      activeTemplates: templates.length, toUpdate: pending.map(row => ({ id: String(row._id), name: row.name })) }));
    if (!process.argv.includes('--apply')) return;
    for (const row of pending) {
      const existing = Array.isArray(row.content?.personalizedFollowUpPlans) ? row.content.personalizedFollowUpPlans : [];
      const result = await PlanTemplate.updateOne({ _id: row._id, updatedAt: row.updatedAt, status: 'active' },
        { $set: { 'content.personalizedFollowUpPlans': [...existing, { id: String(daily._id), name: daily.name }] } });
      if (result.modifiedCount !== 1) throw new Error(`模板 ${row._id} 已变化，停止配置，请重新只读检查`);
    }
    console.log(JSON.stringify({ configured: pending.length, unchanged: templates.length - pending.length }));
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
