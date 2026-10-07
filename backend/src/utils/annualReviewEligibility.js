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
    if (report.audit_status !== 'audited' || excludedCategories.has(report.documentCategory)) continue;
    const date = day(report.checkDate || report.date);
    if (!date) continue;
    if (!batches.has(date)) batches.set(date, []);
    batches.get(date).push(report);
  }
  return [...batches.values()].flatMap(batch => {
    const explicit = batch.some(r => r.documentCategory === 'physical_exam' || (!r.documentCategory && r.type === 'annual') || /年度.{0,6}体检报告|全面体检|健康体检报告/.test(r.title || ''));
    const items = batch.flatMap(r => r.reportItems || []);
    const titles = new Set(batch.map(r => String(r.title || '').trim()).filter(Boolean));
    const text = batch.flatMap(r => [r.title, r.screeningL1, r.screeningL2, r.screeningCategory,
      ...(r.reportItems || []).flatMap(i => [i.name, i.orderName, i.sourceSection])]).filter(Boolean).join(' ');
    const domains = medicalDomainRules.filter(rule => rule.test(text)).length;
    return explicit || (items.length >= 8 && domains >= 4) || (batch.length >= 5 && titles.size >= 5 && domains >= 3) ? batch : [];
  });
}
function eligibility(reports, now = new Date()) {
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0,10);
  const [y,m,d] = today.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y-1,m-1,Math.min(d,new Date(Date.UTC(y-1,m,0)).getUTCDate()))).toISOString().slice(0,10);
  const latest = examReports(reports)
    .map(r => ({ reportId: String(r._id || ''), date: day(r.checkDate || r.date) }))
    .filter(r => r.date && r.date <= today).sort((a,b) => b.date.localeCompare(a.date))[0];
  return { allowed: Boolean(latest && latest.date >= cutoff), latest: latest || null, cutoff,
    message: '近12个月内没有已审核的有效体检资料，请先完成体检并录入审核后，再发起年度管理研判。' };
}
async function check(patientId) {
  const reports = await require('../models/MedicalReport').find({ user: patientId, audit_status: 'audited' })
    .select('_id title type documentCategory checkDate date audit_status screeningL1 screeningL2 screeningCategory reportItems.name reportItems.orderName reportItems.sourceSection').lean();
  return eligibility(reports);
}
module.exports = { day, examReports, eligibility, check };
