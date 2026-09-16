const STRATEGIES = ['health_reshape', 'young_state', 'chronic_stable', 'health_prevention'];

const SERVICE_VERSIONS = [
  { code: 'jys_young', label: '健康年轻态计划', clientBrand: 'jinyisen', strategyType: 'young_state', pattern: /年轻态/ },
  { code: 'jys_stable', label: '健康维稳计划', clientBrand: 'jinyisen', strategyType: 'chronic_stable', pattern: /健康维稳|维稳计划/ },
  { code: 'jys_reshape', label: '健康重塑计划', clientBrand: 'jinyisen', strategyType: 'health_reshape', pattern: /健康重塑|重塑计划/ },
  { code: 'jys_advisor', label: '健康顾问计划', clientBrand: 'jinyisen', strategyType: 'chronic_stable', pattern: /健康顾问|顾问计划/ },
  { code: 'jygj_escort', label: '健康护航计划', clientBrand: 'jiayiguanjia', strategyType: 'health_reshape', pattern: /健康护航|护航计划/ },
  { code: 'jygj_prevention', label: '健康预防计划', clientBrand: 'jiayiguanjia', strategyType: 'health_prevention', pattern: /健康预防|预防计划/ },
  { code: 'jygj_light', label: '轻享健康计划', clientBrand: 'jiayiguanjia', strategyType: 'young_state', pattern: /轻享健康|轻享计划/ },
];

const byCode = code => SERVICE_VERSIONS.find(item => item.code === code) || null;
const legacyStrategy = value => STRATEGIES.includes(value) ? value : '';

function inferServiceVersion({ code = '', name = '', clientBrand = '', strategyType = '', planType = '' } = {}) {
  const explicit = byCode(code) || byCode(planType);
  if (explicit) return explicit;
  const normalizedName = String(name || '');
  const matched = SERVICE_VERSIONS.find(item => (!clientBrand || item.clientBrand === clientBrand) && item.pattern.test(normalizedName));
  if (matched) return matched;
  return null;
}

function normalizeAnnualTemplate(template, patient = {}) {
  const content = template?.content || {};
  const brands = Array.isArray(template?.clientBrands) ? template.clientBrands.filter(Boolean) : [];
  const clientBrand = content.clientBrand || template?.clientBrand || (brands.length === 1 ? brands[0] : patient.clientBrand || '');
  const version = inferServiceVersion({
    code: content.servicePlanCode,
    name: content.planName || template?.name,
    clientBrand,
    strategyType: content.strategyType,
    planType: content.planType,
  });
  const strategyType = content.strategyType || version?.strategyType || legacyStrategy(content.planType) || 'health_prevention';
  return {
    ...template,
    content: {
      ...content,
      servicePlanCode: version?.code || content.servicePlanCode || '',
      strategyType,
      planType: strategyType,
      planName: content.planName || version?.label || template?.name || '',
    },
  };
}

function templateMatchesPatient(template, patient = {}) {
  const content = template?.content || {};
  const memberTypes = Array.isArray(content.eligibleMemberTypes) ? content.eligibleMemberTypes.filter(Boolean) : [];
  const packages = Array.isArray(content.eligibleServicePackages) ? content.eligibleServicePackages.filter(Boolean) : [];
  if (memberTypes.length && !memberTypes.includes(patient.memberType || '')) return false;
  if (packages.length && !packages.includes(patient.servicePackage || '')) return false;
  return true;
}

const comparable = value => String(value || '')
  .replace(/[金伊森嘉医管家·|｜\s]/g, '')
  .replace(/(?:年度)?(?:健康)?(?:管理)?(?:服务)?(?:会员)?(?:计划|方案|套餐)$/g, '');
const MATCH_KEYWORDS = ['年轻态', '维稳', '重塑', '顾问', '护航', '预防', '轻享'];

function recommendedTemplateId(templates = [], patient = {}) {
  if (!templates.length) return '';
  const signals = [patient.servicePackage, patient.memberType].map(comparable).filter(Boolean);
  const scored = templates.map(template => {
    const content = template.content || {};
    const version = byCode(content.servicePlanCode);
    const names = [content.planName, template.name, version?.label].map(comparable).filter(Boolean);
    let score = 0;
    if ((content.eligibleServicePackages || []).includes(patient.servicePackage)) score += 120;
    if ((content.eligibleMemberTypes || []).includes(patient.memberType)) score += 100;
    signals.forEach(signal => names.forEach(name => {
      if (signal === name) score = Math.max(score, 90);
      else if (signal.length >= 2 && (signal.includes(name) || name.includes(signal))) score = Math.max(score, 70);
      const keyword = MATCH_KEYWORDS.find(item => signal.includes(item) && name.includes(item));
      if (keyword) score = Math.max(score, 80);
    }));
    return { id: String(template._id || ''), score };
  }).sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0 && scored[0].score > (scored[1]?.score || 0)) return scored[0].id;
  return templates.length === 1 ? String(templates[0]._id || '') : '';
}

module.exports = { STRATEGIES, SERVICE_VERSIONS, byCode, legacyStrategy, inferServiceVersion, normalizeAnnualTemplate, templateMatchesPatient, recommendedTemplateId };
