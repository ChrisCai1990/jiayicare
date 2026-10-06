const TOPIC_PATTERNS = [
  [/贫血|地中海|血红蛋白|铁蛋白|缺铁/, /贫血|地中海|血红蛋白|铁蛋白|转铁蛋白|红细胞/i],
  [/颈动脉|动脉斑块|动脉粥样/, /颈动脉|椎动脉|斑块|狭窄/i],
  [/肺结节|胸部影像|胸部CT/, /肺|胸部|低剂量CT/i],
  [/切缘|肠镜|息肉|病理/, /肠镜|结肠|病理|息肉|切缘|腺瘤/i],
  [/胃镜|胃炎|肠化/, /胃镜|胃窦|胃炎|肠化|胃病理/i],
];

function reportDate(report) { return String(report.checkDate || report.reportYear || '').slice(0, 10); }
function reportScore(report, query) {
  const title = String(report.title || '');
  const date = reportDate(report);
  let score = date && query.includes(date) ? 30 : 0;
  if (title.length >= 2 && query.includes(title)) score += 14;
  const relevant = TOPIC_PATTERNS.filter(([topic]) => topic.test(query)).map(([, reportPattern]) => reportPattern);
  if (relevant.some(pattern => pattern.test(title))) score += 10;
  const itemNames = (report.reportItems || []).map(item => String(item.name || ''));
  if (itemNames.some(name => name.length >= 2 && query.includes(name))) score += 8;
  if (relevant.some(pattern => itemNames.some(name => pattern.test(name)))) score += 6;
  return score;
}

function detailFor(report, query) {
  const relevant = TOPIC_PATTERNS.filter(([topic]) => topic.test(query)).map(([, reportPattern]) => reportPattern);
  const items = (report.reportItems || []).map(item => ({
    name: item.name, value: item.value, unit: item.unit, referenceRange: item.referenceRange,
    status: item.status, findings: item.findings, diagnosis: item.diagnosis, conclusion: item.conclusion,
  }));
  const selected = items.filter(item => query.includes(String(item.name || '')) && String(item.name || '').length >= 2
    || relevant.some(pattern => pattern.test(String(item.name || ''))));
  const fallback = selected.length ? selected : items.filter(item => ['abnormal', 'attention'].includes(item.status));
  return { date: reportDate(report), title: report.title, reportId: String(report._id),
    recordedItemCount: items.length, items: (fallback.length ? fallback : items).slice(0, 18).map(item => Object.fromEntries(
      Object.entries(item).filter(([, value]) => value !== undefined && value !== '' && value !== null)
        .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 450) : value]),
    )) };
}

function compileArchiveEvidence(reports, query, bloodPressure = []) {
  const text = String(query || '');
  const ranked = reports.map((report, index) => ({ report, index, score: reportScore(report, text) }))
    .filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 16);
  return {
    auditedReportCount: reports.length,
    reportIndex: reports.map(report => ({ date: reportDate(report), title: report.title, reportId: String(report._id),
      ...(report.fileUrl || report.fileUrls?.length ? { originalFileLinked: true } : {}) })),
    relevantReports: ranked.map(({ report }) => detailFor(report, text)),
    recentBloodPressure: bloodPressure.map(row => ({ date: row.recordedAt, value: row.value, unit: row.unit,
      systolic: row.extra?.sys, diastolic: row.extra?.dia })),
    readingRule: '报告索引代表已审核的档案记录，reportId仅为系统归档ID，不等于医院报告编号；详细结果仅列相关报告。索引未列出项目值不代表没有该值。图片识别和结构化报告项目须人工对照原件。已有结构化数值时应引用并注明人工复核，不得笼统称原始结果缺失。仅当档案确无具体所需字段时才能列为待补，并明确缺的是哪一字段；若报告已存但本轮未展开，应写待核对，不得写未提供。',
  };
}

function reconcileMissingAgainstEvidence(missing = [], evidence = {}) {
  const kept = [], found = [], actions = [];
  for (const item of missing) {
    const text = String(item || '').trim();
    const dates = text.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g) || [];
    const range = text.match(/(20\d{2})\s*[–—-]\s*(20\d{2})/);
    const patterns = TOPIC_PATTERNS.filter(([topic]) => topic.test(text)).map(([, pattern]) => pattern);
    if (!patterns.length) { kept.push(item); continue; }
    const detailed = new Set((evidence.relevantReports || []).filter(report => patterns.some(pattern =>
      pattern.test(`${report.title || ''} ${(report.items || []).map(row => row.name).join(' ')}`))).map(report => report.reportId));
    const matches = (evidence.reportIndex || []).filter(report => {
      const reportYear = Number(String(report.date || '').slice(0, 4));
      const dateMatch = dates.some(date => date.replace(/[/.]/g, '-') === report.date)
        || (range && reportYear >= Number(range[1]) && reportYear <= Number(range[2]));
      const topicMatch = detailed.has(report.reportId) || patterns.some(pattern => pattern.test(report.title || ''));
      return topicMatch && (dates.length || range ? dateMatch : true);
    });
    if (!matches.length) { kept.push(item); continue; }
    const labels = matches.slice(0, 6).map(report => `${report.date || '日期待核实'} ${report.title}`).join('、');
    found.push(`档案已收录相关已审核报告：${labels}${matches.length > 6 ? `等${matches.length}份` : ''}；已存报告不能视为未提供。`);
    actions.push(`核对已归档报告中特定字段及原件：${text}`);
  }
  return { missing: kept, found, actions };
}

async function loadAnnualCaseReviewEvidence(patientId, query) {
  const MedicalReport = require('../models/MedicalReport');
  const HealthRecord = require('../models/HealthRecord');
  const since = new Date(Date.now() - 7 * 86400000);
  const [reports, bloodPressure] = await Promise.all([
    MedicalReport.find({ user: patientId, audit_status: 'audited' }).sort({ checkDate: -1, createdAt: -1 })
      .select('_id title checkDate reportYear fileUrl fileUrls reportItems.name reportItems.value reportItems.unit reportItems.referenceRange reportItems.status reportItems.findings reportItems.diagnosis reportItems.conclusion').lean(),
    HealthRecord.find({ user: patientId, type: 'bloodPressure', recordedAt: { $gte: since }, deletedAt: null })
      .sort({ recordedAt: -1 }).limit(30).select('recordedAt value unit extra.sys extra.dia').lean(),
  ]);
  return compileArchiveEvidence(reports, query, bloodPressure);
}

async function reconcileMissingInfo(patientId, missing) {
  const evidence = await loadAnnualCaseReviewEvidence(patientId, missing.join('\n'));
  return reconcileMissingAgainstEvidence(missing, evidence);
}

module.exports = { compileArchiveEvidence, loadAnnualCaseReviewEvidence, reconcileMissingAgainstEvidence, reconcileMissingInfo };
