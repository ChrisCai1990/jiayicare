require('dotenv').config();
const mongoose = require('mongoose');
const HealthPlan = require('../models/HealthPlan');
const ServiceRecord = require('../models/ServiceRecord');
const MedicalReport = require('../models/MedicalReport');

const apply = process.argv.includes('--apply');
const text = value => String(value || '').trim();
const score = record => (text(record.result) ? 1000 : 0) + (record.attachments?.length || 0) * 100 + text(record.content).length;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const plans = await HealthPlan.find({ type: 'medical_assist', sourceOrderId: { $ne: null } }).select('_id sourceOrderId').lean();
  let mergedGroups = 0;
  let removedRecords = 0;
  for (const plan of plans) {
    const records = await ServiceRecord.find({
      type: 'medical_visit',
      $or: [{ sourceHealthPlanId: plan._id }, { sourceOrderId: plan.sourceOrderId }],
    }).sort({ createdAt: 1 }).lean();
    if (records.length < 2) continue;
    const canonical = [...records].sort((a, b) => score(b) - score(a) || new Date(a.createdAt) - new Date(b.createdAt))[0];
    const duplicates = records.filter(record => String(record._id) !== String(canonical._id));
    const richest = [...records].sort((a, b) => score(b) - score(a))[0];
    const attachments = [...new Map(records.flatMap(record => record.attachments || []).filter(file => file?.url).map(file => [file.url, file])).values()];
    if (apply) {
      const duplicateIds = duplicates.map(record => record._id);
      await MedicalReport.updateMany({ sourceServiceRecordId: { $in: duplicateIds } }, { $set: { sourceServiceRecordId: canonical._id } });
      await ServiceRecord.deleteMany({ _id: { $in: duplicateIds } });
      await ServiceRecord.updateOne({ _id: canonical._id }, { $set: {
        sourceOrderId: plan.sourceOrderId,
        sourceHealthPlanId: plan._id,
        staffId: richest.staffId || canonical.staffId,
        patientId: canonical.patientId || richest.patientId,
        date: richest.date || canonical.date,
        title: text(richest.title) || text(canonical.title),
        content: text(richest.content).length >= text(canonical.content).length ? richest.content : canonical.content,
        result: text(richest.result) || text(canonical.result),
        attachments,
        medicalEscort: richest.medicalEscort || canonical.medicalEscort,
      } });
    }
    mergedGroups += 1;
    removedRecords += duplicates.length;
    console.log(`${apply ? 'MERGED' : 'WOULD_MERGE'} plan=${plan._id} order=${plan.sourceOrderId} keep=${canonical._id} remove=${duplicates.map(item => item._id).join(',')}`);
  }
  console.log(JSON.stringify({ apply, mergedGroups, removedRecords }));
  await mongoose.disconnect();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
