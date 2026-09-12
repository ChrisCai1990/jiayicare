/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const FINAL_NAME = '门诊一站式：总督办与最终验收';
const PRODUCT_NAME = '门诊一站式服务';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const plans = db.collection('followupplans');
  const finalPlans = await plans.find({ name: FINAL_NAME }).project({ _id: 1 }).toArray();
  const finalIds = finalPlans.map(item => item._id);
  await plans.updateMany({ _id: { $in: finalIds } }, { $set: { status: 'inactive', closesService: false, updatedAt: new Date() } });
  const stripSnapshot = snapshot => {
    if (!snapshot) return snapshot;
    const modules = (snapshot.modules || []).filter(item => !finalIds.some(id => String(item.planId) === String(id)));
    return { ...snapshot, modules, followUpPlanIds: modules.map(item => item.planId), notes: '资料审核后由健康顾问生成随访计划并自动结束服务。' };
  };
  const product = await db.collection('products').findOne({ name: PRODUCT_NAME });
  if (product) await db.collection('products').updateOne({ _id: product._id }, { $set: { serviceWorkflow: stripSnapshot(product.serviceWorkflow), updatedAt: new Date() } });
  const orders = await db.collection('orders').find({ serviceName: PRODUCT_NAME, status: { $nin: ['completed', 'cancelled'] } }).toArray();
  for (const order of orders) await db.collection('orders').updateOne({ _id: order._id }, { $set: { serviceWorkflowSnapshot: stripSnapshot(order.serviceWorkflowSnapshot), updatedAt: new Date() } });
  const healthPlans = await db.collection('healthplans').find({ type: 'medical_assist', $or: [{ 'content.templateName': PRODUCT_NAME }, { title: /门诊一站式/ }] }).toArray();
  for (const plan of healthPlans) {
    const keepModule = item => !finalIds.some(id => String(item.id || item.planId) === String(id)) && !/总督办与最终验收/.test(item.name || '');
    await db.collection('healthplans').updateOne({ _id: plan._id }, { $set: {
      'content.followUpPlans': (plan.content?.followUpPlans || []).filter(keepModule),
      'content.workflowModules': (plan.content?.workflowModules || []).filter(keepModule),
      'content.serviceWorkflowSnapshot': stripSnapshot(plan.content?.serviceWorkflowSnapshot),
      updatedAt: new Date(),
    } });
  }
  const cancelled = await db.collection('followups').updateMany({
    taskRole: 'supervisor', status: { $in: ['planned', 'in_progress', 'missed'] },
    $or: [{ workflowKey: { $in: finalIds.map(String) } }, { theme: /门诊一站式.*总督办与最终验收|总督办门诊一站式/ }],
  }, { $set: { status: 'cancelled', isBlocked: false, cancelReason: '流程优化：健康顾问生成随访计划后自动结束，无需健康规划师再次验收', updatedAt: new Date() } });
  console.log(JSON.stringify({ finalPlansDisabled: finalIds.length, productsUpdated: product ? 1 : 0, ordersUpdated: orders.length, healthPlansUpdated: healthPlans.length, finalTasksCancelled: cancelled.modifiedCount }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main, FINAL_NAME };
