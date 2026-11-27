const uncertain = hospital => !hospital || /待定|待确认|待核|就近|或/.test(hospital);

function needsReview(a, b) {
  return a.date === b.date && a.moduleKey === 'abnormal_followup' && b.moduleKey === a.moduleKey
    && [a, b].every(item => (item.row.serviceMode || 'reminder') === 'reminder'
      && !item.row.datePending && !String(item.row.scheduleSeparationReason || '').trim())
    && (uncertain(a.hospital) || uncertain(b.hospital))
    && !(a.row.visitGroupId && a.row.visitGroupId === b.row.visitGroupId)
    && !(a.row.visitGroupId && b.row.visitGroupId && a.row.visitMergeConfirmed && b.row.visitMergeConfirmed);
}

module.exports = { needsReview };
