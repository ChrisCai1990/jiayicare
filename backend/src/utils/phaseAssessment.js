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

function templateAssessmentFromContent(content, assessment) {
  const titles = assessment?.templateSnapshot?.outputSections || [];
  const sections = titles.map(title => ({ title, items: [] }));
  let index = 0;
  String(content || '').split(/\r?\n/).forEach(raw => {
    const line = cleanLine(raw);
    if (!line) return;
    const headingIndex = titles.findIndex(title => line.includes(title));
    if (headingIndex >= 0) { index = headingIndex; return; }
    if (sections[index]) sections[index].items.push(line);
  });
  return {
    periodKey: assessment.periodKey, periodLabel: assessment.periodLabel,
    templateMatched: Boolean(assessment.templateId), templateId: assessment.templateId,
    templateName: assessment.templateSnapshot?.name || '阶段性评估模板',
    frequency: assessment.templateSnapshot?.frequency || '', customerPushEligible: Boolean(assessment.templateId),
    sections,
  };
}

const CLINICAL_RULES = [
  ['生命体征持续或明显异常', /(?:血压|血糖|血氧|心率).{0,18}(?:持续|明显|反复|升高|降低|异常|恶化)/],
  ['新发或加重症状', /(?:症状|胸痛|胸闷|呼吸困难|晕厥|头晕|水肿|疼痛).{0,18}(?:新发|加重|反复|持续|异常|明显)/],
  ['用药或不良反应问题', /(?:用药|药物|服药).{0,12}(?:调整|停用|漏服|依从性差|冲突|异常|副作用|不良反应)|(?:调整|停止|暂停).{0,6}(?:用药|药物|剂量)|(?:副作用|不良反应|停药|漏服|调整剂量)/],
  ['报告明确建议复查或就医', /(?:建议|需要|应).{0,10}(?:复查|就医|门诊|进一步检查)/],
  ['多项指标或资料存在临床冲突', /(?:多项指标|数据|结果|资料).{0,15}(?:冲突|无法解释|同期恶化)/],
];

function detectClinicalReview(content = '') {
  const text = String(content || '');
  return CLINICAL_RULES.filter(([, pattern]) => pattern.test(text)).map(([reason]) => reason);
}

function nextAssessmentStatus({ currentStatus, actorRole, action, clinicalRequired = false }) {
  const current = currentStatus === 'pending' ? 'nutrition_review' : currentStatus;
  if (current === 'nutrition_review' && actorRole === 'nutritionist') {
    if (action === 'return') return 'rejected';
    if (action === 'escalate' || clinicalRequired) return 'doctor_review';
    if (action === 'approve') return 'finalized';
  }
  if (current === 'doctor_review' && actorRole === 'familyDoctor') {
    if (action === 'return') return 'nutrition_review';
    if (action === 'approve') return 'finalized';
  }
  return null;
}

module.exports = { toStructuredAssessment, assessmentToPlainText, quarterPeriod, toTemplateSections, templateAssessmentFromContent, detectClinicalReview, nextAssessmentStatus };
