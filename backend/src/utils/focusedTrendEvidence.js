// Report-level names are evidence of an examination even when extraction produced
// no matching reportItems. Do not infer an examination from a recommendation in a note.
const EXAM_TOPICS = new Set([
  '心电图', '心脏超声', '冠脉CTA', '运动评估', '心脏磁共振',
  '颈动脉超声', '头颅MRI', '头颅MRA', '骨质疏松',
]);

function focusedReportHits(reports, topic, rule, referenceYear) {
  const cutoffYear = referenceYear - 4;
  return reports.flatMap((report, reportIndex) => {
    const date = String(report.checkDate || report.date || '').slice(0, 10);
    const year = Number(report.reportYear || date.slice(0, 4));
    if (!Number.isInteger(year) || year < cutoffYear || year > referenceYear) return [];
    const matched = (report.reportItems || []).filter(item => rule.test([
      item.name, item.sourceSection, item.orderName, item.bodyPart, item.modality,
      item.value, item.findings, item.diagnosis, item.conclusion,
    ].filter(Boolean).join(' ')));
    const reportLabel = [report.title, report.screeningL2, report.screeningL3]
      .filter(Boolean).join(' ');
    if (!matched.length && (!EXAM_TOPICS.has(topic) || !rule.test(reportLabel))) return [];
    const item = matched[0];
    const result = (item
      ? [item.diagnosis, item.conclusion, item.findings, item.value].filter(Boolean).join('；')
      : '') || String(report.examConclusion || '').trim();
    return [{
      date, year, name: item?.name || topic, result: result.slice(0, 120),
      evidenceId: `RPT-${String(reportIndex + 1).padStart(3, '0')}`,
      reportId: String(report._id || ''), matchedItems: matched,
    }];
  }).sort((a, b) => a.year - b.year || Date.parse(a.date) - Date.parse(b.date));
}

function reconcileFocusedTopics(topics, reports, rules, order, referenceYear) {
  const byName = new Map(topics.map(topic => [topic.name, topic]));
  for (const name of order) {
    const rule = rules[name];
    if (!rule) continue;
    const hits = focusedReportHits(reports, name, rule, referenceYear);
    if (!hits.length) continue;
    let topic = byName.get(name);
    if (!topic) {
      topic = { name, status: 'unknown', nextAction: '携带原始报告请医护人员核对。' };
      topics.push(topic);
      byName.set(name, topic);
    }
    const latest = hits[hits.length - 1];
    const years = [...new Set(hits.map(hit => hit.year))];
    topic.latest = `${latest.date || latest.year} ${latest.name}${latest.result ? `：${latest.result.slice(0, 80)}` : '：报告结论待核对'}`;
    // The model's prose can contain an obsolete "only one examination" claim.
    // Use a neutral, verifiable trend until the original reports are compared.
    const oldTrend = String(topic.trend || '');
    if (!years.every(year => oldTrend.includes(String(year))) || /仅.{0,8}(?:一次|1次)|无(?:相关)?记录|未见.{0,8}记录/.test(oldTrend)) {
      topic.trend = `${years.join('、')}年有${name}检查记录${hits.length > years.length ? `（共${hits.length}份）` : ''}；具体变化需对照原报告。`;
      topic.trendStatus = hits.length === 1 ? 'baseline' : 'not_comparable';
    } else if (hits.length === 1) {
      topic.trendStatus = 'baseline';
    } else if (['baseline', 'no_data'].includes(topic.trendStatus)) {
      topic.trendStatus = 'not_comparable';
    }
    topic.keyChanges = hits.slice(-3).map(hit =>
      `${hit.year}年${hit.name}${hit.result ? `：${hit.result.slice(0, 80)}` : '：报告结论待核对'}`);
    topic.evidenceIds = [...new Set(hits.map(hit => hit.evidenceId))];
  }
  return topics;
}

module.exports = { focusedReportHits, reconcileFocusedTopics };
