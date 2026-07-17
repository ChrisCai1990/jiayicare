const { chat } = require('./ai');

const RISK_LEVELS = ['low', 'medium', 'high', 'critical']; // 低 / 中 / 高 / 危急值

function ruleEngineSignals(lv = {}) {
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const sig = { cardiovascular: [], diabetes: [], tumor: [], kidney: [] };
  const sbp = num(lv.sbp), dbp = num(lv.dbp), fpg = num(lv.fpg), hba1c = num(lv.hba1c);
  const ldl = num(lv.ldl), tc = num(lv.tc), tg = num(lv.tg), hdl = num(lv.hdl);
  const hcy = num(lv.hcy), ua = num(lv.ua), cr = num(lv.cr || lv.scr), egfr = num(lv.egfr), bun = num(lv.bun);
  // 心血管
  if (sbp >= 180 || dbp >= 110) sig.cardiovascular.push(`血压危急 ${sbp}/${dbp} mmHg`);
  else if (sbp >= 140 || dbp >= 90) sig.cardiovascular.push(`血压偏高 ${sbp}/${dbp} mmHg`);
  if (ldl >= 4.1) sig.cardiovascular.push(`LDL-C 偏高 ${ldl} mmol/L`);
  if (tc >= 6.2) sig.cardiovascular.push(`总胆固醇偏高 ${tc} mmol/L`);
  if (tg >= 2.3) sig.cardiovascular.push(`甘油三酯偏高 ${tg} mmol/L`);
  if (hdl !== null && hdl < 1.0) sig.cardiovascular.push(`HDL-C 偏低 ${hdl} mmol/L`);
  if (hcy >= 15) sig.cardiovascular.push(`同型半胱氨酸偏高 ${hcy} μmol/L`);
  // 糖尿病
  if (fpg >= 11.1 || hba1c >= 9) sig.diabetes.push(`血糖危急（空腹${fpg ?? '-'}、糖化${hba1c ?? '-'}%）`);
  else if (fpg >= 7.0 || hba1c >= 6.5) sig.diabetes.push(`已达糖尿病诊断阈值（空腹${fpg ?? '-'}、糖化${hba1c ?? '-'}%）`);
  else if (fpg >= 6.1 || hba1c >= 5.7) sig.diabetes.push(`糖代谢受损（空腹${fpg ?? '-'}、糖化${hba1c ?? '-'}%）`);
  // 肾脏
  if (egfr !== null && egfr < 60) sig.kidney.push(`eGFR 偏低 ${egfr}`);
  if (cr !== null && cr > 104) sig.kidney.push(`肌酐偏高 ${cr} μmol/L`);
  if (bun !== null && bun > 7.1) sig.kidney.push(`尿素氮偏高 ${bun}`);
  if (ua >= 480) sig.kidney.push(`尿酸偏高 ${ua} μmol/L`);
  return sig;
}

// 严格取"最近一年"报告（2026-07-11）：此前按数量截断50-60条，等于把几年前的旧数据也一起喂给AI做风险判断，
// 会用过时数据污染当前风险等级；改为按 checkDate 过滤近365天，若近一年完全没有报告才回退到最近一次（避免无数据可用）。
async function selectRecentReports(MedicalReport, userId, selectFields, limit) {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);
  // checkDate是自由文本字符串，不少报告(手动补录漏填日期/AI OCR未能识别出日期)该字段是空值，
  // 字符串比较$gte对空值永远不成立，会被无声漏掉——即使内容齐全、即使刚上传，也不会喂给AI，
  // AI据此误判"没做过该检查"。用createdAt兜底这批checkDate缺失的报告（2026-07-17反馈排查确认）。
  const recent = await MedicalReport.find({
    user: userId,
    $or: [
      { checkDate: { $gte: oneYearAgoStr } },
      { checkDate: { $in: [null, ''] }, createdAt: { $gte: oneYearAgo } },
    ],
  })
    .sort({ checkDate: -1, createdAt: -1 })
    .select(selectFields)
    .limit(limit);
  if (recent.length > 0) return recent;
  // 近一年无任何报告：回退取最近一次，避免风险评估完全没有体检数据可用
  return MedicalReport.find({ user: userId })
    .sort({ checkDate: -1, createdAt: -1 })
    .select(selectFields)
    .limit(1);
}

