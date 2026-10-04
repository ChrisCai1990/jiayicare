/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const MedicalReport = require('../models/MedicalReport');

const legacyTitle = /^医疗代诊病历(（\d+）)?$/;
const legacyNote = /^医疗代诊执行任务：/;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const orders = await Order.find({ 'medicalProxyPlan.medicalEscort': true }).select('_id').lean();
  const reports = orders.length ? await MedicalReport.find({
    sourceType: 'order', sourceOrderId: { $in: orders.map(order => order._id) },
    $or: [{ note: legacyNote }, { title: legacyTitle }],
  }).select('_id sourceOrderId title note').lean() : [];
  const summary = { escortOrders: orders.length, reports: reports.length, noteCorrections: 0, titleCorrections: 0, modified: 0, conflicts: 0, dryRun: !apply };
  for (const report of reports) {
    const patch = {};
    if (legacyNote.test(report.note || '')) {
      patch.note = String(report.note).replace(legacyNote, '就医陪同执行任务：');
      summary.noteCorrections++;
    }
    const title = legacyTitle.exec(report.title || '');
    if (title) {
      patch.title = `就医陪同门诊病历${title[1] || ''}`;
      summary.titleCorrections++;
    }
    if (!apply || !Object.keys(patch).length) continue;
    const result = await MedicalReport.collection.updateOne({
      _id: report._id, sourceType: 'order', sourceOrderId: report.sourceOrderId,
      title: report.title, note: report.note,
    }, { $set: patch });
    summary.modified += result.modifiedCount;
    summary.conflicts += result.matchedCount ? 0 : 1;
  }
  console.log(JSON.stringify(summary));
  if (summary.conflicts) throw new Error('部分报告已被并发修改，请重新运行预览并核对');
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
