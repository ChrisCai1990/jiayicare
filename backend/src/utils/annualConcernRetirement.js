const { conceptKey } = require('./annualConcernReconcile');

function isGenericRiskScan(row) {
  return row.kind === 'ai_risk_scan' && String(row.key || '').startsWith('ai_risk:');
}

function isActiveAnnualConcern(row) {
  return !isGenericRiskScan(row) && row.sourceState !== 'historical';
}

function latestSourceApproval(row) {
  const dates = [row.source, ...(row.mergedSources || []).map(item => item.source)]
    .flatMap(source => [source?.approvedAt, source?.reviewedAt])
    .map(value => new Date(value).getTime()).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)) : null;
}

function retireAnnualConcerns(existing = [], { isGlucoseSuperseded = () => false } = {}) {
  const rows = [];
  const retired = [];
  let flagged = 0;
  for (const row of existing) {
    const genericRisk = isGenericRiskScan(row);
    const oldGlucose = ['ai_health_trend', 'reviewed_chronic_tag', 'reviewed_cardiovascular_tag'].includes(row.kind)
      && conceptKey(row.title) === 'prediabetes_glucose' && isGlucoseSuperseded(row);
    if (!genericRisk && !oldGlucose) { rows.push(row); continue; }
    const reason = genericRisk ? '泛化AI风险扫描仅作历史资料；年度研判使用具体已审核问题及发现'
      : '较新的已审核血糖趋势为正常；旧糖代谢线索不再作为当前异常问题';
    if (row.status === 'suggested' && !row.reviewedAt) {
      retired.push({ ...row, retiredAt: new Date(), retiredReason: reason });
    } else {
      rows.push({ ...row, sourceState: 'historical', sourceStateReason: reason });
      if (row.sourceState !== 'historical' || row.sourceStateReason !== reason) flagged++;
    }
  }
  return { rows, retired, flagged, changed: retired.length > 0 || flagged > 0 };
}

module.exports = { isGenericRiskScan, isActiveAnnualConcern, latestSourceApproval, retireAnnualConcerns };
