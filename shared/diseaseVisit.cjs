const { sourceIds } = require('./diseaseReportArchive.cjs');

const visitDate = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
};

const sourceDocument = entry => ({
  sourceReportId: entry.sourceReportId || null,
  title: entry.sourceTitle || entry.sourceInstitution || '医疗资料',
  sourceInstitution: entry.sourceInstitution || '',
  sourceType: entry.sourceType || '',
  verificationStatus: entry.verificationStatus || '',
  content: entry.content || '',
  examination: entry.examination || '',
  diagnosis: entry.diagnosis || '',
  medicationChange: entry.medicationChange || '',
  treatmentResponse: entry.treatmentResponse || '',
  nextPlan: entry.nextPlan || '',
  outpatientRecord: entry.outpatientRecord || null,
  recordedAt: entry.recordedAt || null,
  reviewedAt: entry.reviewedAt || null,
  reviewedByName: entry.reviewedByName || '',
});

const visitDocuments = entry => Array.isArray(entry.visitDocuments) && entry.visitDocuments.length
  ? entry.visitDocuments : [sourceDocument(entry)];

function mergeVisitEntries(target, incoming, actor = {}) {
  const targetDate = visitDate(target.occurredAt);
  if (!targetDate || targetDate !== visitDate(incoming.occurredAt)) throw new Error('两条资料的实际就诊日期不同，请先核对日期');
  const existingIds = new Set(sourceIds(target));
  if (sourceIds(incoming).some(id => existingIds.has(id))) throw new Error('该医疗资料已归入本次就医');
  const documents = [...visitDocuments(target), ...visitDocuments(incoming)];
  const now = actor.at || new Date();
  const previous = { ...target };
  delete previous.revisionHistory;
  const merged = { ...target,
    sourceReportIds: [...new Set([...sourceIds(target), ...sourceIds(incoming)])],
    visitDocuments: documents,
    sourceInstitution: [...new Set(documents.map(doc => doc.sourceInstitution).filter(Boolean))].join('；'),
    verificationStatus: documents.every(doc => doc.verificationStatus === 'source_verified') ? 'source_verified' : 'pending_verification',
    updatedAt: now, updatedById: actor.id || null, updatedByName: actor.name || '',
    revisionHistory: [...(target.revisionHistory || []), { ...previous, archivedAt: now, archivedById: actor.id || null, archivedByName: actor.name || '' }].slice(-50),
    visitMergeHistory: [...(target.visitMergeHistory || []), {
      mergedEntryId: incoming._id, at: now, byId: actor.id || null, byName: actor.name || '',
      sourceReportIds: sourceIds(incoming), sourceEntry: incoming,
    }].slice(-50),
  };
  for (const key of ['content', 'examination', 'diagnosis', 'medicationChange', 'treatmentResponse', 'nextPlan']) {
    merged[key] = documents.map(doc => doc[key] ? '【' + (doc.title || doc.sourceInstitution || '医疗资料') + '】\n' + doc[key] : '').filter(Boolean).join('\n\n');
  }
  return merged;
}

module.exports = { visitDate, sourceDocument, visitDocuments, mergeVisitEntries };

