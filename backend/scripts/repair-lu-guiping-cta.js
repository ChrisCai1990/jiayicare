/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const MedicalReport = require('../src/models/MedicalReport');
const { reconcileFocusedTopics } = require('../src/utils/focusedTrendEvidence');

const APPLY = process.argv.includes('--apply');
const REPORT_ID = '6ac06feac7b0105216c11cdb';
const GENERATED_AT = '2026-10-12T14:31:57.044Z';
const CONCLUSION = '1、冠脉各支未见明显钙化、狭窄。2、冠脉呈右优势型。';
const CTA_RULE = /冠脉CTA|冠状动脉CTA|冠脉CT|冠状动脉CT/i;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({ name: '卢桂平' }).select('_id name aiHealthSummary').lean();
  if (users.length !== 1) throw new Error(`同名用户数量为 ${users.length}，停止修正`);
  const user = users[0];
  const reports = await MedicalReport.find({ user: user._id })
    .sort({ checkDate: -1, date: -1, createdAt: -1 })
    .select('_id title checkDate date reportYear examConclusion reportItems audit_status reviewRevision')
    .lean();
  const report = reports.find(row => String(row._id) === REPORT_ID);
  if (!report || report.title !== '冠脉CTA图文报告' || report.reportYear !== 2026
    || report.checkDate !== '2026-09-23' || report.date !== '2026-09-26'
    || report.audit_status !== 'audited') throw new Error('2026 报告身份、日期或审核状态不符，停止修正');
  if (report.examConclusion && report.examConclusion !== CONCLUSION) {
    throw new Error('报告已有不同结论，停止修正');
  }
  if (!reports.some(row => row.reportYear === 2023 && (row.reportItems || []).some(item => CTA_RULE.test(item.name)))) {
    throw new Error('未找到 2023 年冠脉 CTA 对照报告，停止修正');
  }
  const originalSummary = user.aiHealthSummary;
  const entry = originalSummary?.byYear?.['2026'];
  const sourceRecord = entry?.records?.[0];
  if (!sourceRecord || new Date(sourceRecord.generatedAt).toISOString() !== GENERATED_AT
    || sourceRecord.doctorApprovedAt || sourceRecord.approvedAt) {
    throw new Error('最新分析版本或审核状态已变化，停止修正');
  }
  const originalTopics = sourceRecord.sections?.cardiovascular_risk?.topics || [];
  const originalCard = originalTopics.find(row => row.name === '冠脉CTA');
  if (!originalCard) throw new Error('最新分析缺少冠脉 CTA 卡片，停止修正');
  if (originalCard.trend !== '仅2023年一次冠脉CTA检查，无法判断趋势'
    && !originalCard.trend.includes('2023、2026年有冠脉CTA检查记录')) {
    throw new Error('最新分析内容已变化，停止修正');
  }

  const previousConclusion = report.examConclusion;
  report.examConclusion = CONCLUSION;
  const updatedTopics = originalTopics.map(row => row.name === '冠脉CTA' ? { ...row } : row);
  reconcileFocusedTopics(updatedTopics, reports, { 冠脉CTA: CTA_RULE }, ['冠脉CTA'], 2026);
  const updatedCard = updatedTopics.find(row => row.name === '冠脉CTA');
  const correctedSections = {
    ...sourceRecord.sections,
    cardiovascular_risk: { ...sourceRecord.sections.cardiovascular_risk, topics: updatedTopics },
  };
  const correctedRecord = {
    ...sourceRecord, sections: correctedSections,
    evidenceRepair: {
      at: new Date(), sourceReportId: report._id,
      reason: '依据 2026-09-26 原报告补齐冠脉 CTA 检查结论与遗漏年份',
      previousTrend: originalCard.trend,
    },
  };
  const correctedEntry = {
    ...entry, sections: correctedSections,
    records: [correctedRecord, ...entry.records.slice(1)],
  };
  const correctedSummary = {
    ...originalSummary,
    byYear: { ...originalSummary.byYear, '2026': correctedEntry },
    ...(String(originalSummary.latestYear) === '2026' ? { sections: correctedSections } : {}),
  };
  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run', reportId: REPORT_ID,
    previous: { conclusion: previousConclusion || '', trend: originalCard.trend },
    proposed: { conclusion: CONCLUSION, latest: updatedCard.latest,
      trend: updatedCard.trend, trendStatus: updatedCard.trendStatus,
      keyChanges: updatedCard.keyChanges, evidenceIds: updatedCard.evidenceIds },
    preservedApprovedRecordCount: entry.records.slice(1).filter(row => row.doctorApprovedAt || row.approvedAt).length,
  }).replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`));
  if (!APPLY) return;

  const storedReport = await MedicalReport.findById(REPORT_ID).select('examConclusion reviewRevision').lean();
  if (storedReport.examConclusion && storedReport.examConclusion !== CONCLUSION) {
    throw new Error('报告结论已被其他人更改，未更新分析');
  }
  if (!storedReport.examConclusion) {
    const update = await MedicalReport.updateOne(
      { _id: report._id, examConclusion: '', reviewRevision: storedReport.reviewRevision },
      { $set: { examConclusion: CONCLUSION }, $inc: { reviewRevision: 1 },
        $push: { dataEditLog: {
          itemIndex: -1, itemName: '冠脉CTA报告级结论', field: 'examConclusion',
          oldValue: '', newValue: CONCLUSION, at: new Date(),
        } } }
    );
    if (update.modifiedCount !== 1) throw new Error('报告版本已变化，未更新分析');
  }
  const update = await User.collection.updateOne(
    { _id: user._id, aiHealthSummary: originalSummary },
    { $set: { aiHealthSummary: correctedSummary } }
  );
  if (update.modifiedCount !== 1) throw new Error('分析版本已变化；报告结论已补齐，请核对后重试分析修正');
  console.log('报告结论与最新未审核分析已修正；已审核历史记录未改动');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
