// Preserve audited source values while clarifying premature calendar-quarter labels.
function prematureCalendarQuarter(assessment) {
  const match = String(assessment?.periodKey || '').match(/^(\d{4})-Q([1-4])$/);
  if (!match || assessment?.templateSnapshot?.frequency !== 'quarterly' || !['finalized', 'approved'].includes(assessment?.status)) return null;
  const year = Number(match[1]), quarter = Number(match[2]);
  const createdAt = new Date(assessment.createdAt);
  const quarterEnd = new Date(Date.UTC(year, quarter * 3, 1) - 8 * 3600000);
  if (!Number.isFinite(createdAt.getTime()) || createdAt >= quarterEnd) return null;
  return { displayLabel: `历史稿：${year}年自然历第${quarter}季度（提前生成）`,
    periodClassification: 'premature_legacy_quarter',
    notice: `旧规则在自然年第${quarter}季度结束前生成了这份评估，不能作为完整季度结论，也不计入月度复盘。原文与审核记录保留供追溯；请以独立的月度复盘核对当月服务情况。` };
}

module.exports = { prematureCalendarQuarter };
