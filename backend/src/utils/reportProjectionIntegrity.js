const { buildReportScreeningCandidates } = require('./reportScreeningProjection');

const uniq = values => [...new Set(values.filter(Boolean).map(String))];

function expectedMatchedKeys(items) {
  return uniq((items || []).filter(item => item?.matchStatus === 'matched').map(item => item.screeningKey || item.screeningKeys?.[0]));
}

function assessReportProjectionIntegrity({ revision, reviewEvents = [], candidates = [], projections = [], projectionEvents = [] } = {}) {
  if (!revision?._id) {
    return {
      status: 'not_published', consistent: true, reviewEventCount: 0,
      missingCandidateSourceItemIds: [], staleCandidateSourceItemIds: [],
      missingProjectionKeys: [], staleProjectionKeys: [], wrongRevisionProjectionKeys: [],
      missingProjectionEventKeys: [], staleProjectionEventKeys: [],
    };
  }
  const revisionId = String(revision._id);
  const expectedCandidateIds = uniq(buildReportScreeningCandidates(revision.items || []).map(item => item.sourceItemId));
  const activeCandidates = (candidates || []).filter(item => item.status !== 'superseded');
  const actualCandidateIds = uniq(activeCandidates.map(item => item.sourceItemId));
  const resolvedKeys = uniq(activeCandidates.filter(item => item.status === 'resolved').map(item => item.resolvedScreeningKey));
  // 纯人工审核沿用旧业务：形成版本和候选，但不自动投影已匹配项；OCR 正式提交才执行自动投影。
  const isOcrPublication = revision.review?.action === 'submit'
    || (reviewEvents || []).some(event => String(event.reportRevisionId || '') === revisionId && event.source === 'ocr_review');
  const expectedProjectionKeys = uniq([
    ...(isOcrPublication ? expectedMatchedKeys(revision.items || []) : []),
    ...resolvedKeys,
  ]);
  const actualProjectionKeys = uniq((projections || []).map(item => item.itemId));
  // 重新对账事件只能证明“修过”，不能替代原始正式审核人和审核动作证据。
  const linkedEvents = (reviewEvents || []).filter(event => String(event.reportRevisionId || '') === revisionId
    && ['submit', 'approve', 'legacy_backfill'].includes(event.action)
    && event.result !== 'rejected');

  const missingCandidateSourceItemIds = expectedCandidateIds.filter(id => !actualCandidateIds.includes(id));
  const staleCandidateSourceItemIds = actualCandidateIds.filter(id => !expectedCandidateIds.includes(id));
  const missingProjectionKeys = expectedProjectionKeys.filter(key => !actualProjectionKeys.includes(key));
  const staleProjectionKeys = actualProjectionKeys.filter(key => !expectedProjectionKeys.includes(key));
  const wrongRevisionProjectionKeys = uniq((projections || [])
    .filter(item => item.itemId && String(item.reportRevisionId || '') !== revisionId)
    .map(item => item.itemId));
  const projectionAuditRequired = revision.projectionAuditVersion === 'v1';
  const activatedEventKeys = uniq((projectionEvents || [])
    .filter(item => item.action === 'activated' && String(item.reportRevisionId || '') === revisionId)
    .map(item => item.itemId));
  const missingProjectionEventKeys = projectionAuditRequired
    ? expectedProjectionKeys.filter(key => !activatedEventKeys.includes(key))
    : [];
  const staleProjectionEventKeys = projectionAuditRequired
    ? activatedEventKeys.filter(key => !expectedProjectionKeys.includes(key))
    : [];
  const consistent = linkedEvents.length > 0
    && !missingCandidateSourceItemIds.length
    && !staleCandidateSourceItemIds.length
    && !missingProjectionKeys.length
    && !staleProjectionKeys.length
    && !wrongRevisionProjectionKeys.length
    && !missingProjectionEventKeys.length
    && !staleProjectionEventKeys.length;

  return {
    status: consistent ? 'consistent' : 'incomplete',
    consistent,
    reviewEventCount: linkedEvents.length,
    projectionMode: isOcrPublication ? 'ocr_review' : 'manual_audit',
    expectedCandidateCount: expectedCandidateIds.length,
    actualCandidateCount: actualCandidateIds.length,
    expectedProjectionCount: expectedProjectionKeys.length,
    actualProjectionCount: actualProjectionKeys.length,
    missingCandidateSourceItemIds,
    staleCandidateSourceItemIds,
    missingProjectionKeys,
    staleProjectionKeys,
    wrongRevisionProjectionKeys,
    projectionAuditRequired,
    projectionEventCount: activatedEventKeys.length,
    missingProjectionEventKeys,
    staleProjectionEventKeys,
  };
}

module.exports = { expectedMatchedKeys, assessReportProjectionIntegrity };
