/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const { findRecentSelectedReportIds } = require('../utils/medicalProxyWorkflow');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const tasks = await FollowUp.find({
    sourceType: 'order', workflowKey: 'medical_proxy:collect',
    status: { $in: ['planned', 'in_progress'] },
    'formData.reportIds.0': { $exists: false },
  });
  let updated = 0;
  for (const task of tasks) {
    const ids = await findRecentSelectedReportIds(task.patientId);
    if (!ids.length) continue;
    task.formData = { ...(task.formData || {}), reportIds: ids, carriedReportIds: ids };
    task.markModified('formData');
    await task.save();
    updated += 1;
  }
  console.log(JSON.stringify({ activeCollectionTasks: tasks.length, tasksUpdated: updated }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
