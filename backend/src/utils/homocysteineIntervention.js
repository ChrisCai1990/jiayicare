// 年度心脑血管趋势卡的业务阈值：最近一次有效同型半胱氨酸结果达到 10 μmol/L 即需干预。
const HOMOCYSTEINE_INTERVENTION_THRESHOLD = 10;
const { priorityLinksToCard } = require('./healthPriorityLinks');

function enforceHomocysteineIntervention(topics, reports) {
  const results = reports.flatMap(report => (report.reportItems || [])
    .filter(item => /同型半胱氨酸|\bHcy\b/i.test(String(item.name || '')))
    .map(item => ({ report, item })));
  const measurements = results.map(({ report, item }) => {
    const raw = String(item.value ?? '').trim();
    const unit = String(item.unit || '').trim();
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(?:μmol\/L|µmol\/L|umol\/L)?$/i);
    if (!match || (unit && !/^(?:μmol\/L|µmol\/L|umol\/L)$/i.test(unit))) return null;
    return { value: Number(match[1]), date: String(report.checkDate || report.date || report.reportYear || '').slice(0, 10) };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const latest = measurements.at(-1);
  if (!latest || latest.value < HOMOCYSTEINE_INTERVENTION_THRESHOLD) return false;
  let topic = topics.find(item => item.name === '同型半胱氨酸');
  if (!topic) {
    const values = measurements.map(point => point.value);
    const trendStatus = values.length === 1 ? 'baseline'
      : values.every(value => value === values[0]) ? 'stable'
        : values.every((value, index) => index === 0 || value >= values[index - 1]) ? 'worsening'
          : values.every((value, index) => index === 0 || value <= values[index - 1]) ? 'improving' : 'fluctuating';
    topic = { name: '同型半胱氨酸', trendStatus,
      latest: `${latest.date} 同型半胱氨酸：${latest.value} μmol/L`,
      trend: '最近一次检测值达到需干预阈值', keyChanges: [], evidenceIds: [] };
    topics.push(topic);
  }
  topic.status = 'attention';
  topic.nextAction = `同型半胱氨酸${latest.value} μmol/L，达到需干预阈值（≥${HOMOCYSTEINE_INTERVENTION_THRESHOLD} μmol/L）；请携带原始报告由医生评估具体干预方式及复查安排。`;
  return true;
}

function correctHomocysteineCard(record, reports) {
  const section = record.sections?.cardiovascular_risk;
  if (!section || !Array.isArray(section.topics)) return null;
  if (!enforceHomocysteineIntervention(section.topics, reports)) return null;
  const card = section.topics.find(item => item.name === '同型半胱氨酸');
  const lead = `${card.nextAction}`;
  const previousHeadline = String(section.overview?.headline || '').trim();
  const headline = previousHeadline && !/同型半胱氨酸|\bHcy\b/i.test(previousHeadline)
    ? `${lead} ${previousHeadline}` : lead;
  const needsAttention = item => ['attention', 'abnormal', 'worsening'].includes(item.status) || item.trendStatus === 'worsening';
  section.overview = { ...(section.overview || {}), headline,
    attentionCount: section.topics.filter(needsAttention).length,
    stableCount: section.topics.filter(item => ['normal', 'stable'].includes(item.status)).length };
  section.summary = headline;

  const priority = record.sections.medical_priority || { items: [] };
  const existing = Array.isArray(priority.items) ? priority.items : [];
  const linked = existing.findIndex(item => priorityLinksToCard(item, 'cardiovascular_risk', card.name));
  const concern = { ...(linked >= 0 ? existing[linked] : {}), name: '同型半胱氨酸需干预',
    current: card.latest || '', meaning: `最近一次有效检测值达到本服务需干预阈值（≥${HOMOCYSTEINE_INTERVENTION_THRESHOLD} μmol/L）`,
    action: card.nextAction, department: '', urgency: 'medium',
    sourceSectionKey: 'cardiovascular_risk', sourceItemName: card.name,
    sourceReportId: card.sourceReportId || (linked >= 0 ? existing[linked].sourceReportId : null) || null };
  const items = [...existing];
  if (linked >= 0) items[linked] = concern;
  else items.push(concern);
  record.sections.medical_priority = { ...priority, items };
  record.sectionReviews = { ...(record.sectionReviews || {}), medical_priority: {
    ...(record.sectionReviews?.medical_priority || {}), status: 'draft' } };
  return { card, overview: section.overview };
}

module.exports = { HOMOCYSTEINE_INTERVENTION_THRESHOLD, enforceHomocysteineIntervention, correctHomocysteineCard };
