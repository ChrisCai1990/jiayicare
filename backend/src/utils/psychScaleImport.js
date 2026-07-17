// ── 心理健康量表答卷 → 健康档案 自动写入 ──────────────────────────────
// 与 archiveImport.js（逐题绑定档案字段）不同：这里是"整份问卷=一个量表结果"，
// 提交后按标准公式直接计算总分/因子分/分级，无需人工审核，直接写入 User.psychAssessments。

const SCALE_KEY_BY_TITLE = [
  { test: /Epworth|嗜睡/, key: 'epworth' },
  { test: /SCL90|症状自评/, key: 'scl90' },
  { test: /SDS|抑郁自评/, key: 'sds' },
  { test: /SAS|焦虑自评/, key: 'sas' },
];

// 根据问卷标题判断是否是心理健康量表，返回对应 key（非量表返回 null）
function getPsychScaleKey(questionnaireTitle) {
  const hit = SCALE_KEY_BY_TITLE.find(s => s.test.test(questionnaireTitle || ''));
  return hit ? hit.key : null;
}

// 计算每题得分（与 questionnaire.js 提交时的总分算法一致）
function getOptScore(question, ans) {
  const opts = question.options || [];
  const find = (label) => {
    const opt = opts.find(o => (typeof o === 'string' ? o : o.label) === label);
    return (opt && typeof opt === 'object') ? (opt.score || 0) : 0;
  };
  if (question.type === 'radio' || question.type === 'dropdown') {
    const label = typeof ans === 'string' ? ans : ans?.value;
    return label ? find(label) : null; // null = 未作答
  }
  if (question.type === 'multi') {
    const labels = Array.isArray(ans) ? ans : (ans?.values || []);
    return labels.length ? labels.reduce((sum, l) => sum + find(l), 0) : null;
  }
  return null;
}

// 取某题用户所选答案的文字表述（供医护端逐题查看，radio/dropdown取label，multi取多选拼接）
function getAnswerLabel(question, ans) {
  if (ans == null) return '';
  if (question.type === 'multi') {
    const labels = Array.isArray(ans) ? ans : (ans?.values || []);
    return labels.join('、');
  }
  return typeof ans === 'string' ? ans : (ans?.value || '');
}

// 逐题作答明细：题干 + 用户所选答案 + 该题得分 + 因子归属（SCL90用）
// 医护端展示"每道题答题情况"用，便于定位客户的具体问题点
function buildAnswersDetail(questionnaire, answers) {
  const detail = [];
  for (const q of questionnaire.questions || []) {
    // 只收录计分类题目（量表题），文本/日期等辅助题不纳入逐题明细
    if (!['radio', 'multi', 'dropdown'].includes(q.type)) continue;
    const answerLabel = getAnswerLabel(q, answers[q.id]);
    if (!answerLabel) continue; // 未作答的题跳过
    detail.push({
      question: q.text,
      answer: answerLabel,
      score: getOptScore(q, answers[q.id]),
      factor: q.factor || '',
    });
  }
  return detail;
}

// SCL90 因子分正常/异常判定（国际通用标准：因子均分≥2为阳性/异常）
// <2 正常；2~2.99 轻度；3~3.99 中度；≥4 重度
function assessScl90Factor(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return { level: 'unknown', label: '—' };
  if (score < 2)  return { level: 'normal', label: '正常' };
  if (score < 3)  return { level: 'mild',   label: '轻度' };
  if (score < 4)  return { level: 'moderate', label: '中度' };
  return { level: 'severe', label: '重度' };
}

// 对全部因子均分做正常/异常判定，返回 { 因子: { score, level, label } }
function buildFactorAssessment(factorScores) {
  const result = {};
  for (const [factor, score] of Object.entries(factorScores || {})) {
    const a = assessScl90Factor(score);
    result[factor] = { score, level: a.level, label: a.label };
  }
  return result;
}

// 按 factor 分组计算各因子均分（无 factor 标记的题目忽略；用于 SCL90）
function calcFactorScores(questionnaire, answers) {
  const groups = {}; // { factor: [scores] }
  for (const q of questionnaire.questions || []) {
    if (!q.factor) continue;
    const score = getOptScore(q, answers[q.id]);
    if (score === null) continue;
    (groups[q.factor] = groups[q.factor] || []).push(score);
  }
  const result = {};
  for (const [factor, scores] of Object.entries(groups)) {
    result[factor] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  }
  return result;
}

// SAS/SDS 标准分：国际通用换算公式 = 粗分(totalScore) × 1.25，四舍五入取整
// 标准分≥53视为有症状/异常（临床通用分界线），与 scoreRanges 配置的"粗分区间"是两套独立判定，不复用
const SAS_SDS_ABNORMAL_THRESHOLD = 53;
function calcStandardScore(totalScore) {
  return Math.round(totalScore * 1.25);
}

// 生成写入 User.psychAssessments.<scaleKey> 的结果对象
function buildPsychResult(questionnaire, response, scaleKey) {
  const severity = (questionnaire.scoreRanges || [])
    .find(r => response.totalScore >= r.minScore && response.totalScore <= r.maxScore);
  const result = {
    totalScore: response.totalScore,
    severity: severity ? severity.label : '',
    severityDescription: severity ? severity.description : '',
    questionnaireId: questionnaire._id,
    responseId: response._id,
    filledAt: response.submittedAt || new Date(),
    // 逐题作答明细（题干/答案/得分），供医护端展开查看客户在每道题上的具体问题
    answersDetail: buildAnswersDetail(questionnaire, response.answers || {}),
  };
  if (scaleKey === 'scl90') {
    result.factorScores = response.factorScores || {};
    // 各因子分的正常/异常程度判定
    result.factorAssessment = buildFactorAssessment(response.factorScores || {});
  }
  if (scaleKey === 'sas' || scaleKey === 'sds') {
    result.standardScore = calcStandardScore(response.totalScore);
    result.abnormal = result.standardScore >= SAS_SDS_ABNORMAL_THRESHOLD;
  }
  return result;
}

module.exports = {
  getPsychScaleKey,
  calcFactorScores,
  buildPsychResult,
  buildAnswersDetail,
  buildFactorAssessment,
  assessScl90Factor,
  calcStandardScore,
  SAS_SDS_ABNORMAL_THRESHOLD,
};
