// Annual review requires a reviewed physical exam, not merely a recent upload.
function day(value) {
  const m = String(value || '').match(/^(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d.toISOString().slice(0,10) : '';
}
// Same-day split reports use the existing health portrait coverage rules.
// Clinical notes, prescriptions and questionnaires cannot form an exam batch.
const excludedCategories = new Set(['outpatient_record', 'inpatient_record', 'prescription_order', 'questionnaire', 'body_composition', 'functional_medicine', 'genetic_test']);
const medicalDomainRules = [
    /血常规|红细胞|白细胞|血红蛋白|血小板|凝血/,
    /生化|肝功能|转氨酶|胆红素|白蛋白|肾功能|肌酐|尿素|尿酸|血脂|胆固醇|甘油三酯|血糖|糖化血红蛋白/,
    /尿常规|尿检|尿蛋白|尿潜血|尿比重/,
    /心电图|心脏超声|肌钙蛋白|BNP|脑钠肽|颈动脉|血压/,
    /腹部超声|肝胆胰脾|肝脏超声|胆囊超声|胰腺超声|脾脏超声/,
    /甲状腺|内分泌|甲功|维生素D/,
    /前列腺|子宫|附件|卵巢|宫颈|妇科/,
    /肿瘤标志物|甲胎蛋白|癌胚抗原|CA\d|PSA/,
    /胸片|胸部CT|肺功能|肺部|呼吸/,
    /胃镜|肠镜|幽门螺杆菌|呼气试验|消化/,
    /乙肝|丙肝|梅毒|HIV|EB病毒|感染/,
    /眼科|视力|眼底|耳鼻喉|听力|口腔/,
];
function examReports(reports) {
  const batches = new Map();
  for (const report of reports) {
    if (report.audit_status !== 'audited' || report.archiveOnly || excludedCategories.has(report.documentCategory)) continue;
    const date = day(report.checkDate || report.date);
    if (!date) continue;
    if (!batches.has(date)) batches.set(date, []);
    batches.get(date).push(report);
  }
  return [...batches.values()].flatMap(batch => {
    const items = batch.flatMap(r => r.reportItems || []);
    const titles = new Set(batch.map(r => String(r.title || '').trim()).filter(Boolean));
    const text = batch.flatMap(r => [r.title, r.screeningL1, r.screeningL2, r.screeningCategory,
      ...(r.reportItems || []).flatMap(i => [i.name, i.orderName, i.sourceSection])]).filter(Boolean).join(' ');
    const domains = medicalDomainRules.filter(rule => rule.test(text)).length;
    // Historical imports may call a single specialty test "annual" or even
    // classify it as physical_exam. A title/category alone cannot establish a
    // comprehensive checkup; require a whole-exam conclusion or broad coverage.
    const wholeExamConclusion = batch.some(r => /体检|总检|健康检查/.test(r.title || '')
      && (String(r.examConclusion || r.examDescription || '').trim()
        || Object.values(r.examMainConclusions || {}).some(Boolean)));
    const coreCoverage = [medicalDomainRules[0], medicalDomainRules[2], medicalDomainRules[3], medicalDomainRules[4]]
      .filter(rule => rule.test(text)).length;
    const broadCoverage = domains >= 4 && coreCoverage >= 3
      && (items.length >= 8 || (batch.length >= 5 && titles.size >= 5));
    return wholeExamConclusion || broadCoverage ? batch : [];
  });
}
function eligibility(reports, now = new Date(), options = {}) {
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0,10);
  const [y,m,d] = today.split('-').map(Number);
  const lookbackMonths = options.lookbackMonths === 3 ? 3 : 12;
  const targetMonth = y * 12 + m - 1 - lookbackMonths;
  const cutoffYear = Math.floor(targetMonth / 12);
  const cutoffMonth = targetMonth % 12;
  const cutoff = new Date(Date.UTC(cutoffYear,cutoffMonth,Math.min(d,new Date(Date.UTC(cutoffYear,cutoffMonth+1,0)).getUTCDate()))).toISOString().slice(0,10);
  const exams = examReports(reports);
  const examIds = new Set(exams.map(report => String(report._id || '')));
  const recentIncomplete = reports.filter(report => report.audit_status === 'audited' && !report.archiveOnly
    && !excludedCategories.has(report.documentCategory) && /体检|总检|健康检查/.test(report.title || '')
    && day(report.checkDate || report.date) >= cutoff && day(report.checkDate || report.date) <= today
    && !examIds.has(String(report._id || '')))
    .sort((a, b) => day(b.checkDate || b.date).localeCompare(day(a.checkDate || a.date))
      || (b.reportItems || []).length - (a.reportItems || []).length)[0];
  const latest = exams
    .map(r => ({ reportId: String(r._id || ''), date: day(r.checkDate || r.date) }))
    .filter(r => r.date && r.date <= today).sort((a,b) => b.date.localeCompare(a.date))[0];
  const recent = Boolean(latest && latest.date >= cutoff);
  const batch = recent ? exams.filter(r => day(r.checkDate || r.date) === latest.date) : [];
  const hasCompleteContent = batch.some(r => (r.reportItems || []).length >= 8 ||
    String(r.examConclusion || r.examDescription || '').trim() || Object.values(r.examMainConclusions || {}).some(Boolean))
    || batch.reduce((count, r) => count + (r.reportItems || []).length, 0) >= 5;
  const pending = recent ? exams.filter(r => day(r.checkDate || r.date) === latest.date &&
    require('./reportFollowUpSource').needsAdvisorInterpretation(r) && !r.advisorInterpretationConfirmedAt) : [];
  return { allowed: recent && hasCompleteContent && pending.length === 0, latest: latest || null, cutoff,
    problemReportId: !recent && recentIncomplete ? String(recentIncomplete._id || '') : '',
    pendingInterpretation: pending.map(r => String(r._id || '')),
    message: !recent ? (recentIncomplete
      ? `${day(recentIncomplete.checkDate || recentIncomplete.date)}的已审核“体检报告”未达到完整体检判定条件（需多系统检查覆盖或总检结论）；${latest ? `最近符合条件的完整体检为${latest.date}，早于本次要求的${cutoff}` : `目前没有符合条件的完整体检，需补充${cutoff}之后的资料`}。请核对该报告并补齐完整体检资料。`
      : latest ? `最近一份已审核的完整体检日期为${latest.date}，早于本次要求的${cutoff}；请补充近期完整体检并完成审核、解读后再生成年度方案。`
      : `近${lookbackMonths}个月内没有已审核的完整体检资料，请先完成体检并录入审核后，再生成年度方案。`)
      : !hasCompleteContent ? '本次体检报告缺少可解读的完整检查内容，请补齐解析和审核后再生成年度方案。'
        : '本次体检资料尚未全部完成健康顾问解读，请全部解读确认后再生成年度方案。' };
}
async function check(patientId, options = {}) {
  const reports = await require('../models/MedicalReport').find({ user: patientId, audit_status: 'audited', archiveOnly: { $ne: true } })
    .select('_id title type documentCategory checkDate date audit_status screeningL1 screeningL2 screeningCategory reportItems.name reportItems.orderName reportItems.sourceSection examDescription examConclusion examMainConclusions advisorInterpretationConfirmedAt').lean();
  return eligibility(reports, options.now || new Date(), options);
}
module.exports = { day, examReports, eligibility, check };
