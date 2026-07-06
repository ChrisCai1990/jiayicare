// ── 10年 ASCVD 风险评估（《中国成人血脂异常防治指南(2016)》流程）──
// 动脉粥样硬化性心血管疾病（ASCVD）10年发病风险分层：低危 / 中危 / 高危。
// 采用指南推荐的「危险因素分层查表法」，而非纯累加打分。
//
// 输入字段（医护端录入）：
//   gender: 'male' | 'female'
//   age: 数字（岁）
//   tc: 总胆固醇 mmol/L
//   ldl: 低密度脂蛋白胆固醇 mmol/L
//   hdl: 高密度脂蛋白胆固醇 mmol/L
//   sbp: 收缩压 mmHg
//   onHypertensionTreatment: 是否正在降压治疗（不直接影响分层，供参考展示）
//   smoking: 是否吸烟
//   diabetes: 是否糖尿病
//   bmi: 体质指数（用于余生风险参考，可选）

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 第一步：直接判定为高危的情形（符合任一即高危，无需查表）
function isDirectHighRisk({ ldl, tc, diabetes, age }) {
  const ldlV = num(ldl);
  const tcV = num(tc);
  const ageV = num(age);
  // LDL-C ≥ 4.9 或 TC ≥ 7.2 直接高危
  if (ldlV !== null && ldlV >= 4.9) return { hit: true, reason: 'LDL-C ≥ 4.9 mmol/L' };
  if (tcV !== null && tcV >= 7.2) return { hit: true, reason: '总胆固醇 ≥ 7.2 mmol/L' };
  // 糖尿病 + 年龄≥40岁 直接高危
  if (diabetes && ageV !== null && ageV >= 40) return { hit: true, reason: '糖尿病且年龄 ≥ 40 岁' };
  return { hit: false, reason: '' };
}

// 危险因素个数：高血压、吸烟、低HDL-C、年龄（男≥45/女≥55）
function countRiskFactors({ gender, age, hdl, sbp, smoking }) {
  let count = 0;
  const factors = [];
  const sbpV = num(sbp);
  const hdlV = num(hdl);
  const ageV = num(age);
  // 高血压：收缩压 ≥ 140
  if (sbpV !== null && sbpV >= 140) { count++; factors.push('高血压(收缩压≥140)'); }
  if (smoking) { count++; factors.push('吸烟'); }
  // 低 HDL-C：< 1.0 mmol/L
  if (hdlV !== null && hdlV < 1.0) { count++; factors.push('低HDL-C(<1.0)'); }
  // 年龄：男≥45岁 / 女≥55岁
  if (ageV !== null && ((gender === 'male' && ageV >= 45) || (gender === 'female' && ageV >= 55))) {
    count++; factors.push('年龄偏大');
  }
  return { count, factors };
}

// 胆固醇水平分档（用于查表）：0=TC<5.2且LDL<3.4；1=5.2≤TC<6.2或3.4≤LDL<4.1；2=6.2≤TC<7.2或4.1≤LDL<4.9
function cholLevel({ tc, ldl }) {
  const tcV = num(tc);
  const ldlV = num(ldl);
  const highBand = (tcV !== null && tcV >= 6.2) || (ldlV !== null && ldlV >= 4.1);
  const midBand  = (tcV !== null && tcV >= 5.2) || (ldlV !== null && ldlV >= 3.4);
  if (highBand) return 2;
  if (midBand) return 1;
  return 0;
}

// 第二步：无高血压 / 有高血压 两种情形下，按危险因素个数 + 胆固醇水平查表定低/中/高危
// 依据指南「10年ASCVD发病危险评估流程图」简化实现
function tableRisk({ sbp, riskCount, chol, hasHypertension }) {
  // riskCount 这里指“除高血压外的其他危险因素个数”（吸烟/低HDL/年龄）
  if (!hasHypertension) {
    // 无高血压
    if (riskCount === 0) return 'low';
    if (riskCount === 1) return chol >= 2 ? 'medium' : 'low';
    if (riskCount === 2) return chol >= 1 ? 'medium' : 'low';
    return 'medium'; // ≥3
  }
  // 有高血压
  if (riskCount === 0) return chol >= 2 ? 'medium' : 'low';
  if (riskCount === 1) return chol >= 1 ? 'medium' : 'low';
  if (riskCount === 2) return chol >= 1 ? 'high' : 'medium';
  return 'high'; // ≥3
}

const LEVEL_LABEL = {
  low:    { label: '低危', desc: '10年ASCVD发病风险 < 10%' },
  medium: { label: '中危', desc: '10年ASCVD发病风险 10%~20%' },
  high:   { label: '高危', desc: '10年ASCVD发病风险 ≥ 20%' },
};

// 主评估函数：返回 { level, levelLabel, description, riskFactors, directHighRisk, advice, inputs, evaluatedAt }
function assessAscvd(input = {}) {
  const gender = input.gender === 'female' ? 'female' : 'male';
  const sbpV = num(input.sbp);
  const hasHypertension = sbpV !== null && sbpV >= 140;

  const direct = isDirectHighRisk(input);
  const chol = cholLevel(input);
  const { factors } = countRiskFactors({ ...input, gender });

  let level;
  if (direct.hit) {
    level = 'high';
  } else {
    // 查表用的“其他危险因素个数” = 除高血压外的因素（吸烟/低HDL/年龄）
    const otherCount = factors.filter(f => !f.startsWith('高血压')).length;
    level = tableRisk({ sbp: sbpV, riskCount: otherCount, chol, hasHypertension });
  }

  const meta = LEVEL_LABEL[level];
  const advice = level === 'high'
    ? '建议尽早启动生活方式干预并就诊评估他汀类调脂治疗，控制血压、血糖、戒烟，3~6个月复查血脂。'
    : level === 'medium'
      ? '建议强化生活方式干预（低脂饮食、规律运动、戒烟限酒），6~12个月复查血脂并动态评估风险。'
      : '风险较低，保持健康生活方式，建议每年常规体检监测血脂血压。';

  return {
    level,
    levelLabel: meta.label,
    description: meta.desc,
    directHighRisk: direct.hit ? direct.reason : '',
    riskFactors: factors,
    hasHypertension,
    cholLevel: chol,
    advice,
    inputs: {
      gender, age: num(input.age), tc: num(input.tc), ldl: num(input.ldl), hdl: num(input.hdl),
      sbp: sbpV, onHypertensionTreatment: !!input.onHypertensionTreatment,
      smoking: !!input.smoking, diabetes: !!input.diabetes, bmi: num(input.bmi),
    },
    evaluatedAt: new Date(),
  };
}

module.exports = { assessAscvd, LEVEL_LABEL };
