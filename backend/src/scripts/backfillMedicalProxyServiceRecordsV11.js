/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const { upsertMedicalProxyServiceRecord } = require('../utils/medicalProxyWorkflow');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const tasks = await FollowUp.find({ sourceType: 'order', workflowKey: 'medical_proxy:execute', status: 'completed' });
  let recordsUpdated = 0;
  for (const task of tasks) {
    const order = await Order.findById(task.sourceOrderId);
    if (!order) continue;
    await upsertMedicalProxyServiceRecord(task, order, true);
    recordsUpdated += 1;
  }
  console.log(JSON.stringify({ completedProxyTasks: tasks.length, recordsUpdated }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
