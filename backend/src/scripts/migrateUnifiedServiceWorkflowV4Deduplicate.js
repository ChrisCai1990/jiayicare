/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const plans = db.collection('followupplans');
  const product = await products.findOne({ name: '门诊一站式服务' });
  if (!product) throw new Error('门诊一站式服务不存在');
  const planIds = (product.serviceWorkflow?.modules || []).map(item => item.planId);
  const linkedPlans = await plans.find({ _id: { $in: planIds } }, { projection: { name: 1 } }).toArray();
  const names = new Map(linkedPlans.map(item => [String(item._id), item.name || '']));
  const modules = (product.serviceWorkflow?.modules || []).filter(item => !/就医提醒/.test(names.get(String(item.planId)) || ''));
  modules.forEach((item, sequence) => { item.sequence = sequence; });
  const backupKey = `unified-service-workflow-v4-deduplicate-${new Date().toISOString()}`;
  await db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Remove duplicate simple reminder from outpatient one-stop workflow', createdAt: new Date(), product });
  await products.updateOne({ _id: product._id }, { $set: {
    'serviceWorkflow.modules': modules,
    'serviceWorkflow.followUpPlanIds': modules.map(item => item.planId),
    'serviceWorkflow.followUpPlanId': modules[0]?.planId || null,
    updatedAt: new Date(),
  } });
  console.log(JSON.stringify({ backupKey, product: product.name, removed: planIds.length - modules.length, remaining: modules.length }, null, 2));
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());