const TUMOR_MARKER_KEYWORDS = ['肿瘤标志物', 'PSA', 'AFP', 'CEA', 'CA199', 'CA125', 'CA153', 'NSE', 'CA724', 'CA242'];
const TUMOR_FINDING_KEYWORDS = ['息肉', '结节', '肠化', '不典型增生', '异型增生', '囊实性', 'TI-RADS', 'BI-RADS', '占位', '肿物'];
async function tumorSignalsFromReports(userId) {
  const MedicalReport = require('../models/MedicalReport');
  const reports = await selectRecentReports(MedicalReport, userId, 'title type checkDate screeningCategory reportItems', 50);
  const lines = [];
  const geneticLines = [];
  reports.forEach(r => {
    const dateStr = (r.checkDate || '').slice(0, 10) || '';
    const isGeneticReport = r.type === 'genetic' || (r.title || '').includes('基因');
    if (isGeneticReport) {
      (r.reportItems || []).forEach(it => {
        if (it.name && (it.value || it.diagnosis || it.findings)) {
          geneticLines.push(`${dateStr} ${it.name}：${it.value || it.diagnosis || it.findings}`);
        }
      });
      return;
    }
    (r.reportItems || []).forEach(it => {
      const name = it.name || '';
      const isMarker = TUMOR_MARKER_KEYWORDS.some(kw => name.toLowerCase().includes(kw.toLowerCase()));
      if (isMarker && it.status === 'abnormal' && it.value) {
        lines.push(`${dateStr} ${name}：${it.value}${it.unit || ''}（异常）`);
        return;
      }
      const text = `${it.diagnosis || ''} ${it.findings || ''}`;
      const isFinding = it.itemType === 'imaging' && TUMOR_FINDING_KEYWORDS.some(kw => text.includes(kw));
      if (isFinding) {
        lines.push(`${dateStr} ${name}：${(it.diagnosis || it.findings || '').slice(0, 100)}`);
      }
    });
  });
  return { markerAndFindingLines: lines, geneticLines };
}

