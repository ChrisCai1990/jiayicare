const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const PushRecord = require('../models/PushRecord');
const { getPsychScaleKey, calcFactorScores, buildPsychResult } = require('../utils/psychScaleImport');
const router = express.Router();

// ── 根据问卷答案生成个性化建议 ─────────────────────────────────────
function buildRecommendations(answers) {
  const recs = [];

  // q1: 吸烟
  if (answers.q1 === '每天吸烟') {
    recs.push({ type: 'warning', text: '长期吸烟会显著增加心脑血管疾病风险，建议制定戒烟计划，必要时寻求专业戒烟支持。' });
  } else if (answers.q1 === '偶尔吸烟') {
    recs.push({ type: 'tip', text: '减少吸烟有助于保护肺部和心血管健康，可尝试逐步减量直至戒除。' });
  }

  // q2: 慢性病史
  if (Array.isArray(answers.q2)) {
    if (answers.q2.includes('高血压')) {
      recs.push({ type: 'tip', text: '建议每日定时监测血压，限制钠盐摄入（每日 <5g），遵医嘱规律服用降压药。' });
    }
    if (answers.q2.includes('糖尿病')) {
      recs.push({ type: 'tip', text: '建议坚持记录空腹血糖，饮食宜低糖低GI，定期复查糖化血红蛋白（HbA1c）。' });
    }
    if (answers.q2.includes('冠心病')) {
      recs.push({ type: 'warning', text: '冠心病患者应避免剧烈运动，注意监测心率，随身携带急救药物并定期复查。' });
    }
  }

  // q3: 睡眠质量
  if (typeof answers.q3 === 'number' && answers.q3 <= 5) {
    recs.push({ type: 'warning', text: '您的睡眠质量偏低，建议保持规律作息时间，睡前1小时避免使用手机和饮用咖啡因饮品。' });
  } else if (typeof answers.q3 === 'number' && answers.q3 <= 7) {
    recs.push({ type: 'tip', text: '睡眠质量有提升空间，可尝试睡前冥想或轻度拉伸，创造安静舒适的睡眠环境。' });
  }

  // q4: 运动频率
  if (answers.q4 === '几乎不运动') {
    recs.push({ type: 'warning', text: '缺乏运动是多种慢性病的危险因素，建议从每天15分钟快走开始，逐步达到每周150分钟中等强度运动。' });
  } else if (answers.q4 === '1-2次/周') {
    recs.push({ type: 'tip', text: '建议适当增加运动频率，目标每周3-4次，坚持有氧结合力量训练效果更佳。' });
  }

  // q5: 心理状态矩阵
  if (answers.q5 && typeof answers.q5 === 'object') {
    const vals = Object.values(answers.q5);
    const hasModerate = vals.some(v => v === '中度' || v === '重度');
    if (hasModerate) {
      recs.push({ type: 'warning', text: '您近期存在一定的心理健康风险，建议适当减压放松，必要时可与心理咨询师或医生沟通。' });
    }
  }

  // q7: 家族史
  if (answers.q7 && answers.q7 !== '无') {
    recs.push({ type: 'tip', text: `有${answers.q7}家族史的人群患病风险较高，建议定期体检，尽早开展预防性干预。` });
  }

  // 正向鼓励（无不良习惯 + 运动规律）
  const isNonSmoker = answers.q1 === '从不吸烟' || answers.q1 === '已戒烟';
  const isActive = answers.q4 === '3-4次/周' || answers.q4 === '5次以上/周';
  const hasNoChronic = !Array.isArray(answers.q2) || answers.q2.includes('无') || answers.q2.length === 0;
  if (isNonSmoker && isActive && hasNoChronic) {
    recs.push({ type: 'good', text: '您的生活习惯整体良好！坚持规律运动和不吸烟是最重要的两项健康基石，请继续保持。' });
  }

  return recs;
}

// 提交健康问卷 — 保存答案并更新用户健康档案
router.post('/', auth, async (req, res) => {
  try {
    const { answers = {} } = req.body;

    // 从答案中提取可更新到 healthProfile 的字段
    const profileUpdates = {};

    // q1: 吸烟
    if (answers.q1) {
      profileUpdates.smoking = answers.q1;
    }

    // q2: 慢性病史
    if (answers.q2 && Array.isArray(answers.q2)) {
      const conditions = answers.q2.filter(v => v !== '无').join('、');
      if (conditions) profileUpdates.pastHistory = conditions;
    }

    // q6: 用药
    if (answers.q6) {
      profileUpdates.medicHistory = answers.q6;
    }

    // q7: 家族史
    if (answers.q7) {
      profileUpdates.familyHistory = answers.q7 !== '无' ? answers.q7 : '';
    }

    // 计算简单健康评分（基于问卷答案）
    let bonusScore = 0;
    // 不吸烟 +5
    if (answers.q1 === '从不吸烟') bonusScore += 5;
    else if (answers.q1 === '已戒烟') bonusScore += 3;
    // 运动频率
    if (answers.q4 === '5次以上/周') bonusScore += 5;
    else if (answers.q4 === '3-4次/周') bonusScore += 4;
    else if (answers.q4 === '1-2次/周') bonusScore += 2;
    // 睡眠
    if (typeof answers.q3 === 'number') {
      bonusScore += Math.floor(answers.q3 / 2);
    }

    // 更新用户健康档案
    const updatePayload = {};
    if (Object.keys(profileUpdates).length > 0) {
      for (const [k, v] of Object.entries(profileUpdates)) {
        updatePayload[`healthProfile.${k}`] = v;
      }
    }

    const user = await User.findById(req.user._id);
    const newScore = Math.min(100, Math.max(0, (user.healthScore || 60) + bonusScore));
    updatePayload.healthScore = newScore;

    await User.findByIdAndUpdate(req.user._id, { $set: updatePayload });

    // 生成个性化建议
    const recommendations = buildRecommendations(answers);

    res.json({
      success: true,
      message: '问卷提交成功',
      data: { healthScore: newScore, bonusScore, recommendations },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '提交失败', error: err.message });
  }
});

