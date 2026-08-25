const SECTION_RULES = [
  ['summary', /核心结论|总体评估|评估结论/],
  ['facts', /已确认事实|健康现状|客观事实/],
  ['changes', /阶段变化|管理成效|执行情况|趋势/],
  ['risks', /风险提醒|重点风险|异常问题/],
  ['actions', /建议行动|下一步|行动计划|管理建议/],
  ['missing', /缺失信息|待补信息|数据缺口/],
];

function cleanLine(value = '') {
  return String(value).replace(/^\s*(?:#{1,6}\s*|[-*+]\s+|\d+[.、]\s*)/, '').replace(/\*\*|__|`/g, '').trim();
}

function toStructuredAssessment(content, title = '阶段性健康评估') {
  const result = { title: cleanLine(title), summary: [], facts: [], changes: [], risks: [], actions: [], missing: [] };
  let section = 'summary';
  String(content || '').split(/\r?\n/).forEach(raw => {
    const line = cleanLine(raw);
    if (!line || /^[-—_]{3,}$/.test(line)) return;
    const heading = SECTION_RULES.find(([, pattern]) => pattern.test(line) && line.length <= 24);
    if (heading) { section = heading[0]; return; }
    result[section].push(line);
  });
  Object.keys(result).forEach(key => {
    if (Array.isArray(result[key])) result[key] = [...new Set(result[key])].slice(0, key === 'actions' ? 8 : 6);
  });
  if (!result.summary.length) result.summary = result.facts.slice(0, 2);
  return result;
}

function assessmentToPlainText(data) {
  const labels = { summary: '核心结论', facts: '已确认事实', changes: '阶段变化', risks: '重点风险', actions: '下一步行动', missing: '待补信息' };
  return Object.entries(labels).flatMap(([key, label]) => {
    const rows = data?.[key] || [];
    return rows.length ? [label, ...rows.map(item => `• ${item}`)] : [];
  }).join('\n');
}

function quarterPeriod(now = new Date()) {
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return { key: `${year}-Q${quarter}`, label: `${year}年第${quarter}季度`, year, quarter };
}

function toTemplateSections(data, template, period = quarterPeriod()) {
  const fallback = ['本期目标与已确认数据', '管理执行与依从性', '成效、异常与数据缺口', '下一阶段待审核计划'];
  const outputSections = Array.isArray(template?.content?.outputSections) && template.content.outputSections.length === 4
    ? template.content.outputSections : fallback;
  const groups = [
    [...(data?.summary || []), ...(data?.facts || [])],
    [...(data?.changes || [])],
    [...(data?.risks || []), ...(data?.missing || [])],
    [...(data?.actions || [])],
  ];
  return {
    periodKey: period.key, periodLabel: period.label, year: period.year, quarter: period.quarter,
    templateMatched: Boolean(template), templateId: template?._id || null, templateName: template?.name || '未匹配阶段性评估模板',
    customerPushEligible: Boolean(template),
    sections: outputSections.map((title, index) => ({ title, items: [...new Set(groups[index])].slice(0, 10) })),
  };
}

module.exports = { toStructuredAssessment, assessmentToPlainText, quarterPeriod, toTemplateSections };
