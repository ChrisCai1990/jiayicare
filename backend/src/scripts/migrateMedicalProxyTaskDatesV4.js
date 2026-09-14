/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const { preparationDueDate } = require('../utils/medicalProxyWorkflow');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const collections = await FollowUp.find({
    sourceType: 'order', workflowKey: 'medical_proxy:collect', status: { $in: ['planned', 'in_progress'] },
  }).select('_id sourceOrderId date createdAt');
  let updated = 0;
  for (const collection of collections) {
    const order = await Order.findById(collection.sourceOrderId).select('scheduledAt desiredServiceDate').lean();
    const serviceDate = order?.scheduledAt || order?.desiredServiceDate || collection.date;
    if (!serviceDate) continue;
    const now = new Date();
    const collectionDueAt = preparationDueDate(new Date(serviceDate), collection.createdAt > now ? collection.createdAt : now);
    await Promise.all([
      FollowUp.updateOne({ _id: collection._id }, { $set: { date: collectionDueAt, remindAt: now } }),
      FollowUp.updateOne(
        { sourceType: 'order', sourceOrderId: collection.sourceOrderId, workflowKey: 'medical_proxy:supervise', status: { $in: ['planned', 'in_progress'] } },
        { $set: { date: new Date(serviceDate) } },
      ),
    ]);
    updated += 1;
  }
  console.log(JSON.stringify({ activeOrders: collections.length, taskDatesUpdated: updated }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
