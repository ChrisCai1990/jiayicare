const ReportRevision = require('../models/ReportRevision');
const { signStoredUrl } = require('./oss');

const USER_HIDDEN_REPORT_FIELDS = [
  'tenantId', 'ossKey', 'ossKeys', 'sourceFiles', 'uploadedBy', 'uploadRequestId',
  'planItemId', 'planId', 'screeningItemId',
  'currentExtractionId', 'currentRevisionId', 'ocrReviewMeta', 'ocrCorrectionLog',
  'ocrVersion', 'ocrTemplateId', 'ocrQualitySummary', 'ocrProgress', 'pageParseStatus', 'dataEditLog',
  'staffAuditSnapshot', 'reviewedByStaff', 'reviewedAt', 'reviewNote',
  'audited_by', 'audited_at', 'familyDoctorViewedAt', 'familyDoctorViewedBy',
  'familyDoctorAudit',
];

const USER_HIDDEN_ITEM_FIELDS = [
  'sourceItemId', 'sourcePage', 'sourcePages', 'sourceEvidence',
  'screeningKeys', 'screeningKey', 'screeningCategory', 'screeningParent',
  'matchStatus', 'matchConfidence',
  'ocrVersion', 'ocrConfidence', 'evidenceText', 'qualityFlags', 'reviewPriority',
  'duplicateGroup', 'textLayerAvailable', 'textLayerEvidence',
];

function toUserItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    const obj = item?.toObject ? item.toObject() : { ...(item || {}) };
    USER_HIDDEN_ITEM_FIELDS.forEach(field => delete obj[field]);
    return obj;
  });
}

function withSignedReportFiles(report) {
  const obj = report.toObject ? report.toObject() : { ...report };
  const urls = obj.fileUrls?.length ? obj.fileUrls : (obj.fileUrl ? [obj.fileUrl] : []);
  const keys = obj.ossKeys?.length ? obj.ossKeys : (obj.ossKey ? [obj.ossKey] : []);
  const signedUrls = urls.map((url, index) => signStoredUrl(url, keys[index] || ''));
  obj.fileUrls = signedUrls;
  obj.fileUrl = signedUrls[0] || '';
  return obj;
}

function toUserReport(report, revision = null) {
  const obj = withSignedReportFiles(report);
  const hasPublishedRevision = !!revision;
  const auditedSnapshotItems = obj.staffAuditSnapshot?.snapshotAt && Array.isArray(obj.staffAuditSnapshot?.reportItems)
    ? obj.staffAuditSnapshot.reportItems
    : null;
  const isLegacyReviewed = !hasPublishedRevision
    && obj.audit_status === 'audited'
    && !['processing', 'pending', 'rejected'].includes(obj.aiStatus);

  if (hasPublishedRevision) {
    obj.reportItems = toUserItems(revision.items);
    obj.aiSummary = String(revision.aiSummary || '');
    obj.aiStatus = 'reviewed';
    obj.derivedDataStatus = 'reviewed';
    obj.publishedRevisionNo = revision.revisionNo;
  } else if (auditedSnapshotItems) {
    obj.reportItems = toUserItems(auditedSnapshotItems);
    obj.aiSummary = '';
    obj.aiStatus = 'reviewed';
    obj.derivedDataStatus = 'reviewed';
  } else if (isLegacyReviewed) {
    obj.reportItems = toUserItems(obj.reportItems);
    obj.derivedDataStatus = 'reviewed';
  } else {
    obj.reportItems = [];
    obj.aiSummary = '';
    obj.status = 'pending';
    obj.derivedDataStatus = ['processing', 'pending'].includes(obj.aiStatus) ? 'under_review' : 'not_available';
  }

  USER_HIDDEN_REPORT_FIELDS.forEach(field => delete obj[field]);
  return obj;
}

async function toUserReports(reports) {
  const revisionIds = reports.map(report => report.currentRevisionId).filter(Boolean);
  const revisions = revisionIds.length
    ? await ReportRevision.find({ _id: { $in: revisionIds } }).lean()
    : [];
  const revisionMap = new Map(revisions.map(revision => [String(revision._id), revision]));
  return reports.map(report => toUserReport(report, revisionMap.get(String(report.currentRevisionId || '')) || null));
}

module.exports = { toUserReport, toUserReports };