// 生成AI风险评估：供医护端接口和用户端自助接口共用
async function generateRiskAssessment(user) {
  const MedicalReport = require('../models/MedicalReport');
  const { deriveLabFromReports, buildLatestLabText, latestToLabValues } = require('./labFromScreening');

  // 【体检关键指标】+ 规则引擎信号：从专项筛查报告 reportItems 派生真实数值（与医护端「体检关键指标」卡片同源），
  // 而非读几乎为空的 user.labValues（2026-07-10 根因修复："AI提取数据没一次对的"）。
  // 2026-07-11：严格限定最近一年，避免过时体检数据污染当前风险判断（近一年无数据则回退最近一次，见selectRecentReports）。
  const reports = await selectRecentReports(MedicalReport, user._id, 'title screeningL2 checkDate date reportYear reportItems', 60);
  const { latest: derivedLab } = deriveLabFromReports(reports);
  // 派生真实值优先，user.labValues 仅作补充兜底（万一某指标报告没有但医护手动录了）
  const lv = { ...(user.labValues || {}), ...latestToLabValues(derivedLab) };
  const signals = ruleEngineSignals(lv);
  const { markerAndFindingLines, geneticLines } = await tumorSignalsFromReports(user._id);
  if (markerAndFindingLines.length) signals.tumor = markerAndFindingLines;
  const sigText = Object.entries(signals)
    .map(([k, arr]) => `${k}：${arr.length ? arr.join('；') : '规则引擎未发现明显异常'}`)
    .join('\n');

  const labLines = buildLatestLabText(derivedLab);

  const ls = user.lifestyle || {};
  const lifestyleLines = [
    ls.smoking && `吸烟：${ls.smoking}`,
    ls.alcohol && `饮酒：${ls.alcohol}`,
    ls.diet && `饮食：${ls.diet}`,
  ].filter(Boolean).join('；') || '暂无生活方式记录';

  const geneticText = geneticLines.length ? geneticLines.join('\n') : '暂无基因检测报告';

  // 近30天打卡记录：与体检报告互补，体现更实时的血压/血糖/体重波动，可能影响心血管/糖尿病风险的即时判断（2026-07-11）
  const HealthRecord = require('../models/HealthRecord');
  const recentCheckins = await HealthRecord.find({
    user: user._id, type: { $in: ['bloodPressure', 'bloodSugar', 'weight', 'heartRate'] },
    recordedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  }).sort({ recordedAt: -1 }).select('type value extra recordedAt').lean();
  const CHECKIN_LABEL2 = { bloodPressure: '血压', bloodSugar: '血糖', weight: '体重', heartRate: '心率' };
  const checkinByType2 = {};
  recentCheckins.forEach(r => { (checkinByType2[r.type] = checkinByType2[r.type] || []).push(r); });
  const checkinText = Object.entries(checkinByType2).map(([type, recs]) => {
    const label = CHECKIN_LABEL2[type] || type;
    const fmt = (r) => type === 'bloodPressure' && r.extra?.sys && r.extra?.dia ? `${r.extra.sys}/${r.extra.dia}` : r.value;
    const first = recs[recs.length - 1], last = recs[0];
    return `${label}：近30天共${recs.length}次打卡，最早${fmt(first)}→最近${fmt(last)}`;
  }).join('\n') || '近30天暂无相关打卡记录';

  const prompt = `你是一位健康风险评估专家，请基于规则引擎信号和体检数据，对以下4个维度做风险分级。建议内容如涉及需要医生跟进，一律使用"家庭医生"这一称呼，不要用"主治医生"（本平台提供的是家庭医生服务）。

【患者】姓名：${user.name}，性别：${user.gender || '未知'}，年龄：${user.age || '未知'}岁；慢病标签：${user.chronicDiseases?.join('、') || '无'}；既往史：${user.healthProfile?.pastHistory || '无'}；家族史：${user.healthProfile?.familyHistoryNote || '无'}
【个人生活习惯】${lifestyleLines}
【体检关键指标（近一年）】${labLines}
【规则引擎预警信号】
${sigText}
【基因检测报告】
${geneticText}
【近30天打卡记录（血压/血糖/体重/心率日常自测，体现比体检报告更实时的波动）】
${checkinText}

心血管和糖尿病风险维度请特别关注【近30天打卡记录】：如果打卡显示血压/血糖近期持续偏高或波动明显，即使体检报告是达标的，也应在相应维度提示"近期自测数据显示XX有上升趋势，建议复查"，不能仅依赖可能已经过时的体检报告下结论。
肿瘤风险维度请结合上方"tumor"信号（近一年专项筛查报告中的标志物异常、内镜/影像癌前病变或结节记录）、个人生活习惯（吸烟/饮酒/饮食是肺癌/肝癌/胃肠癌的强相关因素）、既往史、家族史、基因检测报告（如有明确高风险位点/基因，应显著提高风险等级）综合判断；信号为空不代表零风险，需结合年龄、性别、生活习惯、家族史等基础风险因素给出合理评估，不要机械地判为low。

请严格按以下JSON输出（level 取值：low/medium/high/critical，分别代表低/中/高/危急值；score 0-100）：
{
  "dimensions": [
    { "key": "cardiovascular", "label": "心血管疾病风险", "level": "low", "score": 20, "factors": ["关键风险因素"], "advice": "针对性建议（30-60字）" },
    { "key": "diabetes", "label": "糖尿病风险", "level": "low", "score": 15, "factors": [], "advice": "" },
    { "key": "tumor", "label": "肿瘤风险", "level": "low", "score": 10, "factors": [], "advice": "" },
    { "key": "kidney", "label": "慢性肾病风险", "level": "low", "score": 10, "factors": [], "advice": "" }
  ],
  "overallSummary": "整体风险综述（50-100字）"
}`;

  const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1500 });
  let raw = {};
  try { const m = text.trim().match(/\{[\s\S]*\}/); if (m) raw = JSON.parse(m[0]); } catch {}

  let dimensions = Array.isArray(raw.dimensions) ? raw.dimensions : [];
  dimensions = dimensions.map(d => ({
    key: d.key, label: d.label || d.key,
    level: RISK_LEVELS.includes(d.level) ? d.level : 'low',
    score: Number(d.score) || 0,
    factors: Array.isArray(d.factors) ? d.factors : [],
    advice: d.advice || '',
  }));
  const overallLevel = dimensions.reduce((max, d) =>
    RISK_LEVELS.indexOf(d.level) > RISK_LEVELS.indexOf(max) ? d.level : max, 'low');

  return {
    dimensions,
    overallLevel,
    overallSummary: raw.overallSummary || '',
    generatedAt: new Date(),
    approvedAt: null,
    approvedBy: null,
    alerted: ['high', 'critical'].includes(overallLevel),
  };
}

module.exports = { RISK_LEVELS, ruleEngineSignals, tumorSignalsFromReports, generateRiskAssessment };
