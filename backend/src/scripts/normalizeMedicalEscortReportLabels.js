/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const MedicalReport = require('../models/MedicalReport');
const ServiceRecord = require('../models/ServiceRecord');

const legacyTitle = /^医疗代诊病历(（\d+）)?$/;
const legacyNote = /^医疗代诊执行任务：/;
const legacyTaskTheme = /^医疗代诊：/;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const orders = await Order.find({ $or: [
    { 'medicalProxyPlan.medicalEscort': true }, { serviceName: /陪同|陪诊/ },
  ] }).select('_id').lean();
  const reports = orders.length ? await MedicalReport.find({
    sourceType: 'order', sourceOrderId: { $in: orders.map(order => order._id) },
    $or: [{ note: legacyNote }, { title: legacyTitle }],
  }).select('_id sourceOrderId title note').lean() : [];
  const serviceRecords = orders.length ? await ServiceRecord.find({
    sourceOrderId: { $in: orders.map(order => order._id) }, type: 'medical_visit',
    $or: [{ title: '医疗代诊服务' }, { 'medicalEscort.serviceType': 'proxy_visit' }],
  }).select('_id sourceOrderId title medicalEscort.serviceType').lean() : [];
  const FollowUp = require('../models/FollowUp');
  const tasks = orders.length ? await FollowUp.find({
    sourceType: 'order', sourceOrderId: { $in: orders.map(order => order._id) },
    theme: legacyTaskTheme, workflowKey: /^medical_proxy:/,
  }).select('_id sourceOrderId theme').lean() : [];
  const summary = { escortOrders: orders.length, reports: reports.length, noteCorrections: 0, titleCorrections: 0,
    serviceRecords: serviceRecords.length, serviceTitleCorrections: 0, serviceTypeCorrections: 0,
    tasks: tasks.length, modifiedTasks: 0, modifiedReports: 0, modifiedServiceRecords: 0, conflicts: 0, dryRun: !apply };
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
    summary.modifiedReports += result.modifiedCount;
    summary.conflicts += result.matchedCount ? 0 : 1;
  }
  for (const record of serviceRecords) {
    const patch = {};
    if (record.title === '医疗代诊服务') {
      patch.title = '就医陪同服务';
      summary.serviceTitleCorrections++;
    }
    if (record.medicalEscort?.serviceType === 'proxy_visit') {
      patch['medicalEscort.serviceType'] = 'accompany';
      summary.serviceTypeCorrections++;
    }
    if (!apply || !Object.keys(patch).length) continue;
    const result = await ServiceRecord.collection.updateOne({
      _id: record._id, sourceOrderId: record.sourceOrderId, title: record.title,
      'medicalEscort.serviceType': record.medicalEscort?.serviceType || '',
    }, { $set: patch });
    summary.modifiedServiceRecords += result.modifiedCount;
    summary.conflicts += result.matchedCount ? 0 : 1;
  }
  for (const task of tasks) {
    if (!apply) continue;
    const result = await FollowUp.collection.updateOne({
      _id: task._id, sourceType: 'order', sourceOrderId: task.sourceOrderId, theme: task.theme,
    }, { $set: { theme: task.theme.replace(legacyTaskTheme, '就医陪同：') } });
    summary.modifiedTasks += result.modifiedCount;
    summary.conflicts += result.matchedCount ? 0 : 1;
  }
  console.log(JSON.stringify(summary));
  if (summary.conflicts) throw new Error('部分资料已被并发修改，请重新运行预览并核对');
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