// ── 动态问卷（管理员创建的结构化问卷）────────────────────────────

// GET /api/questionnaire/pending — 获取当前用户待填动态问卷
// 以 PushRecord 为准：只显示通过推送操作显式发给该用户的问卷，避免历史遗留数据污染
router.get('/pending', auth, async (req, res) => {
  try {
    // 1. 找到所有推送给该用户的问卷 ID（去重）
    const pushRecords = await PushRecord.find({
      patientId: req.user._id,
      type: 'questionnaire',
      questionnaireId: { $ne: null },
    }).select('questionnaireId').lean();

    const pushedIds = [...new Set(pushRecords.map(r => String(r.questionnaireId)))];

    if (!pushedIds.length) {
      return res.json({ success: true, data: [] });
    }

    // 2. 只查这些问卷里还未回答的
    const questionnaires = await DynamicQuestionnaire.find({
      _id: { $in: pushedIds },
      status: 'active',
      respondedUsers: { $ne: req.user._id },
    }).select('title description questions deadline scoringEnabled createdBy').sort({ sortOrder: 1, createdAt: -1 }).lean();

    res.json({ success: true, data: questionnaires });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取问卷失败', error: err.message });
  }
});

// POST /api/questionnaire/:id/submit — 提交动态问卷答卷
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const { answers = {} } = req.body;

    const questionnaire = await DynamicQuestionnaire.findById(req.params.id);
    if (!questionnaire) return res.status(404).json({ success: false, message: '问卷不存在' });
    if (questionnaire.status !== 'active') {
      return res.status(400).json({ success: false, message: '该问卷暂未开放' });
    }

    // 检查是否已提交
    const existing = await QuestionnaireResponse.findOne({
      questionnaire: req.params.id, user: req.user._id,
    });
    if (existing) return res.status(400).json({ success: false, message: '您已提交过此问卷' });

    // 计算总分（如果问卷启用了评分）
    let totalScore = 0;
    if (questionnaire.scoringEnabled) {
      for (const question of questionnaire.questions) {
        if (!question.scoreEnabled) continue;
        if (!['radio', 'multi', 'dropdown'].includes(question.type)) continue;
        const ans = answers[question.id];
        const opts = question.options || [];
        const getOptScore = (label) => {
          const opt = opts.find(o => (typeof o === 'string' ? o : o.label) === label);
          return (opt && typeof opt === 'object') ? (opt.score || 0) : 0;
        };
        if (question.type === 'radio' || question.type === 'dropdown') {
          const label = typeof ans === 'string' ? ans : ans?.value;
          if (label) totalScore += getOptScore(label);
        } else if (question.type === 'multi') {
          const labels = Array.isArray(ans) ? ans : (ans?.values || []);
          for (const label of labels) totalScore += getOptScore(label);
        }
      }
    }

    // 心理健康量表（Epworth/SCL90/SDS/SAS）额外计算因子分
    const psychScaleKey = getPsychScaleKey(questionnaire.title);
    const factorScores = psychScaleKey === 'scl90' ? calcFactorScores(questionnaire, answers) : {};

    const response = await QuestionnaireResponse.create({
      questionnaire: req.params.id,
      user: req.user._id,
      answers,
      totalScore,
      factorScores,
    });

    // 标记已答题用户
    await DynamicQuestionnaire.findByIdAndUpdate(req.params.id, {
      $addToSet: { respondedUsers: req.user._id },
    });

    if (psychScaleKey) {
      // 心理健康量表：标准公式计分，无需人工审核，直接写入档案供家庭医生查看
      try {
        const psychResult = buildPsychResult(questionnaire, response, psychScaleKey);
        await User.collection.updateOne(
          { _id: req.user._id },
          { $set: { [`psychAssessments.${psychScaleKey}`]: psychResult } }
        );
      } catch (e) {
        console.error('[psych-scale-import] 心理量表自动写入档案失败', e.message);
      }
    } else {
      // 普通问卷：自动生成健康档案导入草稿（问卷题目若绑定了档案字段）→ 待健管专员审核写入
      try {
        const hasMapping = (questionnaire.questions || []).some(q => q.archiveField);
        if (hasMapping) {
          const { buildArchiveDraft } = require('../utils/archiveImport');
          const fullUser = await User.findById(req.user._id).lean();
          const draft = buildArchiveDraft(fullUser, questionnaire, response);
          if (draft.items.length > 0) {
            await User.collection.updateOne(
              { _id: req.user._id },
              { $set: { archiveDraft: draft } }
            );
          }
        }
      } catch (e) {
        console.error('[archive-import] 自动生成档案草稿失败', e.message);
      }
    }

    let scoreRange = null;
    if (questionnaire.scoringEnabled && questionnaire.scoreRanges?.length > 0) {
      scoreRange = questionnaire.scoreRanges.find(r => totalScore >= r.minScore && totalScore <= r.maxScore) || null;
    }

    res.json({ success: true, data: response, totalScore: questionnaire.scoringEnabled ? totalScore : undefined, scoreRange, message: '问卷提交成功，感谢您的填写！' });
  } catch (err) {
    res.status(500).json({ success: false, message: '提交失败', error: err.message });
  }
});

module.exports = router;
