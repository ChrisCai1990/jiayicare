/**
 * 为历史报告补建 OCR 识别快照与审核发布版本。
 *
 * 默认只预演；实际写库必须同时提供 --apply 和环境变量确认，且不修改 reportItems、原件、
 * 审核状态或专项筛查记录。新建的快照只是把既有当前数据固定为历史基线。
 *
 * 用法：
 *   node src/scripts/backfill-report-versions.js
 *   node src/scripts/backfill-report-versions.js --limit 100
 *   $env:REPORT_VERSION_BACKFILL_CONFIRM='report-version-backfill-v1'
 *   node src/scripts/backfill-report-versions.js --apply --limit 100
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');
const ReportExtraction = require('../models/ReportExtraction');
const ReportRevision = require('../models/ReportRevision');
const ReportReviewEvent = require('../models/ReportReviewEvent');
const ReportScreeningCandidate = require('../models/ReportScreeningCandidate');
const { ensureReportItemSourceIds } = require('../utils/reportItemSource');
const { buildReportScreeningCandidates } = require('../utils/reportScreeningProjection');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = Math.max(1, Number(limitArg?.split('=')[1] || 100));
const CONFIRMATION = 'report-version-backfill-v1';

function hasItems(report) {
  return Array.isArray(report.reportItems) && report.reportItems.length > 0;
}

function needsExtraction(report) {
  return !report.currentExtractionId
    && hasItems(report)
    && (Boolean(report.ocrVersion) || ['pending', 'reviewed'].includes(report.aiStatus));
}

function needsRevision(report) {
  return !report.currentRevisionId
    && (report.audit_status === 'audited' || report.aiStatus === 'reviewed');
}

async function main() {
  if (APPLY && process.env.REPORT_VERSION_BACKFILL_CONFIRM !== CONFIRMATION) {
    throw new Error(`实际写入需同时设置 REPORT_VERSION_BACKFILL_CONFIRM=${CONFIRMATION}`);
  }
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');
  console.log(`[backfill-report-versions] mode: ${APPLY ? 'APPLY (写库)' : 'DRY-RUN (仅预演)'}; limit: ${limit}`);

  const reports = await MedicalReport.find({
    $or: [
      { currentExtractionId: null },
      { currentExtractionId: { $exists: false } },
      { currentRevisionId: null },
      { currentRevisionId: { $exists: false } },
    ],
  }).sort({ createdAt: 1 }).limit(limit).lean();

  let extractionCount = 0;
  let revisionCount = 0;
  let reviewEventCount = 0;
  let candidateCount = 0;
  let skipped = 0;
  const byReportState = {};
  const auditGaps = { reviewerIdentityMissing: 0, originalReviewTimeMissing: 0, extractionSourceMissing: 0 };

  for (const report of reports) {
    const makeExtraction = needsExtraction(report);
    const makeRevision = needsRevision(report);
    if (!makeExtraction && !makeRevision) { skipped++; continue; }

    const update = {};
    if (makeExtraction) {
      extractionCount++;
      if (APPLY) {
        const existing = await ReportExtraction.findOne({ reportId: report._id }).sort({ version: -1 });
        const extraction = existing || await ReportExtraction.create({
          reportId: report._id, user: report.user, tenantId: report.tenantId || null, version: 1, origin: 'legacy',
          engine: { ocrVersion: report.ocrVersion || 'legacy', templateId: report.ocrTemplateId || '' },
          source: { ossKeys: report.ossKeys || (report.ossKey ? [report.ossKey] : []), pageCount: Number(report.pages || 0) },
          reportMetadata: { institution: report.institution || report.hospital || '', checkDate: report.checkDate || report.date || '' },
          summary: report.ocrQualitySummary || null, items: report.reportItems || [], aiSummary: report.aiSummary || '',
        });
        update.currentExtractionId = extraction._id;
      }
    }

    if (makeRevision) {
      const revisionItems = ensureReportItemSourceIds(report.reportItems || []);
      const candidates = buildReportScreeningCandidates(revisionItems);
      revisionCount++;
      reviewEventCount++;
      if (!report.reviewedByStaff && !report.audited_by) auditGaps.reviewerIdentityMissing++;
      if (!report.reviewedAt && !report.audited_at) auditGaps.originalReviewTimeMissing++;
      if (!update.currentExtractionId && !report.currentExtractionId) auditGaps.extractionSourceMissing++;
      candidateCount += candidates.length;
      if (APPLY) {
        const revisionExtractionId = update.currentExtractionId || report.currentExtractionId || null;
        const revisionExtraction = revisionExtractionId
          ? await ReportExtraction.findById(revisionExtractionId).select('version origin engine').lean()
          : null;
        const existing = await ReportRevision.findOne({ reportId: report._id }).sort({ revisionNo: -1 });
        const revision = existing || await ReportRevision.create({
          reportId: report._id, extractionId: revisionExtractionId,
          user: report.user, tenantId: report.tenantId || null, revisionNo: 1, items: revisionItems, aiSummary: report.aiSummary || '',
          contentHash: require('crypto').createHash('sha256').update(JSON.stringify({
            items: revisionItems,
            aiSummary: report.aiSummary || '',
            reportMetadata: { title: report.title || '', institution: report.institution || report.hospital || '', checkDate: report.checkDate || report.date || '', type: report.type || '' },
          })).digest('hex'),
          reportMetadata: { title: report.title || '', institution: report.institution || report.hospital || '', checkDate: report.checkDate || report.date || '', type: report.type || '' },
          review: {
            reviewerId: report.reviewedByStaff || null,
            reviewerName: report.audited_by || '',
            reviewerRole: '',
            reviewedAt: report.reviewedAt || report.audited_at || report.updatedAt || report.createdAt,
            action: 'legacy_backfill',
            auditStatus: report.audit_status || '',
          },
          source: {
            extractionVersion: revisionExtraction?.version ?? null,
            extractionOrigin: revisionExtraction?.origin || 'legacy',
            ocrVersion: revisionExtraction?.engine?.ocrVersion || report.ocrVersion || 'legacy',
          },
          reviewMeta: report.ocrReviewMeta || null,
        });
        await ReportReviewEvent.findOneAndUpdate(
          { reportId: report._id, requestId: `legacy-backfill:${report._id}` },
          { $setOnInsert: {
            reportRevisionId: revision._id,
            extractionId: revisionExtractionId,
            user: report.user,
            tenantId: report.tenantId || null,
            action: 'legacy_backfill',
            source: 'legacy_backfill',
            actor: { id: report.reviewedByStaff || null, name: report.audited_by || '', role: '' },
            occurredAt: report.reviewedAt || report.audited_at || report.updatedAt || report.createdAt,
            contentHash: revision.contentHash,
            result: existing ? 'deduplicated' : 'published',
            summary: { itemCount: revisionItems.length },
          } },
          { upsert: true, new: true },
        );
        update.currentRevisionId = revision._id;
        update.reportItems = revisionItems;
        if (candidates.length) await ReportScreeningCandidate.bulkWrite(candidates.map(candidate => ({
          updateOne: {
            filter: { reportRevisionId: revision._id, sourceItemId: candidate.sourceItemId },
            update: {
              $setOnInsert: {
                reportId: report._id, reportRevisionId: revision._id, user: report.user,
                tenantId: report.tenantId || null, sourceItemId: candidate.sourceItemId,
              },
              $set: { itemSnapshot: candidate.itemSnapshot },
            },
            upsert: true,
          },
        })));
      }
    }
    if (APPLY && Object.keys(update).length) await MedicalReport.updateOne({ _id: report._id }, { $set: update });
    const key = `${report.aiStatus || 'none'}|${report.audit_status || 'unaudited'}`;
    byReportState[key] = (byReportState[key] || 0) + 1;
  }

  console.log(`[backfill-report-versions] 检查 ${reports.length} 条；识别快照 ${extractionCount}；审核版本 ${revisionCount}；审核事件 ${reviewEventCount}；待归类候选 ${candidateCount}；跳过 ${skipped}`);
  console.log('[backfill-report-versions] 按识别/审核状态统计:', JSON.stringify(byReportState, null, 2));
  console.log('[backfill-report-versions] 历史审核证据缺口（仅报告，不推断补造）:', JSON.stringify(auditGaps, null, 2));
  if (!APPLY && (extractionCount || revisionCount)) console.log('[backfill-report-versions] 这是预演，未写库。确认无误后按说明加 --apply 和确认环境变量。');
  await mongoose.disconnect();
}

main().catch(err => { console.error('[backfill-report-versions] 失败:', err.message); process.exit(1); });
