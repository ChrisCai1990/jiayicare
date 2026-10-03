const TOPICS = [
  '逐个问题：每个具体问题或风险维度分别核对来源、五年趋势、已确认事实与待核实点。',
  '关联判断：分析问题彼此之间及与五年趋势之间有证据支持的联系，不把共存当作因果。',
  '专业去向：在每个问题下判断是否需要专科评估、就医意见、营养师评估或随访复评。',
  '医疗管理目标：在每个问题下拟定有依据的目标、完成标准和复评时间；缺少基线或专科意见时标为待确认。',
  '客户沟通与年度交接：说明待补资料及客户需确认的目标，最后汇总年度优先级和协作安排。营养师另行制定并发出具体营养干预方案。',
];

const titleForYear = year => `${year}年度综合研判`;
const descriptionForYear = year => `${year}年度方案制定前的综合研判。请围绕以下固定议题讨论，引用已审核资料和专业评估，不重复录入原始数据；结论由健康顾问逐项核实后确认。\n${TOPICS.map((topic, index) => `${index + 1}. ${topic}`).join('\n')}`;
const outputGuide = '按问题逐项输出依据与趋势、当前判断、与其他问题的关联、专业去向、医疗管理目标、客户沟通与待补信息；最后汇总问题之间的关联、优先级和年度方案衔接。营养相关只写转营养师评估，不制定具体营养方案；区分已确认与待确认，不编造检查值或诊断。';

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

function reviewedChronicConcerns(summary, year, healthRiskTags = {}) {
  const entry = summary?.byYear?.[String(year)] || (!summary?.byYear && summary?.sections ? summary : null);
  const records = Array.isArray(entry?.records) ? entry.records : entry?.sections ? [entry] : [];
  const record = records.find(row => (row.scope === 'doctor' || row.scope === 'all' || !row.scope) && (row.doctorApprovedAt || row.approvedAt));
  const section = record && (!record.sectionReviews?.chronic_disease || record.sectionReviews.chronic_disease.status === 'approved')
    ? record.sections?.chronic_disease : null;
  const concerns = (section?.items || []).filter(row => row.name && ['abnormal', 'mild_abnormal'].includes(row.status)).map(row => ({
    key: `ai_health:${year}:chronic_disease:${String(row.name).trim()}`, kind: 'ai_health_trend', title: String(row.name).trim(),
    evidence: [row.latest || row.current || row.value, row.trend, ...(row.keyChanges || []), row.meaning || row.riskBasis || row.note].filter(Boolean).join('；').slice(0, 600),
    source: { year, sectionKey: 'chronic_disease', approvedAt: record.doctorApprovedAt || record.approvedAt,
      reportIds: [...new Set([row.sourceReportId, ...(section.sourceReportIds || [])].filter(Boolean).map(String))] },
    status: 'suggested', pathway: 'undecided', includedByName: '已审核5年健康趋势（慢病）', includedAt: new Date(),
  }));
  if (healthRiskTags?.status === 'reviewed') {
    const names = new Set(concerns.map(row => row.title));
    for (const name of healthRiskTags.chronic_disease || []) {
      const title = String(name || '').trim();
      if (!title || names.has(title)) continue;
      names.add(title);
      concerns.push({ key: `chronic_tag:${year}:${title}`, kind: 'reviewed_chronic_tag', title,
        evidence: `已审核的慢病关注标签：${title}；请核对诊断依据及当前管理状态`,
        source: { year, reviewedAt: healthRiskTags.reviewedAt }, status: 'suggested', pathway: 'undecided',
        includedByName: '已审核慢病关注标签', includedAt: new Date() });
    }
  }
  return { sourceStatus: section || healthRiskTags?.status === 'reviewed' ? 'reviewed' : record ? 'missing' : 'unreviewed', concerns };
}

module.exports = { TOPICS, titleForYear, descriptionForYear, outputGuide, annualReviewForYear, suggestedRiskConcerns, reviewedChronicConcerns };
