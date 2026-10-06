const TOPIC_PATTERNS = [
  [/贫血|地中海|血红蛋白|铁蛋白|缺铁/, /贫血|地中海|血红蛋白|铁蛋白|转铁蛋白|红细胞/i],
  [/颈动脉|颈部血管|动脉斑块|动脉粥样/, /颈动脉|颈部血管|椎动脉|斑块|狭窄/i],
  [/肺结节|肺部影像|胸部影像|胸部CT|肺部CT/, /肺|胸部|低剂量CT/i],
  [/切缘|肠镜|息肉|病理/, /肠镜|结肠|病理|息肉|切缘|腺瘤/i],
  [/胃镜|胃炎|肠化/, /胃镜|胃窦|胃炎|肠化|胃病理/i],
];

const entryFor = report => ({
  date: reportDate(report), title: String(report.title || ''),
  items: report.reportItems || report.items || [],
  originalFileLinked: !!(report.fileUrl || report.fileUrls?.length || report.originalFileLinked),
});
const reportText = report => `${report.title} ${(report.items || []).map(item => item.name || '').join(' ')}`;
const withinYear = report => {
  const at = new Date(`${report.date}T00:00:00+08:00`).getTime();
  return Number.isFinite(at) && at >= Date.now() - 365 * 86400000;
};

function reconcileKnownMissing(text, evidence, reports) {
  const archive = (reports?.length ? reports : evidence.relevantReports || []).map(entryFor);
  const found = [], actions = [], missing = [];
  if (/血压/.test(text) && /家庭|自测|记录|测量/.test(text)) {
    const days = Math.min(365, Number(text.match(/近\s*(\d+)\s*[天日]/)?.[1]) || 30);
    const recent = (evidence.recentBloodPressure || []).filter(row => new Date(row.date).getTime() >= Date.now() - days * 86400000);
    if (!recent.length) return null;
    found.push(`档案已收录近${days}天血压记录${recent.length}次；不能称为完全没有家庭血压记录。`);
    actions.push(`核对近${days}天血压原始记录是否完整，以及测量时间、部位和测量条件。`);
    return { found, actions, missing };
  }
  if (/颈(?:部)?(?:动脉|血管)|颈动脉|斑块/.test(text)) {
    const matches = archive.filter(row => /颈动脉|颈部血管|椎动脉/.test(reportText(row))).sort((a, b) => b.date.localeCompare(a.date));
    if (!matches.length) return null;
    const latest = matches[0];
    found.push(`档案已收录${latest.date} ${latest.title}${latest.originalFileLinked ? '及原件' : ''}；不能称为缺少最新颈部血管超声报告。`);
    actions.push('核对该报告原件中斑块性质及血流动力学具体参数；未载明的字段须明确标为未载明。');
    return { found, actions, missing };
  }
  if (/肺.*(?:影像|CT|结节)|胸部|肺结节/.test(text)) {
    const matches = archive.filter(row => /肺CT|胸部|低剂量CT/.test(row.title)).sort((a, b) => a.date.localeCompare(b.date));
    if (!matches.length) return null;
    const years = [...new Set(matches.map(row => row.date.slice(0, 4)).filter(Boolean))];
    found.push(`档案已收录${years.join('、')}年肺部影像报告${matches.length}份；不能称为缺少随访记录。`);
    actions.push('核对既有肺部影像报告中的首次发现时间、最大径、实性成分描述及最近复查日期；原件未量化的内容不得推定。');
    return { found, actions, missing };
  }
  if (/血脂|LDL|non-?HDL|Apo\s*B|Lp\(?a\)?|hs-?CRP|脂蛋白/i.test(text)) {
    const rows = archive.filter(withinYear).flatMap(report => (report.items || []).map(item => ({ date: report.date, name: String(item.name || '').trim(), value: item.value })));
    const field = pattern => rows.find(row => pattern.test(row.name) && row.value !== undefined && row.value !== '');
    const ldl = field(/^(?:低密度脂蛋白胆固醇|LDL-C)$/i);
    const apoB = field(/载脂蛋白\s*B|^Apo\s*B$/i);
    const lpa = field(/脂蛋白\s*[（(]?a[）)]?|^Lp\s*[（(]?a[）)]?$/i);
    const nonHdl = field(/非高密度脂蛋白胆固醇|non-?HDL/i);
    const crp = field(/超敏.*C.*反应蛋白|高敏.*C.*反应蛋白|hs-?CRP/i);
    const total = field(/^总胆固醇$/), hdl = field(/^高密度脂蛋白胆固醇$/);
    const existing = [['LDL-C', ldl], ['ApoB', apoB], ['Lp(a)', lpa], ['non-HDL-C', nonHdl], ['hs-CRP', crp]]
      .filter(([, row]) => row).map(([name, row]) => `${name}（${row.date}）`);
    if (!existing.length && !(total && hdl && total.date === hdl.date)) return null;
    found.push(`近一年已审核档案可定位：${existing.join('、') || '总胆固醇与HDL-C'}；不能称为整套血脂资料缺失。`);
    if (!nonHdl && total && hdl && total.date === hdl.date) actions.push(`non-HDL-C未单列；可由${total.date}同次总胆固醇与HDL-C核算，需人工核对单位。`);
    if (!crp && /hs-?CRP|超敏.*反应蛋白/i.test(text)) missing.push('近一年已审核结构化档案未定位到hs-CRP结果；请先核对既有原始报告是否载明。');
    actions.push('逐项核对既有血脂报告原件；不同检查日期的结果应分别标注，不拼成同一次检测。');
    return { found, actions, missing };
  }
  return null;
}

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

