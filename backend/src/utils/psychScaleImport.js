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
  };
  if (scaleKey === 'scl90') {
    result.factorScores = response.factorScores || {};
  }
  return result;
}

module.exports = { getPsychScaleKey, calcFactorScores, buildPsychResult };
