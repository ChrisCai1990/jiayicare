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

function removeVisitSource(entry, reportId, actor = {}) {
  const ids = sourceIds(entry);
  if (!ids.includes(String(reportId))) throw new Error('该资料不在此诊疗记录中');
  if (ids.length === 1) return null;
  const documents = visitDocuments(entry);
  if (documents.length !== ids.length || documents.some(doc => !doc.sourceReportId))
    throw new Error('同次就医的来源明细不完整，请先人工核对');
  const remaining = documents.filter(doc => String(doc.sourceReportId) !== String(reportId));
  if (remaining.length !== documents.length - 1) throw new Error('同次就医的来源明细不匹配，请先人工核对');
  const now = actor.at || new Date();
  const snapshot = { ...entry };
  delete snapshot.revisionHistory;
  const first = remaining[0];
  const next = {
    ...entry,
    sourceReportId: first.sourceReportId,
    sourceReportIds: remaining.map(doc => doc.sourceReportId),
    sourceTitle: first.title || '',
    sourceType: first.sourceType || '',
    sourceInstitution: [...new Set(remaining.map(doc => doc.sourceInstitution).filter(Boolean))].join('；'),
    verificationStatus: remaining.every(doc => doc.verificationStatus === 'source_verified') ? 'source_verified' : 'pending_verification',
    visitDocuments: remaining,
    outpatientRecord: remaining.length === 1 ? first.outpatientRecord || null : null,
    updatedAt: now,
    updatedById: actor.id || null,
    updatedByName: actor.name || '',
    revisionHistory: [...(entry.revisionHistory || []), { ...snapshot, archivedAt: now, archivedById: actor.id || null, archivedByName: actor.name || '' }].slice(-50),
    sourceRemovalHistory: [...(entry.sourceRemovalHistory || []), { sourceReportId: String(reportId), at: now, byId: actor.id || null, byName: actor.name || '', reason: actor.reason || '' }].slice(-50),
  };
  for (const key of ['content', 'examination', 'diagnosis', 'medicationChange', 'treatmentResponse', 'nextPlan']) {
    next[key] = remaining.length === 1 ? first[key] || ''
      : remaining.map(doc => doc[key] ? '【' + (doc.title || doc.sourceInstitution || '医疗资料') + '】\n' + doc[key] : '').filter(Boolean).join('\n\n');
  }
  return next;
}

module.exports = { visitDate, sourceDocument, visitDocuments, mergeVisitEntries, removeVisitSource };

