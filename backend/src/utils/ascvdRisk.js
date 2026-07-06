// ── 10年 ASCVD 风险评估（一级预防人群，尚无 ASCVD 病史）──
// 动脉粥样硬化性心血管疾病（ASCVD）10年发病风险分层：低危 / 中危 / 高危。
//
// ⚠️ 版本说明（2026-07-06 精确校准）：已按《中国血脂管理指南（2023年）》原文图1"中国成人ASCVD
// 总体发病风险评估流程图"核对全部21种组合的查表矩阵数值（胆固醇3档 × 危险因素个数0/1/2/3 ×
// 有无高血压 2种情形），不再是2016版近似值。同时新增"余生风险"判定（10年中危且年龄<55岁时触发）。
// 若患者已确诊 ASCVD（心梗/卒中/血运重建史等），2023版另有"极高危/超高危"二级预防分层，
// 需要采集病史字段，本工具当前只服务尚无 ASCVD 病史的一级预防评估，不适用于已患病患者。
//
// 采用指南推荐的「危险因素分层查表法」，而非纯累加打分。
//
// 输入字段（医护端录入）：
//   gender: 'male' | 'female'
//   age: 数字（岁）
//   tc: 总胆固醇 mmol/L
//   ldl: 低密度脂蛋白胆固醇 mmol/L
//   hdl: 高密度脂蛋白胆固醇 mmol/L
//   sbp: 收缩压 mmHg
//   dbp: 舒张压 mmHg（用于余生风险判定，可选）
//   onHypertensionTreatment: 是否正在降压治疗（不直接影响分层，供参考展示）
//   smoking: 是否吸烟
//   diabetes: 是否糖尿病
//   ckdStage34: 是否患慢性肾脏病(CKD) 3~4期（2023版新增的直接高危判定条件）
//   bmi: 体质指数（用于余生风险判定，可选）

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 第一步：直接判定为高危的情形（符合任一即高危，无需查表）——《中国血脂管理指南(2023年)》标准
function isDirectHighRisk({ ldl, tc, diabetes, age, ckdStage34 }) {
  const ldlV = num(ldl);
  const tcV = num(tc);
  const ageV = num(age);
  // LDL-C ≥ 4.9 或 TC ≥ 7.2 直接高危
  if (ldlV !== null && ldlV >= 4.9) return { hit: true, reason: 'LDL-C ≥ 4.9 mmol/L' };
  if (tcV !== null && tcV >= 7.2) return { hit: true, reason: '总胆固醇 ≥ 7.2 mmol/L' };
  // 糖尿病 + 年龄≥40岁 直接高危
  if (diabetes && ageV !== null && ageV >= 40) return { hit: true, reason: '糖尿病且年龄 ≥ 40 岁' };
  // CKD 3~4期 直接高危（2023版新增）
  if (ckdStage34) return { hit: true, reason: '慢性肾脏病(CKD) 3~4期' };
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

// 胆固醇水平分档（用于查表，共3档）——《中国血脂管理指南(2023年)》图1原表数值：
// 档1：3.1≤TC<4.1 或 1.8≤LDL-C<2.6；档2：4.1≤TC<5.2 或 2.6≤LDL-C<3.4；档3：5.2≤TC<7.2 或 3.4≤LDL-C<4.9
function cholLevel({ tc, ldl }) {
  const tcV = num(tc);
  const ldlV = num(ldl);
  const band3 = (tcV !== null && tcV >= 5.2 && tcV < 7.2) || (ldlV !== null && ldlV >= 3.4 && ldlV < 4.9);
  const band2 = (tcV !== null && tcV >= 4.1 && tcV < 5.2) || (ldlV !== null && ldlV >= 2.6 && ldlV < 3.4);
  const band1 = (tcV !== null && tcV >= 3.1 && tcV < 4.1) || (ldlV !== null && ldlV >= 1.8 && ldlV < 2.6);
  if (band3) return 3;
  if (band2) return 2;
  if (band1) return 1;
  return 1; // 低于档1下限时按最低档处理（原表未覆盖更低区间）
}

// 第二步：无高血压 / 有高血压 两种情形下，按危险因素个数 + 胆固醇水平查表定低/中/高危
// 精确对应《中国血脂管理指南(2023年)》图1"中国成人ASCVD总体发病风险评估流程图"的21格矩阵
function tableRisk({ riskCount, chol, hasHypertension }) {
  // riskCount 这里指"除高血压外的其他危险因素个数"（吸烟/低HDL-C/年龄），封顶为3
  const rc = Math.min(riskCount, 3);
  if (!hasHypertension) {
    // 无高血压：0~1因素恒低危；2因素档3才中危；3因素档2/3中危，档1仍低危
    if (rc <= 1) return 'low';
    if (rc === 2) return chol >= 3 ? 'medium' : 'low';
    return chol >= 2 ? 'medium' : 'low'; // rc === 3
  }
  // 有高血压：0因素恒低危；1因素档2/3中危；2因素档1中危、档2/3高危；3因素恒高危
  if (rc === 0) return 'low';
  if (rc === 1) return chol >= 2 ? 'medium' : 'low';
  if (rc === 2) return chol >= 2 ? 'high' : 'medium';
  return 'high'; // rc === 3
}

// 余生风险判定：10年风险为中危 且 年龄<55岁 时触发。
// 具备下列≥2项危险因素者，定义为ASCVD高危人群（图1原表附加判定）：
//   ①收缩压≥160mmHg或舒张压≥100mmHg  ②非HDL-C≥5.2mmol/L  ③HDL-C<1.0mmol/L
//   ④BMI≥28kg/m²  ⑤吸烟
function assessLifetimeRisk({ age, sbp, dbp, tc, hdl, bmi, smoking }) {
  const ageV = num(age);
  if (ageV === null || ageV >= 55) return null; // 不满足触发条件
  const sbpV = num(sbp);
  const dbpV = num(dbp);
  const tcV = num(tc);
  const hdlV = num(hdl);
  const bmiV = num(bmi);
  const nonHdl = (tcV !== null && hdlV !== null) ? tcV - hdlV : null;

  let hits = 0;
  const items = [];
  if ((sbpV !== null && sbpV >= 160) || (dbpV !== null && dbpV >= 100)) { hits++; items.push('血压≥160/100mmHg'); }
  if (nonHdl !== null && nonHdl >= 5.2) { hits++; items.push('非HDL-C≥5.2mmol/L'); }
  if (hdlV !== null && hdlV < 1.0) { hits++; items.push('HDL-C<1.0mmol/L'); }
  if (bmiV !== null && bmiV >= 28) { hits++; items.push('BMI≥28'); }
  if (smoking) { hits++; items.push('吸烟'); }

  return { triggered: true, hits, items, isLifetimeHigh: hits >= 2 };
}

// 低/中/高危的10年风险百分比定义（《中国血脂管理指南2023年》）
const LEVEL_LABEL = {
  low:    { label: '低危', desc: '10年ASCVD发病风险 < 5%' },
  medium: { label: '中危', desc: '10年ASCVD发病风险 5%~9%' },
  high:   { label: '高危', desc: '10年ASCVD发病风险 ≥ 10%' },
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
    // 查表用的"其他危险因素个数" = 除高血压外的因素（吸烟/低HDL-C/年龄）
    const otherCount = factors.filter(f => !f.startsWith('高血压')).length;
    level = tableRisk({ riskCount: otherCount, chol, hasHypertension });
  }

  // 余生风险：仅当10年风险落在中危、且年龄<55岁时触发判定
  let lifetimeRisk = null;
  if (level === 'medium') {
    lifetimeRisk = assessLifetimeRisk(input);
    if (lifetimeRisk && lifetimeRisk.isLifetimeHigh) {
      level = 'high';
    }
  }

  const meta = LEVEL_LABEL[level];
  const advice = level === 'high'
    ? '建议尽早启动生活方式干预并就诊评估他汀类调脂治疗，控制血压、血糖、戒烟，3~6个月复查血脂。'
    : level === 'medium'
      ? '建议强化生活方式干预（低脂饮食、规律运动、戒烟限酒），6~12个月复查血脂并动态评估风险。'
      : '风险较低，保持健康生活方式，建议每年常规体检监测血脂血压。';

  const directReason = direct.hit
    ? direct.reason
    : (lifetimeRisk && lifetimeRisk.isLifetimeHigh
      ? `余生风险升级：中危且年龄<55岁，合并${lifetimeRisk.hits}项危险因素（${lifetimeRisk.items.join('、')}）`
      : '');

  return {
    level,
    levelLabel: meta.label,
    description: meta.desc,
    directHighRisk: directReason,
    riskFactors: factors,
    hasHypertension,
    cholLevel: chol,
    lifetimeRisk,
    advice,
    inputs: {
      gender, age: num(input.age), tc: num(input.tc), ldl: num(input.ldl), hdl: num(input.hdl),
      sbp: sbpV, dbp: num(input.dbp), onHypertensionTreatment: !!input.onHypertensionTreatment,
      smoking: !!input.smoking, diabetes: !!input.diabetes, ckdStage34: !!input.ckdStage34, bmi: num(input.bmi),
    },
    evaluatedAt: new Date(),
  };
}

module.exports = { assessAscvd, LEVEL_LABEL };
