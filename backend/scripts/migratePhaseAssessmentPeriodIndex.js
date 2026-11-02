// Run --apply before enabling plan-independent monthly assessments.
// Dry run checks for conflicting historical periods and reports current indexes.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

async function migrate(collection, apply = false) {
  const oldName = 'annualPlanId_1_templateId_1_periodKey_1';
  const monthlyName = 'monthly_patient_period_unique';
  const annualName = 'annual_plan_template_period_unique_v2';
  const duplicates = await collection.aggregate([
    { $match: { annualPlanId: null } },
    { $group: { _id: { patientId: '$patientId', periodKey: '$periodKey' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }, { $limit: 10 },
  ]).toArray();
  const indexes = await collection.indexes();
  const result = { duplicates, indexes: indexes.map(index => index.name), applied: false };
  const legacy = indexes.filter(index => index.unique && index.key?.annualPlanId === 1 && index.key?.templateId === 1 && index.key?.periodKey === 1 && !index.partialFilterExpression);
  if (legacy.some(index => index.name !== oldName)) throw new Error('发现未知名称的旧阶段评估唯一索引，停止迁移');
  if (!apply) return result;
  if (duplicates.length) throw new Error('存在同一客户同周期的历史重复评估，停止索引迁移');
  if (indexes.some(index => index.name === monthlyName && (!index.unique || index.key.patientId !== 1 || index.key.periodKey !== 1 || index.partialFilterExpression?.annualPlanId?.$type !== 'null'))) throw new Error('月度索引与预期不符');
  if (indexes.some(index => index.name === annualName && (!index.unique || index.key.annualPlanId !== 1 || index.key.templateId !== 1 || index.key.periodKey !== 1 || index.partialFilterExpression?.annualPlanId?.$type !== 'objectId'))) throw new Error('年度索引与预期不符');
  if (!indexes.some(index => index.name === monthlyName)) await collection.createIndex({ patientId: 1, periodKey: 1 }, { unique: true, name: monthlyName, partialFilterExpression: { annualPlanId: { $type: 'null' } } });
  if (!indexes.some(index => index.name === annualName)) await collection.createIndex({ annualPlanId: 1, templateId: 1, periodKey: 1 }, { unique: true, name: annualName, partialFilterExpression: { annualPlanId: { $type: 'objectId' } } });
  if (indexes.some(index => index.name === oldName)) await collection.dropIndex(oldName);
  const final = await collection.indexes();
  if (!final.some(index => index.name === monthlyName) || !final.some(index => index.name === annualName) || final.some(index => index.name === oldName)) throw new Error('阶段评估索引迁移后校验失败');
  return { ...result, applied: true };
}

if (require.main === module) {
  mongoose.set('autoIndex', false);
  mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 })
    .then(async () => { console.log(JSON.stringify(await migrate(mongoose.connection.db.collection('phaseassessments'), process.argv.includes('--apply')))); })
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}

module.exports = { migrate };
