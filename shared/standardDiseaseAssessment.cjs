// Only transcribe an explicit, reviewed report category. This module does not
// infer a diagnosis or turn an imaging risk category into a health-score grade.
// Bump this version whenever matching logic or a referenced standard changes.
// Old clinician confirmations then become stale and require renewed review.
const { RULE_VERSION, standards: standardRegistry } = require('./clinicalStandards.cjs');
const registered = Object.fromEntries(standardRegistry.map(item => [item.id, item]));
const STANDARDS = {
  thyroid: [
    { name: 'C-TIRADS', version: registered['c-tirads'].version, url: registered['c-tirads'].sourceUrl, pattern: /C[\s-]*TI[\s-]*RADS\s*(?:分级|分类|等级|为|：|:)?\s*([1-6](?:[ABCabc])?)\s*(?:类|级)?/gi, valid: /^(?:[1-3]|4[ABC]|[56])$/ },
    { name: 'ACR TI-RADS', version: registered['acr-tirads'].version, url: registered['acr-tirads'].sourceUrl, pattern: /(?:ACR[\s-]*TI[\s-]*RADS\s*(?:TR\s*)?|\bTR\s*)(?:分级|分类|等级|为|：|:)?\s*([1-5])\s*(?:类|级)?/gi, valid: /^[1-5]$/ },
  ],
  breast: [
    { name: 'BI-RADS', version: registered['bi-rads'].version, url: registered['bi-rads'].sourceUrl, pattern: /BI[\s-]*RADS\s*(?:分级|分类|等级|为|：|:)?\s*([0-6](?:[ABCabc])?)\s*(?:类|级)?/gi, valid: /^(?:[0-3]|4[ABC]?|[5-6])$/ },
  ],
  lung: [
    { name: 'Lung-RADS', version: registered['lung-rads'].version, url: registered['lung-rads'].sourceUrl, pattern: /Lung[\s-]*RADS\s*(?:分级|分类|等级|为|：|:)?\s*([0-4](?:[ABXabx])?)\s*(?:类|级)?/gi, valid: /^(?:[0-3]|4[ABX]?)$/ },
  ],
};

function diseaseKind(name) {
  if (/甲状腺.*(?:结节|囊肿)/.test(name)) return 'thyroid';
  if (/(?:乳腺|乳房)/.test(name)) return 'breast';
  if (/肺.*(?:结节|磨玻璃)/.test(name)) return 'lung';
  return null;
}

function evidenceText(item) {
  return [item?.name, item?.bodyPart, item?.value, item?.diagnosis, item?.conclusion].filter(Boolean).join(' ');
}

function matchesAssessment(result, saved) {
  return !!result && result.status === 'suggested' && !!saved &&
    String(saved.reportId || '') === result.reportId && Number(saved.reportRevision) === result.reportRevision &&
    String(saved.reportDate || '') === result.reportDate && String(saved.standard || '') === result.standard &&
    String(saved.category || '') === result.category && String(saved.evidence || '') === result.evidence &&
    String(saved.ruleVersion || '') === result.ruleVersion && String(saved.version || '') === result.version;
}

function assessOne(disease, reports) {
  const kind = diseaseKind(disease);
  const base = { disease, status: 'pending', label: '待评估', reason: '暂无适用的自动分级规则或已核对的关键证据' };
  if (!kind) {
    if (/HPV/i.test(disease)) base.reason = 'HPV检测结果需要按基因型及后续检查分流，不能直接换算成轻中重';
    return base;
  }
  const relevant = (reports || []).filter(report => {
    const title = `${report.title || ''} ${report.screeningL2 || ''}`;
    return (report.reportItems || []).some(item => {
      const name = `${item.name || ''} ${item.bodyPart || ''}`;
      return kind === 'thyroid' ? /甲状腺/.test(name) : kind === 'breast' ? /乳腺|乳房/.test(name) : /肺|胸部/.test(name);
    }) || (kind === 'thyroid' ? /甲状腺/.test(title) : kind === 'breast' ? /乳腺|乳房/.test(title) : /肺|胸部/.test(title));
  }).sort((a, b) => String(b.checkDate || b.date || b.createdAt || '').localeCompare(String(a.checkDate || a.date || a.createdAt || '')));
  if (!relevant.length) return base;
  const latestDate = String(relevant[0].checkDate || relevant[0].date || relevant[0].createdAt || '');
  const latest = relevant.filter(report => String(report.checkDate || report.date || report.createdAt || '') === latestDate);
  if (latest.some(report => report.audit_status !== 'audited' || report.familyDoctorAudit?.status !== 'audited')) {
    return { ...base, reason: '最新相关报告尚未完成双重审核' };
  }
  const hits = [];
  let ambiguousRange = false;
  for (const report of latest) {
    for (const item of report.reportItems || []) {
      const name = `${item.name || ''} ${item.bodyPart || ''}`;
      const title = `${report.title || ''} ${report.screeningL2 || ''}`;
      const belongs = (kind === 'thyroid' ? /甲状腺/.test(name) : kind === 'breast' ? /乳腺|乳房/.test(name) : /肺|胸部/.test(name)) ||
        ((report.reportItems || []).length === 1 && (kind === 'thyroid' ? /甲状腺/.test(title) : kind === 'breast' ? /乳腺|乳房/.test(title) : /肺|胸部/.test(title)));
      if (!belongs) continue;
      const text = evidenceText(item);
      for (const standard of STANDARDS[kind]) {
        for (const match of text.matchAll(standard.pattern)) {
          const category = match[1].toUpperCase();
          if (/^\s*[-~～至到/]\s*[0-9]/.test(text.slice((match.index || 0) + match[0].length))) { ambiguousRange = true; continue; }
          if (standard.valid.test(category)) hits.push({ standard: standard.name, version: standard.version, ruleVersion: RULE_VERSION, url: standard.url, category, reportId: String(report._id || ''), reportRevision: Number(report.reviewRevision || 0), reportTitle: report.title || '已审核报告', reportDate: latestDate, itemName: item.name || '', evidence: match[0] });
        }
      }
    }
  }
  if (ambiguousRange) return { ...base, reason: '报告写有分级范围，需人工核对具体病灶类别' };
  if (!hits.length) return { ...base, reason: '最新已审核报告未明确写出受支持的标准分级' };
  const unique = new Set(hits.map(hit => `${hit.standard}:${hit.category}`));
  if (unique.size !== 1) return { ...base, reason: '报告包含多个或相互冲突的分级，需逐病灶人工核对' };
  const hit = hits[0];
  return { disease, status: 'suggested', label: `${hit.standard} ${hit.category}`, ...hit };
}

function buildStandardAssessments(diseases, reports) {
  return (diseases || []).map(disease => assessOne(disease, reports));
}

module.exports = { buildStandardAssessments, matchesAssessment };
