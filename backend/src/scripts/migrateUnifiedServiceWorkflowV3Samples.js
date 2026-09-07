/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const plans = db.collection('followupplans');
  const products = db.collection('products');
  const abnormal = await plans.findOne({ name: '【审核稿】健康评估后复查' });
  const revisit = await plans.findOne({ name: '【审核稿】定期复诊管理' });
  if (!abnormal || !revisit) throw new Error('Required reviewed draft plans are missing');
  const rows = await products.find({ name: { $in: ['健康体检服务', '体检一站式服务', '门诊一站式服务'] } }).toArray();
  const backupKey = `unified-service-workflow-v3-samples-${new Date().toISOString()}`;
  await db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Before adding explicit conditional nodes to acceptance samples', createdAt: new Date(), products: rows });
  for (const product of rows) {
    const workflow = product.serviceWorkflow || {};
    const modules = [...(workflow.modules || [])];
    const target = /体检/.test(product.name)
      ? { planId: abnormal._id, mode: 'conditional', trigger: 'abnormal_found' }
      : { planId: revisit._id, mode: 'conditional', trigger: 'followup_instruction_found' };
    if (!modules.some(item => String(item.planId) === String(target.planId))) modules.push({ ...target, sequence: modules.length });
    modules.forEach((item, sequence) => { item.sequence = sequence; });
    await products.updateOne({ _id: product._id }, { $set: {
      'serviceWorkflow.modules': modules,
      'serviceWorkflow.followUpPlanIds': modules.map(item => item.planId),
      'serviceWorkflow.followUpPlanId': modules[0]?.planId || null,
      updatedAt: new Date(),
    } });
  }
  console.log(JSON.stringify({ backupKey, productsUpdated: rows.map(item => item.name) }, null, 2));
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());
