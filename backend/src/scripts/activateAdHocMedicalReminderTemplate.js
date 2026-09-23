/* eslint-disable no-console */
// Reversible catalog update. Dry-run unless --apply is supplied; existing customer plans are untouched.
require('dotenv').config();
const mongoose = require('mongoose');

const obsoleteNames = ['【审核稿】口腔定期复诊方案', '【审核稿】定期复诊管理方案'];
const reminderName = '临时就医提醒';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const templates = mongoose.connection.db.collection('plantemplates');
  const followUps = mongoose.connection.db.collection('followupplans');
  const filter = { type: 'medical_assist', name: { $in: obsoleteNames } };
  const existing = await templates.find(filter, { projection: { _id: 1, name: 1, status: 1 } }).toArray();
  const reminder = await followUps.findOne({ name: reminderName }, { projection: { _id: 1, name: 1, status: 1 } });
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'dry-run', templates: existing, reminder }, null, 2));
    return;
  }
  const retired = await templates.updateMany({ ...filter, status: 'active' }, { $set: { status: 'inactive', updatedAt: new Date() } });
  const created = await followUps.updateOne({ name: reminderName }, {
    $set: { status: 'active', workflowStageKey: 'ad_hoc_medical_reminder' },
    $setOnInsert: {
      name: reminderName, category: 'medical_assist', reviewStatus: 'approved',
      cycles: [{ cycleType: 'duration', cycleDuration: 1, cycleUnit: 'day', notes: '创建时填写本次提醒日期；后续联系均保留在同一任务中' }],
      defaultRole: 'healthManager', executorRole: 'healthManager', supervisorRole: '',
      remindDaysBefore: 0, executorDueOffsetDays: 0, supervisorDueOffsetDays: 0,
      requiresCoordination: false,
      completionStandard: '记录每次提醒和客户进展；确认实际就医后完成资料收集、健管审核及健康顾问随访确认。',
      default_content: { instructions: '提醒客户按顾问要求就医，未完成前记录每次沟通，不重复建任务；实际就医后转资料审核。' },
      createdAt: new Date(), updatedAt: new Date(),
    },
  }, { upsert: true });
  console.log(JSON.stringify({ mode: 'applied', retired: retired.modifiedCount, reminderCreated: created.upsertedCount, reminderName }));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
