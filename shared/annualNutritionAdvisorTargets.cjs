const INDICATORS = [
  '血压', '空腹血糖', '糖化血红蛋白', '总胆固醇', '高密度脂蛋白', '低密度脂蛋白', '甘油三酯',
  '尿酸', '脂蛋白磷脂酶A2', '同型半胱氨酸', '脂肪肝（超声）',
  '胃蛋白酶原I', '胃蛋白酶原II', '胃泌素17', '胃功能3项',
];
const SYMPTOMS = ['便秘', '腹泻', '脑雾', '睡眠'];
const INTERNAL_METRICS = new Set(['脂蛋白磷脂酶A2', '同型半胱氨酸', '胃蛋白酶原I', '胃蛋白酶原II', '胃泌素17', '胃功能3项']);
const MAX_ADVISOR_TARGETS = 24;
const VITAL_NAMES = { weight: '体重', bloodSugar: '空腹血糖', systolic: '血压', diastolic: '血压', heartRate: '心率' };
const OPERATORS = { lte: '≤', gte: '≥', lt: '<', gt: '>', eq: '=' };
const MATCHERS = [
  ['血压', /血压|收缩压|舒张压/], ['空腹血糖', /空腹血糖/], ['糖化血红蛋白', /糖化血红蛋白|HbA1c/i],
  ['总胆固醇', /总胆固醇|血脂|TC\b/i], ['高密度脂蛋白', /高密度脂蛋白|血脂|HDL[-－]?C/i],
  ['低密度脂蛋白', /低密度脂蛋白|血脂|LDL[-－]?C/i], ['甘油三酯', /甘油三酯|血脂|TG\b/i],
  ['尿酸', /尿酸/], ['脂蛋白磷脂酶A2', /脂蛋白磷脂酶A2|Lp[-－]?PLA2/i],
  ['同型半胱氨酸', /同型半胱氨酸|Hcy\b/i], ['脂肪肝（超声）', /脂肪肝/],
  ['胃蛋白酶原I', /胃蛋白酶原(?:I|Ⅰ)(?!I|Ⅰ)|PGI(?!I)/i],
  ['胃蛋白酶原II', /胃蛋白酶原(?:II|Ⅱ)|PGII/i],
  ['胃泌素17', /胃泌素\s*17|G[-－]?17/i], ['胃功能3项', /胃功能3项|胃功能检测/],
  ['便秘', /便秘/], ['腹泻', /腹泻/], ['脑雾', /脑雾/], ['睡眠', /睡眠|失眠/],
];
const isInternalNutritionMetric = name => INTERNAL_METRICS.has(String(name || '').trim()) || /脂蛋白磷脂酶A2|同型半胱氨酸|Lp[-－]?PLA2|Hcy\b|胃蛋白酶原|胃泌素\s*17|G[-－]?17|胃功能3项|胃功能检测/i.test(String(name || ''));
const kindFor = name => SYMPTOMS.includes(String(name || '').trim()) ? 'symptom' : 'metric';
const clauseFor = (text, matcher) => String(text || '').split(/[；;。\n]/).map(value => value.trim()).find(value => matcher.test(value)) || '';

function fromManagementTargets(records = []) {
  return records.filter(row => row.nutritionRelevant === true).flatMap(row => {
    const status = String(row.sourceStatus || '').toLowerCase();
    if (status === 'normal') return [];
    const explicitlyAbnormal = ['abnormal', 'attention'].includes(status)
      || /异常|偏高|偏低|升高|降低|超标|不达标|增高|减低|超出参考/.test(`${row.goal || ''} ${row.focus || ''} ${row.baseline || ''}`);
    const goalMetric = row.goalMetric || {};
    const text = [row.goal, row.focus, row.baseline, goalMetric.name, VITAL_NAMES[goalMetric.key]].filter(Boolean).join('；');
    const matches = MATCHERS.filter(([name, pattern]) => pattern.test(text) && (explicitlyAbnormal || kindFor(name) === 'symptom'));
    if (!matches.length && !explicitlyAbnormal) return [];
    const candidates = matches.length ? matches : [[String(goalMetric.name || VITAL_NAMES[goalMetric.key] || row.goal || '').split(/[·：:；;]/)[0].trim(), /.*/]];
    return candidates.map(([name, pattern]) => {
      const metric = String(name).slice(0, 100);
      const baseline = clauseFor(row.baseline, pattern) || (candidates.length === 1 ? String(row.baseline || '') : '');
      const structured = goalMetric.targetValue !== undefined && goalMetric.targetValue !== ''
        && (candidates.length === 1 || String(goalMetric.name || VITAL_NAMES[goalMetric.key] || '').includes(name))
        ? `${OPERATORS[goalMetric.operator] || ''}${goalMetric.targetValue}${goalMetric.unit || ''}` : '';
      const target = structured || clauseFor(row.goal, pattern) || String(row.goal || '');
      return { kind: kindFor(metric), metric, baseline: baseline.trim().slice(0, 200), target: target.trim().slice(0, 200),
        internalOnly: isInternalNutritionMetric(metric), sourceIssueId: String(row.issueId || '') };
    }).filter(item => item.metric && item.target);
  }).slice(0, MAX_ADVISOR_TARGETS);
}

function mergeAdvisorTargets(existing = [], records = []) {
  const result = existing.map(row => ({ ...row, kind: row.kind || kindFor(row.metric), internalOnly: isInternalNutritionMetric(row.metric) }));
  for (const candidate of fromManagementTargets(records)) {
    if (result.length >= MAX_ADVISOR_TARGETS) break;
    if (result.some(row => row.metric === candidate.metric)) continue;
    result.push(candidate);
  }
  return result;
}

module.exports = { INDICATORS, SYMPTOMS, MAX_ADVISOR_TARGETS, isInternalNutritionMetric, kindFor, fromManagementTargets, mergeAdvisorTargets };