function reconcileMissingAgainstEvidence(missing = [], evidence = {}, reports = []) {
  const kept = [], found = [], actions = [];
  for (const item of missing) {
    const text = String(item || '').trim();
    const known = reconcileKnownMissing(text, evidence, reports);
    if (known) {
      kept.push(...known.missing); found.push(...known.found); actions.push(...known.actions);
      continue;
    }
    const dates = text.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g) || [];
    const range = text.match(/(20\d{2})\s*[–—-]\s*(20\d{2})/);
    const patterns = TOPIC_PATTERNS.filter(([topic]) => topic.test(text)).map(([, pattern]) => pattern);
    if (!patterns.length) { kept.push(`档案中待核对是否已有：${text}`); continue; }
    const detailed = new Set((evidence.relevantReports || []).filter(report => patterns.some(pattern =>
      pattern.test(`${report.title || ''} ${(report.items || []).map(row => row.name).join(' ')}`))).map(report => report.reportId));
    const matches = (evidence.reportIndex || []).filter(report => {
      const reportYear = Number(String(report.date || '').slice(0, 4));
      const dateMatch = dates.some(date => date.replace(/[/.]/g, '-') === report.date)
        || (range && reportYear >= Number(range[1]) && reportYear <= Number(range[2]));
      const topicMatch = detailed.has(report.reportId) || patterns.some(pattern => pattern.test(report.title || ''));
      return topicMatch && (dates.length || range ? dateMatch : true);
    });
    if (!matches.length) { kept.push(`档案中待核对是否已有：${text}`); continue; }
    const labels = matches.slice(0, 6).map(report => `${report.date || '日期待核实'} ${report.title}`).join('、');
    found.push(`档案已收录相关已审核报告：${labels}${matches.length > 6 ? `等${matches.length}份` : ''}；已存报告不能视为未提供。`);
    actions.push(`核对已归档报告中特定字段及原件：${text}`);
  }
  return { missing: kept, found, actions };
}

async function loadRawAnnualEvidence(patientId, query) {
  const MedicalReport = require('../models/MedicalReport');
  const HealthRecord = require('../models/HealthRecord');
  const requestedDays = [...String(query || '').matchAll(/近\s*(\d+)\s*[天日]/g)].map(match => Number(match[1]));
  const since = new Date(Date.now() - Math.min(365, Math.max(30, ...requestedDays)) * 86400000);
  const [reports, bloodPressure] = await Promise.all([
    MedicalReport.find({ user: patientId, audit_status: 'audited' }).sort({ checkDate: -1, createdAt: -1 })
      .select('_id title checkDate reportYear fileUrl fileUrls reportItems.name reportItems.value reportItems.unit reportItems.referenceRange reportItems.status reportItems.findings reportItems.diagnosis reportItems.conclusion').lean(),
    HealthRecord.find({ user: patientId, type: 'bloodPressure', recordedAt: { $gte: since }, deletedAt: null })
      .sort({ recordedAt: -1 }).limit(1000).select('recordedAt value unit extra.sys extra.dia').lean(),
  ]);
  return { reports, bloodPressure };
}

async function loadAnnualCaseReviewEvidence(patientId, query) {
  const { reports, bloodPressure } = await loadRawAnnualEvidence(patientId, query);
  return compileArchiveEvidence(reports, query, bloodPressure);
}

async function reconcileMissingInfo(patientId, missing) {
  const query = missing.join('\n');
  const { reports, bloodPressure } = await loadRawAnnualEvidence(patientId, query);
  return reconcileMissingAgainstEvidence(missing, compileArchiveEvidence(reports, query, bloodPressure), reports);
}

module.exports = { compileArchiveEvidence, loadAnnualCaseReviewEvidence, reconcileMissingAgainstEvidence, reconcileMissingInfo };
