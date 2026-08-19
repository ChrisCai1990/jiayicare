function buildReportScreeningProjectionView({ report = {}, revision = {}, projections = [] } = {}) {
  const revisionItems = Array.isArray(revision.items) ? revision.items : [];
  return (Array.isArray(projections) ? projections : []).map(projection => {
    const sourceIds = new Set((projection.sourceItemIds || []).map(String).filter(Boolean));
    const reportItems = revisionItems.filter(item => {
      if (sourceIds.size && sourceIds.has(String(item?.sourceItemId || ''))) return true;
      return item?.screeningKey === projection.itemId
        || (Array.isArray(item?.screeningKeys) && item.screeningKeys.includes(projection.itemId));
    });
    return {
      ...projection,
      title: projection.itemLabel || report.title || '专项筛查',
      screeningL3: projection.itemLabel || '',
      checkDate: report.checkDate || report.date || '',
      institution: report.institution || report.hospital || '',
      reportItems,
    };
  });
}

module.exports = { buildReportScreeningProjectionView };
