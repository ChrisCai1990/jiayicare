/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');

const REPORT_ID = '6ab3ca763737254244dc89b2';
const ORDER_ID = '6ab12387cb26adfcb4125077';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const report = await MedicalReport.findOne({
    _id: REPORT_ID, sourceType: 'order', sourceOrderId: ORDER_ID,
  }).select('sourceType sourceOrderId title documentCategory audit_status aiStatus clinicalReview classificationCorrection reportItems reviewRevision audited_by audited_at reviewedAt reviewedByStaff').lean();
  if (!report) throw new Error('目标报告不存在或不属于预期陪同订单');
  if (report.documentCategory === 'exam_report') {
    if (process.argv.includes('--queue')) {
      const result = await MedicalReport.collection.updateOne({
        _id: report._id, sourceOrderId: report.sourceOrderId,
        documentCategory: 'exam_report', audit_status: 'unaudited', aiStatus: 'none',
      }, { $set: { aiStatus: 'processing', parseJob: { status: 'processing',
        actorId: String(report.classificationCorrection?.previous?.reviewedByStaff || ''),
        queuedAt: new Date(), message: '资料分类已纠正，等待按检查报告重新识别' } } });
      if (result.modifiedCount !== 1) throw new Error('报告状态已变化，未加入解析队列');
      console.log(JSON.stringify({ report: REPORT_ID, queued: true }));
      return;
    }
    console.log(JSON.stringify({ report: REPORT_ID, alreadyCorrected: true }));
    return;
  }
  if (report.documentCategory !== 'outpatient_record' || !/^就医陪同门诊病历/.test(report.title)) {
    throw new Error('目标报告当前分类或标题已变化，停止纠正');
  }
  const summary = { report: REPORT_ID, previousCategory: report.documentCategory, nextCategory: 'exam_report',
    previousAudit: report.audit_status, nextAudit: 'unaudited', dryRun: !apply };
  if (apply) {
    const result = await MedicalReport.collection.updateOne({
      _id: report._id, sourceType: 'order', sourceOrderId: report.sourceOrderId,
      title: report.title, documentCategory: report.documentCategory,
      audit_status: report.audit_status, reviewRevision: report.reviewRevision,
    }, { $set: {
      title: '耳鼻咽喉内窥镜检查报告单', documentCategory: 'exam_report',
      classificationCorrection: { at: new Date(), reason: '原件印刷标题明确为耳鼻咽喉内窥镜检查报告单，上传时误选门诊病历',
        previous: { title: report.title, documentCategory: report.documentCategory,
          audit_status: report.audit_status, aiStatus: report.aiStatus, clinicalReview: report.clinicalReview,
          reportItems: report.reportItems, audited_by: report.audited_by, audited_at: report.audited_at,
          reviewedAt: report.reviewedAt, reviewedByStaff: report.reviewedByStaff } },
      audit_status: 'unaudited', aiStatus: 'none', clinicalReview: null, reportItems: [],
      audited_by: '', audited_at: null, reviewedAt: null, reviewedByStaff: null,
      aiSummary: '原件为耳鼻咽喉内窥镜检查报告单；资料分类已纠正，需按检查报告重新解析并人工审核。',
      parseJob: { status: 'failed', message: '分类已纠正，等待按检查报告重新解析' },
    }, $inc: { reviewRevision: 1 } });
    if (result.modifiedCount !== 1) throw new Error('报告并发变化，未执行纠正');
    summary.modified = 1;
  }
  console.log(JSON.stringify(summary));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
