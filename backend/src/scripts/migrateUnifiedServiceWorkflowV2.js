/* eslint-disable no-console */
// Idempotent correction for the first workflow draft. Dry-run by default.
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const conditionalName = name => /定期复查|定期复诊|就医提醒|复查管理/.test(name);
const triggerFor = name => /复诊|就医提醒/.test(name) ? 'followup_instruction_found' : 'abnormal_found';
const excludedForProduct = (productName, planName) => {
  if (/报告.*(?:解读|解析)|(?:解读|解析).*报告/.test(planName)) return true;
  if (/肺结节/.test(planName) && !/肺结节/.test(productName)) return true;
  if (/科学减重咨询|营养评估服务/.test(productName) && /强化营养干预/.test(planName)) return true;
  return false;
};

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const followups = db.collection('followupplans');
  const allPlans = await followups.find({}, { projection: { name: 1 } }).toArray();
  const planNames = new Map(allPlans.map(item => [String(item._id), item.name || '']));
  const rows = await products.find({}, { projection: { name: 1, serviceWorkflow: 1 } }).toArray();
  const updates = [];
  for (const product of rows) {
    const workflow = product.serviceWorkflow || {};
    const ids = workflow.followUpPlanIds?.length ? workflow.followUpPlanIds : (workflow.followUpPlanId ? [workflow.followUpPlanId] : []);
    const kept = [...new Set(ids.map(String))].filter(id => mongoose.Types.ObjectId.isValid(id) && !excludedForProduct(product.name || '', planNames.get(id) || ''));
    const modules = kept.map((planId, sequence) => {
      const name = planNames.get(planId) || '';
      const conditional = conditionalName(name);
      return { planId: new mongoose.Types.ObjectId(planId), mode: conditional ? 'conditional' : 'fixed', trigger: conditional ? triggerFor(name) : '', sequence };
    });
    const next = { ...workflow, followUpPlanId: modules[0]?.planId || null, followUpPlanIds: modules.map(item => item.planId), modules };
    updates.push({ id: product._id, name: product.name, before: ids.length, after: modules.length, conditional: modules.filter(item => item.mode === 'conditional').length, next });
  }
  const draftIds = allPlans.filter(item => /^【审核稿】/.test(item.name || '')).map(item => item._id);
  if (!APPLY) {
    console.log(JSON.stringify({ mode: 'dry-run', products: updates.map(({ name, before, after, conditional }) => ({ name, before, after, conditional })), draftsPendingReview: draftIds.length }, null, 2));
    return;
  }
  const backupKey = `unified-service-workflow-v2-${new Date().toISOString()}`;
  await db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Before unified workflow v2 correction', createdAt: new Date(), products: rows, followUpPlans: await followups.find({ _id: { $in: draftIds } }).toArray() });
  for (const item of updates) await products.updateOne({ _id: item.id }, { $set: { serviceWorkflow: item.next, updatedAt: new Date() } });
  if (draftIds.length) await followups.updateMany({ _id: { $in: draftIds } }, { $set: { reviewStatus: 'pending_review', reviewedAt: null, reviewedBy: null, updatedAt: new Date() } });
  console.log(JSON.stringify({ mode: 'applied', backupKey, productsUpdated: updates.length, draftsPendingReview: draftIds.length }, null, 2));
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());
