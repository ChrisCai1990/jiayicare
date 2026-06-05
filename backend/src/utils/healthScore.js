// 健康评分引擎 - 基于健康评分逻辑.docx
// total_score = min(100, max(0, baseline(60) + lifestyle(40) + age_gender_adj + bonus - deductions))

const DISEASE_DEDUCTIONS = {
  '高血压':       [-3, -6, -10],
  '糖尿病':       [-3, -6, -10],
  '冠心病':       [-5, -9, -15],
  '心脏病':       [-5, -9, -15],
  '中风':         [-8, -12, -20],
  '脑卒中':       [-8, -12, -20],
  '慢性肾病':     [-3, -6, -13],  // level3 = -13 per spec
  'COPD':         [-4, -7, -12],
  '慢性阻塞性肺疾病': [-4, -7, -12],
  '癌症':         [-15, -17, -20],
  '恶性肿瘤':     [-15, -17, -20],
  '脂肪肝':       [-2, -3, -5],
  '血脂异常':     [-1, -3, -5],
  '肝脏疾病':     [-2, -3, -5],
  '肾脏疾病':     [-2, -4, -7],
  '胃炎':         [-1, -2, -4],
  '消化系统疾病': [-1, -2, -4],
  '记忆相关疾病': [-4, -7, -12],
  '痴呆':         [-4, -7, -12],
  '关节炎':       [-1, -3, -6],
  '风湿病':       [-1, -3, -6],
  '哮喘':         [-2, -4, -8],
  '高尿酸':       [-1, -2, -4],
  '痛风':         [-2, -3, -5],
  '甲状腺疾病':   [-1, -2, -4],
};

function matchDisease(diseaseName) {
  for (const key of Object.keys(DISEASE_DEDUCTIONS)) {
    if (diseaseName.includes(key) || key.includes(diseaseName)) return key;
  }
  return null;
}

function getChronicDeduction(chronicDiseases, chronicDiseaseSeverity) {
  let total = 0;
  const seen = new Set();
  for (const disease of (chronicDiseases || [])) {
    const key = matchDisease(disease);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const severity = Math.min(Math.max(parseInt((chronicDiseaseSeverity || {})[disease] || 1), 1), 3);
    total += DISEASE_DEDUCTIONS[key][severity - 1];
  }
  // 多病共存上限 -25（癌症/脑卒中极端重症例外）
  const hasSevere = (chronicDiseases || []).some(d => ['癌症','恶性肿瘤','中风','脑卒中'].includes(matchDisease(d)));
  return hasSevere ? total : Math.max(total, -25);
}

function getLabDeduction(labValues) {
  if (!labValues) return 0;
  const v = labValues;
  let total = 0;

  // 空腹血糖 FPG (mmol/L)
  if (v.fpg != null && v.fpg !== '') {
    const fpg = parseFloat(v.fpg);
    if (!isNaN(fpg)) {
      if (fpg > 11.0) total -= 8;
      else if (fpg >= 7.0) total -= 4;
      else if (fpg >= 6.1) total -= 2;
    }
  }

  // 总胆固醇 TC (mmol/L)
  if (v.tc != null && v.tc !== '') {
    const tc = parseFloat(v.tc);
    if (!isNaN(tc)) {
      if (tc >= 7.2) total -= 4;
      else if (tc >= 6.2) total -= 2;
      else if (tc >= 5.2) total -= 1;
    }
  }

  // LDL-C (mmol/L)
  if (v.ldl != null && v.ldl !== '') {
    const ldl = parseFloat(v.ldl);
    if (!isNaN(ldl)) {
      if (ldl >= 4.9) total -= 5;
      else if (ldl >= 4.1) total -= 2;
      else if (ldl >= 3.4) total -= 1;
    }
  }

  // 甘油三酯 TG (mmol/L)
  if (v.tg != null && v.tg !== '') {
    const tg = parseFloat(v.tg);
    if (!isNaN(tg)) {
      if (tg > 5.6) total -= 4;
      else if (tg >= 2.3) total -= 2;
      else if (tg >= 1.7) total -= 1;
    }
  }

  // 尿酸 UA (μmol/L) - need gender context
  if (v.ua != null && v.ua !== '') {
    const ua = parseFloat(v.ua);
    if (!isNaN(ua)) {
      const isMale = v.gender === '男';
      const threshold1 = isMale ? 420 : 360;
      const threshold2 = isMale ? 540 : 480;
      if (ua > 600) total -= 4;
      else if (ua > threshold2) total -= 2;
      else if (ua > threshold1) total -= 1;
    }
  }

  // 肝功能 ALT（倍数于正常上限，如填入实际值则用40U/L为ULN）
  if (v.alt != null && v.alt !== '') {
    const alt = parseFloat(v.alt);
    if (!isNaN(alt)) {
      const uln = 40; // normal upper limit U/L
      const ratio = alt / uln;
      if (ratio > 3) total -= 4;
      else if (ratio > 2) total -= 2;
      else if (ratio > 1) total -= 1;
    }
  }

  // 肌酐 Cr - 用 CKD 分期更直观，支持填分期 1-5
  if (v.ckdStage != null && v.ckdStage !== '') {
    const stage = parseInt(v.ckdStage);
    if (!isNaN(stage)) {
      if (stage >= 4) total -= 6;
      else if (stage >= 3) total -= 3;
      else if (stage >= 2) total -= 1;
    }
  }

  // 血压 SBP/DBP (mmHg)
  if (v.sbp != null && v.sbp !== '') {
    const sbp = parseFloat(v.sbp);
    const dbp = parseFloat(v.dbp || 0);
    if (!isNaN(sbp)) {
      if (sbp >= 160 || dbp >= 100) total -= 6;
      else if (sbp >= 140 || dbp >= 90) total -= 3;
      else if (sbp >= 120 || dbp >= 80) total -= 1;
    }
  }

  return total;
}

