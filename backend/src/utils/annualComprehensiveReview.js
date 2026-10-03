const TOPICS = [
  '问题来源：核对健康顾问从筛查结果与5年趋势纳入的问题，以及AI风险提示；逐项标注证据、时间和来源。',
  '问题筛选：合并重复项，区分已确认事实、待核实风险与不纳入事项，明确优先级。',
  '专业去向：判断哪些需要专科进一步评估、就医或诊治意见，哪些需交营养师评估生活方式，哪些适合观察随访；同一问题可双向协作。',
  '医疗管理目标：对证据充分的医疗问题拟定目标、完成标准和复评时间；缺少基线或专科意见时列为待确认。',
  '客户沟通准备：说明问题依据、待获取的专科意见、客户需要参与确认的目标和行动限制。',
  '年度方案交接：仅将客户确认后的目标和协作安排带入年度方案；营养师另行制定并发出具体营养干预方案。',
];

const titleForYear = year => `${year}年度综合研判`;
const descriptionForYear = year => `${year}年度方案制定前的综合研判。请围绕以下固定议题讨论，引用已审核资料和专业评估，不重复录入原始数据；结论由健康顾问逐项核实后确认。\n${TOPICS.map((topic, index) => `${index + 1}. ${topic}`).join('\n')}`;
const outputGuide = '按六项固定议题输出：来源、筛选、专科/营养/随访去向、医疗目标、客户沟通点和年度方案交接。营养相关只写转营养师评估，不制定具体营养方案；区分已确认与待确认，不编造检查值或诊断。';

function annualReviewForYear(reviews = [], year) {
  return reviews.find(item => item.reviewType === 'annual' && item.annualPlanYear && Number(item.annualPlanYear) === Number(year));
}

function suggestedRiskConcerns(assessment, year) {
  if (!assessment?.approvedAt) return [];
  return (assessment.dimensions || []).filter(row => ['medium', 'high', 'critical'].includes(row.level) && row.key).map(row => ({
    key: `ai_risk:${year}:${row.key}`, kind: 'ai_risk_scan', title: String(row.label || row.key),
    evidence: [row.level, ...(row.factors || []), row.advice].filter(Boolean).join('；').slice(0, 600),
    source: { year, dimensionKey: row.key, approvedAt: assessment.approvedAt },
    status: 'suggested', pathway: 'undecided', includedByName: '已审核AI风险扫描', includedAt: new Date(),
  }));
}

module.exports = { TOPICS, titleForYear, descriptionForYear, outputGuide, annualReviewForYear, suggestedRiskConcerns };
