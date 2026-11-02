// Preserve audited source values while clarifying premature calendar-quarter labels.
function prematureCalendarQuarter(assessment) {
  const match = String(assessment?.periodKey || '').match(/^(\d{4})-Q([1-4])$/);
  if (!match || assessment?.templateSnapshot?.frequency !== 'quarterly') return null;
  const year = Number(match[1]), quarter = Number(match[2]);
  const createdAt = new Date(assessment.createdAt);
  const quarterEnd = new Date(Date.UTC(year, quarter * 3, 1) - 8 * 3600000);
  if (!Number.isFinite(createdAt.getTime()) || createdAt >= quarterEnd) return null;
  return { displayLabel: `历史自然年第${quarter}季度评估（提前生成，非服务第${quarter}季度）`,
    notice: `旧规则按自然年季度命名，并在该季度结束前生成；原评估窗口与结论保持历史原貌。请以独立月度复盘核对当月服务情况。` };
}

module.exports = { prematureCalendarQuarter };