function getLifestyleDeduction(lifestyleData, weight, height) {
  if (!lifestyleData) return 0;
  const d = lifestyleData;
  let total = 0;

  // 吸烟: 0 / -4 / -8
  const smoking = d.smokingStatus || '';
  if (!smoking || smoking === '不吸烟' || smoking === '戒烟') {
    // 0
  } else if (smoking.includes('＜10') || smoking.includes('<10')) {
    total -= 4;
  } else {
    total -= 8;
  }

  // 饮酒: 0 / -3 / -6
  const drinking = d.drinkingFrequency || '';
  if (!drinking || drinking === '不喝酒') {
    // 0
  } else if (drinking.includes('＜1天') || drinking.includes('1-3天')) {
    total -= 3;
  } else {
    total -= 6;
  }

  // 体力活动: 0 / -4 / -8
  const freq = d.exerciseFrequency || '';
  const dur = parseInt(d.exerciseDuration || 0);
  if (freq === '3-5天/周' || freq === '6-7天/周') {
    if (dur >= 30) {
      // 达标 ≥150min/week
    } else {
      total -= 4;
    }
  } else if (freq === '1-2天/周') {
    total -= 4;
  } else {
    total -= 8; // 无运动
  }

  // 膳食/体重: 0 / -6 / -10
  let dietDeduction = 0;
  const bmi = (weight && height) ? weight / Math.pow(height / 100, 2) : null;
  const badHabits = (d.badDietHabits || []).length;
  const lowVeg = d.dailyVegetables === '300克以内' || d.dailyVegetables === '几乎不吃';
  const lowFruit = d.fruitFrequency === '几乎不吃';
  const dietIsBad = badHabits >= 3 || (lowVeg && lowFruit);

  if (bmi != null) {
    if (bmi >= 32 || (bmi >= 28 && dietIsBad)) dietDeduction = -10;
    else if (bmi >= 28 || dietIsBad) dietDeduction = -6;
  } else if (dietIsBad) {
    dietDeduction = -6;
  }
  total += dietDeduction;

  // 睡眠质量: 0 / -3 / -6
  const wake = d.wakeTime || '';
  const sleep = d.sleepTime || '';
  if (wake && sleep) {
    try {
      const [wh, wm = 0] = wake.split(':').map(Number);
      const [sh, sm = 0] = sleep.split(':').map(Number);
      let wakeMin = wh * 60 + wm;
      let sleepMin = sh * 60 + sm;
      if (sleepMin > wakeMin) sleepMin -= 1440;
      const hours = (wakeMin - sleepMin) / 60;
      if (hours < 5 || hours > 10) total -= 6;
      else if (hours < 6 || hours > 9) total -= 3;
    } catch (e) {}
  }
  if (d.scheduleRegularity === '不规律') total -= 3;

  // 心理压力: 默认不扣（无问卷字段），保留扩展口
  // total += 0;

  return Math.max(total, -40);
}

function getAgeGenderAdjust(age, gender) {
  if (!age) return 0;
  const isMale = gender === '男';
  if (age < 35) return isMale ? 3 : 5;
  if (age < 50) return isMale ? 0 : 2;
  if (age < 65) return isMale ? -3 : -1;
  return isMale ? -8 : -5;
}

function getGrade(score) {
  if (score >= 90) return '优';
  if (score >= 75) return '良';
  if (score >= 60) return '中';
  return '差';
}

/**
 * 计算个体健康评分
 * @param {object} user - User document or plain object
 * @returns {object} { total, grade, baseline, lifestyle, ageGenderAdj, bonus, deductions, calculatedAt }
 */
function calculateHealthScore(user) {
  const chronicDeduction = getChronicDeduction(user.chronicDiseases, user.chronicDiseaseSeverity);
  const labDeduction = getLabDeduction({ ...(user.labValues || {}), gender: user.gender });
  const lifestyleDeduction = getLifestyleDeduction(user.lifestyle_data, user.weight, user.height);
  const ageGenderAdj = getAgeGenderAdjust(user.age, user.gender);
  const bonus = user.healthScoreBonus || 0;

  const baselineRemain = 60 + chronicDeduction + labDeduction;
  const lifestyleRemain = 40 + lifestyleDeduction;
  const raw = baselineRemain + lifestyleRemain + ageGenderAdj + bonus;
  const total = Math.round(Math.min(100, Math.max(0, raw)));

  return {
    total,
    grade: getGrade(total),
    baseline: 60,
    lifestyle: 40,
    ageGenderAdj,
    bonus,
    deductions: {
      chronic: chronicDeduction,
      lab: labDeduction,
      lifestyle: lifestyleDeduction,
    },
    calculatedAt: new Date().toISOString(),
  };
}

module.exports = { calculateHealthScore };
