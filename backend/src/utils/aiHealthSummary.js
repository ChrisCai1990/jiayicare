const { chat } = require('./ai');
const { deriveLabFromReports, buildLatestLabText, buildTrendText, extractTumorMarkers, buildTumorMarkerText, extractGeneticFindings, extractExamFindings } = require('./labFromScreening');
const { assessCancerCoverage, buildCoverageText } = require('./cancerScreeningCoverage');
const { buildEvidenceCatalog } = require('./aiFactGuard');

const DOCTOR_KEYS = ['medical_priority', 'tumor_risk', 'cardiovascular_risk', 'chronic_disease', 'checkup_completeness'];
const LIFESTYLE_KEY = 'lifestyle_assessment';

const COMMON_CANCER_CATALOG = {
  M: ['肺癌', '结直肠癌', '肝癌', '胃癌', '食管癌', '前列腺癌', '甲状腺癌', '膀胱癌', '胰腺癌', '淋巴瘤'],
  F: ['肺癌', '乳腺癌', '甲状腺癌', '结直肠癌', '宫颈癌', '胃癌', '肝癌', '子宫体癌', '卵巢癌', '食管癌'],
};

function buildCancerCatalogText(user) {
  const genderKey = user.gender === '女' ? 'F' : 'M';
  return COMMON_CANCER_CATALOG[genderKey].map((label, index) => `${index + 1}. ${label}`).join('\n');
}

// 先用确定性关键词把分散在年度体检、组合超声、内镜及病理中的癌种相关证据归拢，
// 再交给AI总结。它不替代原始证据目录，只解决长报告中某一年/某个组合项目容易被遗漏的问题。
const CANCER_EVIDENCE_RULES = {
  肺癌: /胸部CT|肺部CT|肺CT|LDCT|肺结节|磨玻璃|肺纤维/i,
  结直肠癌: /肠镜|结肠镜|直肠镜|回肠末端|结肠|直肠|肠息肉|肠病理|粪便隐血|便潜血|FOBT/i,
  肝癌: /肝脏|肝胆|脂肪肝|甲胎蛋白|\bAFP\b|肝纤维|纤维化|弹性超声|弹性成像|透明质酸|层粘连蛋白|Ⅲ型前胶原|III型前胶原|Ⅳ型胶原|IV型胶原/i,
  胃癌: /胃镜|胃窦|胃角|胃体|胃底|胃黏膜|胃病理|幽门螺杆|碳13|碳14|13C|14C/i,
  食管癌: /食管|胃镜|食管镜|反流性食管炎|Barrett/i,
  前列腺癌: /前列腺|\bPSA\b|前列腺特异抗原/i,
  甲状腺癌: /甲状腺|TI-RADS|TIRADS/i,
  膀胱癌: /膀胱|泌尿系|双肾.*输尿管|输尿管.*膀胱|尿路超声|尿潜血|尿隐血/i,
  胰腺癌: /胰腺|肝胆胰脾|上腹部超声|腹部CT|CA19-9|CA199/i,
  淋巴瘤: /淋巴结|淋巴瘤|浅表淋巴|纵隔淋巴/i,
  乳腺癌: /乳腺|乳房|BI-RADS|BIRADS|钼靶|乳腺X线/i,
  宫颈癌: /宫颈|HPV|TCT|液基细胞|阴道镜/i,
  子宫体癌: /子宫|宫腔|内膜|阴道超声|经阴道超声/i,
  卵巢癌: /卵巢|附件|子宫附件|阴道超声|经阴道超声|CA125|HE4/i,
};

function buildCancerEvidenceText(user, reports) {
  const names = COMMON_CANCER_CATALOG[user.gender === '女' ? 'F' : 'M'];
  const cutoffYear = new Date().getFullYear() - 4;
  const lines = [];
  names.forEach(name => {
    const pattern = CANCER_EVIDENCE_RULES[name];
    const hits = [];
    reports.forEach((report, reportIndex) => {
      const date = String(report.checkDate || report.date || '').slice(0, 10);
      const year = Number(report.reportYear || date.slice(0, 4));
      if (Number.isFinite(year) && year < cutoffYear) return;
      const reportText = [report.title, report.screeningL2, report.examConclusion, report.note].filter(Boolean).join(' ');
      const matchedItems = (report.reportItems || []).filter(item => pattern.test([
        item.name, item.bodyPart, item.findings, item.diagnosis, item.conclusion,
      ].filter(Boolean).join(' ')));
      if (!pattern.test(reportText) && !matchedItems.length) return;
      const evidenceId = `RPT-${String(reportIndex + 1).padStart(3, '0')}`;
      const details = matchedItems.slice(0, 12).map(item => {
        const raw = [item.value, item.unit, item.findings, item.diagnosis, item.conclusion].filter(Boolean).join('；');
        const type = item.itemType === 'pathology' || /病理|活检|组织学/.test(`${item.name || ''}${raw}`)
          ? '病理' : (item.itemType === 'endoscopy' || /胃镜|肠镜|内镜/.test(item.name || '') ? '内镜' : (item.itemType === 'imaging' ? '影像' : '检验'));
        return `${type}:${item.name || '未命名'}=${raw || '未记录结果'}`;
      });
      hits.push(`[${evidenceId}] ${date || year || '日期未知'} ${details.length ? details.join(' | ') : reportText.slice(0, 240)}`);
    });
    lines.push(`【${name}】${hits.length ? `\n${hits.join('\n')}` : '近5年未匹配到相关记录'}`);
  });
  return lines.join('\n');
}

const FOCUSED_TREND_RULES = {
  心电图: /心电图|ECG|窦性心律|ST[-—]?T|ST段|T波/i,
  心脏超声: /心脏超声|心脏彩超|超声心动图|射血分数|LVEF/i,
  冠脉CTA: /冠脉CTA|冠状动脉CTA|冠脉CT|冠状动脉CT/i,
  运动评估: /运动评估|运动负荷|运动心电|心肺运动|平板试验|踏车试验/i,
  心脏磁共振: /心脏磁共振|心脏MRI|心肌磁共振|CMR/i,
  颈动脉超声: /颈动脉超声|颈动脉彩超|颈动脉斑块|颈动脉内中膜/i,
  头颅MRI: /头颅MRI|颅脑MRI|头颅磁共振|颅脑磁共振/i,
  头颅MRA: /头颅MRA|颅脑MRA|脑血管MRA|磁共振血管成像/i,
  同型半胱氨酸: /同型半胱氨酸|\bHcy\b/i,
  脂蛋白磷脂酶A2: /脂蛋白.*磷脂酶A2|Lp-?PLA2/i,
  血压: /血压|收缩压|舒张压/i,
  血糖: /空腹血糖|葡萄糖|糖化血红蛋白|HbA1c/i,
  血脂: /总胆固醇|高密度脂蛋白|低密度脂蛋白|甘油三酯|载脂蛋白|脂蛋白\(a\)|\bTC\b|HDL|LDL|\bTG\b/i,
  尿酸: /尿酸|\bUA\b/i,
  肾功能: /肾功能|肌酐|尿素氮|尿素|估算肾小球滤过率|肾小球滤过率|eGFR|胱抑素C/i,
  骨质疏松: /骨密度|骨质疏松|骨量减少|T值|T-score|Z值|Z-score/i,
};

function buildFocusedTrendEvidenceText(reports) {
  const cutoffYear = new Date().getFullYear() - 4;
  return Object.entries(FOCUSED_TREND_RULES).map(([topic, pattern]) => {
    const hits = [];
    reports.forEach((report, reportIndex) => {
      const date = String(report.checkDate || report.date || '').slice(0, 10);
      const year = Number(report.reportYear || date.slice(0, 4));
      if (Number.isFinite(year) && year < cutoffYear) return;
      const matched = (report.reportItems || []).filter(item => pattern.test([
        item.name, item.bodyPart, item.value, item.findings, item.diagnosis, item.conclusion,
      ].filter(Boolean).join(' ')));
      if (!matched.length) return;
      const evidenceId = `RPT-${String(reportIndex + 1).padStart(3, '0')}`;
      hits.push(`[${evidenceId}] ${date || year || '日期未知'} ${matched.slice(0, 12).map(item =>
        `${item.name || '未命名'}=${[item.value, item.unit, item.findings, item.diagnosis, item.conclusion].filter(Boolean).join('；') || '未记录结果'}`
      ).join(' | ')}`);
    });
    return `【${topic}】${hits.length ? `\n${hits.join('\n')}` : '近5年无记录'}`;
  }).join('\n');
}

// 生成AI健康汇总分析的 sections 内容（不含审核字段），供医护端接口和用户端自助接口共用
// scope: 'all'（默认，全量生成）| 'doctor'（仅5维度，生活方式评估留空对象供上层合并旧值）| 'nutrition'（仅生活方式评估）
// existingSections: 已有的 sections（用于生成时给AI提供另一方内容作为上下文，实现两部分内容互相关联而非孤立）
async function generateHealthSummarySections(user, {
  scope = 'all', existingSections = null, analysisYear = null, incrementalBase = null,
  reusedTumorSection = null,
} = {}) {
  const MedicalReport = require('../models/MedicalReport');
  const Medication = require('../models/Medication');
  const Supplement = require('../models/Supplement');
  const HealthRecord = require('../models/HealthRecord');

  const [activeMeds, activeSupplements, recentCheckins] = await Promise.all([
    Medication.find({ user: user._id, stopped: false }).select('name dosage frequency purpose startDate').lean(),
    Supplement.find({ user: user._id, stopped: false }).select('name dosage frequency purpose startDate').lean(),
    // 近30天打卡记录（体重/血压/血糖/睡眠/运动/情绪等），2026-07-11新增：此前AI健康分析完全没读打卡数据，
    // 只看体检报告和手动录入的档案字段，导致日常打卡趋势(如体重变化/运动频率/睡眠时长)无法体现在分析里
    HealthRecord.find({ user: user._id, recordedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
      .sort({ recordedAt: -1 }).select('type value extra unit recordedAt').lean(),
  ]);
  const medicationSummary = activeMeds.length
    ? activeMeds.map(m => `${m.name} ${m.dosage}，${m.frequency}${m.purpose ? `（${m.purpose}）` : ''}${m.startDate ? `，自${m.startDate}起` : ''}`).join('；')
    : '暂无长期用药记录';
  const supplementSummary = activeSupplements.length
    ? activeSupplements.map(s => `${s.name} ${s.dosage}，${s.frequency}${s.purpose ? `（${s.purpose}）` : ''}${s.startDate ? `，自${s.startDate}起` : ''}`).join('；')
    : '暂无长期营养素补充记录';

  const allHistoricalReports = await MedicalReport.find({ user: user._id })
    .sort({ checkDate: -1, date: -1, createdAt: -1 })
    .select('title screeningL2 examConclusion checkDate date reportYear screeningCategory reportItems note');
  const targetYear = Number(analysisYear);
  const useIncremental = !!(incrementalBase?.sections && Number.isFinite(targetYear));
  // 有上一年度已审核基线时，只把目标年度新增报告送入AI；历史趋势由已审核基线承接。
  // 规则引擎仍可读取完整历史，用于肿瘤覆盖周期等确定性判断。
  let allReports = useIncremental
    ? allHistoricalReports.filter(report => {
      const date = String(report.checkDate || report.date || '');
      return Number(report.reportYear || date.slice(0, 4)) === targetYear;
    })
    : allHistoricalReports;
  const reuseTumor = !!(reusedTumorSection && (scope === 'doctor' || scope === 'all'));
  if (reuseTumor) {
    allReports = allReports.filter(report => {
      const text = [report.screeningCategory, report.title, report.screeningL2].filter(Boolean).join(' ');
      return report.screeningCategory !== 'tumor' && !/肿瘤筛查|癌早筛/.test(text);
    });
  }

  // 【体检关键指标】立足点：优先从专项筛查报告 reportItems 派生真实数值（与医护端「体检关键指标」卡片同源），
  // 而非读几乎为空的 user.labValues。这是"AI提取数据没一次对的"的根因修复（2026-07-10）。
  const { latest: derivedLab, trend: derivedTrend } = deriveLabFromReports(allReports);
  const lv = user.labValues || {};
  const bc = user.bodyComposition || {};
  // 身体成分（超声/体成分不在专项筛查数值提取范围内，仍读手动录入字段作为补充）
  const bcLines = [
    lv.waist && `腰围 ${lv.waist} cm`,
    bc.skelMuscle  && `骨骼肌量 ${bc.skelMuscle} kg`,
    bc.visceralFat && `内脏脂肪 ${bc.visceralFat}`,
    bc.bodyFatRate && `体脂率 ${bc.bodyFatRate}%`,
  ].filter(Boolean);
  const labSummary = [buildLatestLabText(derivedLab), bcLines.join('、')].filter(Boolean).join('、');

  const reportsByYear = {};
  allReports.forEach(r => {
    const dateStr = r.checkDate || r.date || '';
    const year = r.reportYear || (dateStr ? dateStr.slice(0, 4) : null);
    if (!year) return;
    if (!reportsByYear[year]) reportsByYear[year] = [];
    reportsByYear[year].push(r);
  });
  const reportSummaryLines = [];
  const latestReportYear = Math.max(new Date().getFullYear(), ...Object.keys(reportsByYear).map(Number).filter(Number.isFinite));
  const trendYears = Object.keys(reportsByYear)
    .map(Number).filter(year => Number.isFinite(year) && year >= latestReportYear - 4 && year <= latestReportYear)
    .sort((a, b) => b - a);
  trendYears.forEach(year => {
    reportSummaryLines.push(`▶ ${year}年：`);
    reportsByYear[year].forEach(r => {
      const evidenceId = `RPT-${String(allReports.findIndex(item => String(item._id) === String(r._id)) + 1).padStart(3, '0')}`;
      const conclusion = r.examConclusion ? r.examConclusion.slice(0, 150) : (r.note ? r.note.slice(0, 100) : '未记录结论');
      const abnormal = (r.reportItems || []).filter(i => i.status === 'abnormal').map(i => i.name).join('、');
      const dateStr = (r.checkDate || r.date || '').slice(0, 10);
      reportSummaryLines.push(`  - [${evidenceId}] ${r.screeningL2 || r.title}（${dateStr}）：${conclusion}${abnormal ? '；异常项：' + abnormal : ''}`);
      (r.reportItems || []).filter(i => i.itemType === 'imaging' && (i.findings || i.diagnosis)).forEach(img => {
        const f = (img.findings || '').slice(0, 200);
        const d = (img.diagnosis || '').slice(0, 100);
        reportSummaryLines.push(`     · ${img.name}${img.bodyPart ? `(${img.bodyPart})` : ''}：检查所见「${f}」${d ? `；诊断「${d}」` : ''}`);
      });
    });
  });
  const reportSummary = reportSummaryLines.length > 0 ? reportSummaryLines.join('\n') : '暂无专项筛查记录';

  // 历年趋势：从专项筛查报告按年份提取各指标历次真实值（不再依赖几乎为空的 user.labHistory）
  const labTrendLines = buildTrendText(derivedTrend);

  // 肿瘤标志物（单独维度）+ 基因检测：数据源扩全，健康分析要读全部专项筛查数据（2026-07-10 金娟）
  const tumorMarkerText = buildTumorMarkerText(extractTumorMarkers(allReports));
  const geneticText = extractGeneticFindings(allReports);
  // 专科检查异常发现：从所有报告 diagnosis/conclusion 文字里识别明确异常（听力/视力/眼耳鼻喉/口腔/骨密度等），
  // 解决"异常写在文字里但 status 没标 abnormal 就被 AI 忽略"（金娟2026右耳高频听力下降此前未体现）——2026-07-10
  const examFindingsText = extractExamFindings(allReports);
  // 肿瘤筛查覆盖度（规则引擎确定性结论，按男女前十大肿瘤逐项判断"该做的筛查做了没"，
  // 含胃镜免胃蛋白酶原/肠镜免便潜血/HP连续3年阴性/乳腺钼靶40岁等规则）——2026-07-10 金娟
  const cancerCoverage = reuseTumor ? [] : assessCancerCoverage(user, allHistoricalReports);
  const coverageText = reuseTumor ? '本次复用已生成肿瘤板块，不重复分析' : buildCoverageText(cancerCoverage);
  const cancerCatalogText = reuseTumor ? '本次复用' : buildCancerCatalogText(user);
  const cancerEvidenceText = reuseTumor ? '本次复用' : buildCancerEvidenceText(user, allReports);
  const focusedTrendEvidenceText = buildFocusedTrendEvidenceText(allReports);

  // 近30天打卡记录汇总：按type分组，数值类给出首末值+均值体现趋势，文本类给出最近几条原文
  const CHECKIN_LABEL = { weight: '体重(kg)', bloodPressure: '血压(mmHg)', bloodSugar: '血糖(mmol/L)', heartRate: '心率(次/分)', sleep: '睡眠(小时)', mood: '情绪(1-10分)', exercise: '运动', diet: '饮食', water: '饮水', bowel: '排便', smoking: '吸烟', alcohol: '饮酒', symptom: '症状自评' };
  const NUMERIC_CHECKIN_TYPES = new Set(['weight', 'bloodSugar', 'heartRate', 'sleep', 'mood']);
  const checkinByType = {};
  recentCheckins.forEach(r => { (checkinByType[r.type] = checkinByType[r.type] || []).push(r); });
  const checkinSummary = Object.entries(checkinByType).map(([type, recs]) => {
    const label = CHECKIN_LABEL[type] || type;
    if (type === 'bloodPressure') {
      const first = recs[recs.length - 1], last = recs[0];
      const fmt = (r) => r.extra?.sys && r.extra?.dia ? `${r.extra.sys}/${r.extra.dia}` : r.value;
      return `${label}：近30天共${recs.length}次记录，最早${fmt(first)}→最近${fmt(last)}`;
    }
    if (NUMERIC_CHECKIN_TYPES.has(type)) {
      const nums = recs.map(r => parseFloat(r.value)).filter(v => !isNaN(v));
      if (!nums.length) return null;
      const avg = (nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(1);
      return `${label}：近30天共${recs.length}次记录，最早${nums[nums.length - 1]}→最近${nums[0]}，均值${avg}`;
    }
    // 文本类（运动/饮食/饮水/排便/吸烟/饮酒）：列最近3条原文，体现近期习惯
    return `${label}：近30天共${recs.length}次记录，最近几条 - ${recs.slice(0, 3).map(r => r.value).join('；')}`;
  }).filter(Boolean).join('\n') || '近30天暂无打卡记录';

  const ls  = user.lifestyle || {};
  const lsd = user.lifestyle_data || {};
  const dietOverview = lsd.summaryOverride
    || (Array.isArray(lsd.autoSummaryFlags) && lsd.autoSummaryFlags.length ? lsd.autoSummaryFlags.join('；') : '')
    || ls.diet || '';
  const lifestyleSummary = [
    dietOverview && `膳食调查综合概述：${dietOverview}`,
    ls.diet     && `饮食：${ls.diet}`,
    ls.exercise && `运动：${ls.exercise}`,
    ls.sleep    && `睡眠：${ls.sleep}`,
    ls.water    && `饮水：${ls.water}`,
    ls.alcohol  && `饮酒：${ls.alcohol}`,
    ls.smoking  && `吸烟：${ls.smoking}`,
    ls.bowel    && `排便：${ls.bowel}`,
    ls.mood     && `情绪：${ls.mood}`,
  ].filter(Boolean).join('\n') || '暂无生活方式/膳食调查数据';

  const hp = user.healthProfile || {};
  const archiveSummary = [
    hp.pastHistory && `既往史：${hp.pastHistory}`,
    hp.familyHistoryNote && `家族史：${hp.familyHistoryNote}`,
    Array.isArray(hp.recentSymptoms) && hp.recentSymptoms.length && `近3个月躯体症状：${hp.recentSymptoms.join('、')}`,
    hp.drugAllergy && `药物过敏：${hp.drugAllergy}`,
  ].filter(Boolean).join('\n') || '无特殊记录';

  const pa = user.psychAssessments || {};
  const PSYCH_SCALE_LABEL = { epworth: 'Epworth嗜睡量表', scl90: 'SCL90症状自评量表', sds: 'SDS抑郁自评量表', sas: 'SAS焦虑自评量表' };
  // 按年度存档后取最近一年的结果；兼容旧版无 byYear 的扁平数据
  const latestPsych = (raw) => {
    if (!raw) return null;
    if (raw.byYear) {
      const years = Object.keys(raw.byYear).sort((a, b) => Number(b) - Number(a));
      return years.length ? raw.byYear[years[0]] : null;
    }
    return raw.totalScore !== undefined ? raw : null;
  };
  const psychSummary = Object.entries(PSYCH_SCALE_LABEL)
    .map(([key, label]) => {
      const r = latestPsych(pa[key]);
      if (!r) return null;
      let factorStr = '';
      if (key === 'scl90' && r.factorScores) {
        // 带上每个因子的正常/异常判定（SCL90因子分≥2才算异常），避免AI把正常范围内偏高值(如1.2)误读成"升高"
        // ——金娟名下会员精神病性因子1.2实为正常，此前被AI说成"升高"且错塞进心脑血管维度
        const fa = r.factorAssessment || {};
        const abn = Object.entries(r.factorScores).filter(([f]) => (fa[f] && fa[f].level && fa[f].level !== 'normal'));
        factorStr = abn.length
          ? `（因子分≥2为异常；异常因子：${abn.map(([f, s]) => `${f}${s}(${fa[f].label})`).join('、')}；其余因子均在正常范围）`
          : `（全部10个因子分均<2，均为正常范围，无异常因子；最高为${Object.entries(r.factorScores).sort((a, b) => b[1] - a[1])[0].join('')}但仍属正常）`;
      }
      const sev = r.severity || (key === 'scl90' ? '总分参考：<160为阴性' : '');
      return `${label}（${String(r.filledAt).slice(0,10)}）：总分${r.totalScore}分${sev ? '，' + sev : ''}${factorStr}`;
    })
    .filter(Boolean).join('\n') || '暂无心理健康量表评估记录';

  const wantDoctor = scope === 'all' || scope === 'doctor';
  const wantLifestyle = scope === 'all' || scope === 'nutrition';

  const roleIntro = scope === 'nutrition'
    ? '你是健康信息整理助手，请仅整理会员生活方式资料并生成结构化信息摘要。'
    : scope === 'doctor'
      ? '你是健康信息整理助手，请仅对现有健康档案、检查报告及记录进行5个维度的信息整理。'
      : '你是健康信息整理助手，请根据会员已有资料生成结构化健康信息整理报告。';

  const evidenceCatalog = buildEvidenceCatalog(user, allReports, [
    `规则计算的肿瘤筛查覆盖度：${coverageText}`,
    `最近一次关键指标：${labSummary}`,
    `专科检查异常：${examFindingsText}`,
    useIncremental ? `上一年度已审核AI健康信息整理（仅作为历史基线，需用本年度新资料更新）：${JSON.stringify(incrementalBase.sections)}` : '',
  ]);

  const prompt = `${roleIntro}
【服务边界——最高优先级】本输出仅用于整理用户已提供的健康资料和呈现变化趋势，不提供诊断、疾病概率判断、病因推断、治疗方案、检查开单、处方，以及药物或营养补充剂的新增、停用、替换、剂量和用法建议。异常信息只能忠实引用原报告、参考范围或用户记录，并提示用户携带原始资料咨询正规医疗机构。当前用药和营养补充信息只可作为原始记录展示，不得推断其与指标异常存在因果关系，也不得据此建议调整。department字段固定输出空字符串。问题分析必须身心结合，但不得将心理量表与躯体疾病建立未经原始资料明确记载的因果关系。

【医疗事实铁律——优先级高于其他要求】
①只能使用下方资料明确存在的会员事实。输入未记载时写“资料未提供/不足以判断”，禁止补全或猜测。
②严禁相近概念替换：冠心病、冠脉支架、心肌梗死不等于脑梗死/脑卒中；颈动脉斑块不等于脑卒中；肥胖、血脂异常等风险因素不等于已确诊心脑血管病。
③每条结论先在证据目录中找到依据；无依据的诊断和病史不得输出。资料冲突时写“资料冲突，待人工确认”。
④逐份、逐项核对报告，不得只挑少数重要指标；输出前自检是否遗漏已有检查、是否新增不存在的疾病、是否混淆疾病名称。

【心理量表铁律——必须严格遵守】①SCL90各因子分必须严格按系统标注的正常/异常判定来解读：因子分＜2一律属正常范围，即使某因子（如精神病性1.2）在数值上略高于其他因子，只要＜2就是正常，绝不能描述为"升高/偏高/异常"。②心理量表（SCL90/SAS/SDS/嗜睡）的因子和结论只能写进"情绪/心理"相关分析，严禁把精神病性、偏执等心理因子塞进 cardiovascular_risk（心脑血管）、tumor_risk（肿瘤）等躯体维度——这些心理因子与躯体疾病风险无直接因果关系。③只有当系统明确标注某因子为异常时，才可在情绪维度提示。

分析原则：以【最近一次体检关键指标】为立足点判断当前健康状态，结合【历年体检指标趋势】和【历年专项筛查报告】判断变化方向与风险演进，并结合【健康档案】【生活方式与膳食调查】【近30天打卡记录】【当前用药与营养素补充】综合评估。【近30天打卡记录】反映的是体检之后更实时的自测数据（如体重是否持续下降、血压近期是否稳定、运动频率、睡眠时长），如果与体检报告结论有出入（如体检时血压正常但近期打卡持续偏高），应在相应维度中明确指出这一变化趋势。专项筛查报告中的检查所见（影像/内镜）请重点比对历年同类检查变化。每个分析维度都应体现「几年数据的趋势变化 → 当前结论 → 下一步」而非仅描述当前值。

【心脑血管与慢病趋势卡规则——严格限定范围】
①cardiovascular_risk.topics只允许以下主题，且每种检查独立建卡、独立比较：心电图、心脏超声、冠脉CTA、运动评估/运动负荷试验、心脏磁共振；脑血管方向为颈动脉超声、头颅MRI、头颅MRA、同型半胱氨酸、脂蛋白磷脂酶A2（Lp-PLA2）。其他项目不得放入心脑血管趋势卡。
②chronic_disease.items只允许最多6张聚合卡，并固定按以下顺序输出：血压、血糖、血脂、尿酸、肾功能、骨质疏松。空腹血糖和糖化血红蛋白必须合并在同一张“血糖”卡内；总胆固醇、HDL-C、LDL-C、甘油三酯及报告中同组血脂指标必须合并在同一张“血脂”卡内；肌酐、尿素氮、eGFR、胱抑素C等合并在“肾功能”卡内；骨密度、T值/Z值、骨量减少或骨质疏松描述合并在“骨质疏松”卡内。严禁把子指标拆成独立卡片。肝功能、听力、视力、甲状腺功能及其他专科项目不得输出到慢病趋势卡。
③只按会员真实存在的资料建卡，不为凑数量创建空主题。每张卡先找最近一次，再比较最近5个自然年内同名指标或同类检查；0次不建卡，1次=baseline，至少2个可比点才可判断stable/improving/worsening/fluctuating。不同检测方法、单位或部位不得硬比较，写not_comparable。关键变化最多3条，不逐年堆砌全文。

【肿瘤标志物解读铁律——必须严格遵守，避免制造恐慌】除 PSA（前列腺癌相对特异）外，AFP/CEA/CA19-9/CA125/CA15-3/CA724/HE4/NSE 等常见肿瘤标志物特异性都不高：单项轻度升高绝不能直接判为"疑似癌症"或建议会员恐慌就医，必须结合影像/内镜结果、动态趋势（是否持续进行性升高）、既往史家族史综合判断。标志物正常也不代表无肿瘤风险。请在 tumor_risk 维度中明确说明标志物的这一局限性。

【肿瘤覆盖与趋势输出铁律】
①必须按下方性别对应的10种常见肿瘤逐项输出，既不能遗漏，也不能把“常见肿瘤目录”等同于“每年必须做10项筛查”。
②先判断该会员是否达到常规或高风险筛查条件。资料不足时状态写unknown，禁止直接写overdue；暂无普通无症状人群常规筛查依据时写not_routinely_recommended，不得写“漏筛”。
③提醒优先级：原报告/医生明确复查期限 > 已有异常随访 > 规则引擎筛查周期。只有证据明确支持一年一次时，超过一年才能写overdue；不得把正常肠镜、HPV/TCT等全部粗暴设成一年到期。
④趋势最长比较最近5个自然年。0次记录写no_data；1次写baseline（仅建立基线，禁止写稳定）；至少2个可比时间点才可写stable/improving/worsening/fluctuating。不能确认是同一病灶、检查方法或单位不可比时写not_comparable。
⑤影像/内镜趋势只比较原报告明确记载的部位、数量、大小、性质和分级；不得自行对应病灶。每项趋势结论必须简短，关键变化最多3条，并保留证据编号。
⑥肿瘤标志物只能作为辅助趋势，正常不代表排除肿瘤，单项轻度升高不得判癌。
⑦必须逐项使用【常见肿瘤近5年分组证据】核对年份，分组证据中存在的年份不得遗漏。结直肠癌尤其要同时核对历年肠镜；组合名称“泌尿系超声/双肾输尿管膀胱”中明确包含膀胱时，必须计入膀胱影像记录。
⑧同一器官的不同检查类型分轨比较：内镜所见只与内镜所见比较，病理只与病理比较，影像只与影像比较，检验指标按同名指标比较。禁止用2023年病理分级与2026年胃镜下分级直接得出“进展/改善”；应分别写“内镜变化”和“病理变化”，缺少同轨时间点时写仅建立基线。
⑨肝癌卡必须逐项核对：肝脏影像、AFP、肝脏弹性/纤维化超声，以及透明质酸、层粘连蛋白、Ⅲ型前胶原、Ⅳ型胶原等已存在的肝纤维化指标；有记录就呈现其同名指标趋势，不得只写AFP和脂肪肝。
⑩胰弹性蛋白酶/粪便胰弹性蛋白酶反映胰腺外分泌功能，不得作为胰腺癌筛查证据、异常或趋势。胰腺癌基础覆盖只认明确观察胰腺的腹部影像；CA19-9仅作辅助。
⑪已经有有效期内肠镜时，粪便隐血/FOBT不得列为“需关注、到期或优先补做”；已经完成胃肠镜也不得仅因粪便隐血阳性直接生成“优先排查消化道器质性病变”，只能忠实记录该结果并提示结合已完成内镜结论由医生判断。

【用药及营养补充信息】仅复述会员当前记录，并标注信息来源或待人工核对状态。不得自行建立药物、营养补充剂与检查异常之间的因果关系；不得建议新增、停用、更换或调整剂量、频次和用法。如原始报告明确要求复核，应原样概述并提示携带原始资料咨询正规医疗机构。

【会员基本信息】
姓名：${user.name}，性别：${user.gender}，年龄：${user.age || '未知'}岁
慢性病标签：${user.chronicDiseases?.join('、') || '无'}
健康诉求：${user.healthConcern || '未填写'}

【健康档案】
${archiveSummary}

【心理健康量表评估】
${psychSummary}

【生活方式与膳食调查】
${lifestyleSummary}

【近30天打卡记录（体重/血压/血糖/心率/睡眠/情绪等日常自测数据，体现短期真实趋势，可与体检报告互相印证或提示体检后的变化）】
${checkinSummary}

【当前用药】
${medicationSummary}

【当前营养素补充】
${supplementSummary}

【最近一次体检关键指标】（分析立足点）
${labSummary}

【历年体检指标趋势（近几年记录）】
${labTrendLines}

【历年专项筛查报告（按年份列出所有记录）】
${reportSummary}

【专科检查异常发现（含听力/视力/眼耳鼻喉/口腔/骨密度等所有专科，务必逐条纳入分析，不要遗漏）】
${examFindingsText}

【肿瘤标志物（历年，单独维度分析）】
${tumorMarkerText}

【基因检测报告】
${geneticText}

【肿瘤筛查覆盖度（系统按男女高发肿瘤规则判定，✓已覆盖/△部分/✗未筛查）】
${coverageText}

【本会员性别对应的10种常见肿瘤目录（仅作为逐项风险评估目录，不代表每项都需年度筛查）】
${cancerCatalogText}

【常见肿瘤近5年分组证据（程序逐年归拢；必须逐项核对，不得遗漏年份，不得跨检查类型直接比较）】
${cancerEvidenceText}

【心脑血管与限定慢病近5年分组证据（只允许依据这些主题建趋势卡）】
${focusedTrendEvidenceText}

【带编号证据目录（结论必须以此为事实边界）】
${evidenceCatalog}

${existingSections && scope === 'doctor' && existingSections.lifestyle_assessment ? `\n【营养师已评估的生活方式内容（供参考，本次不需要重新生成这部分，仅作为你判断5维度分析时的背景信息）】\n${JSON.stringify(existingSections.lifestyle_assessment)}\n` : ''}${existingSections && scope === 'nutrition' && DOCTOR_KEYS.some(k => existingSections[k]) ? `\n【健康顾问已生成的5维度分析（供参考，本次请结合这些医疗判断来评估生活方式，本次不需要重新生成这部分）】\n${JSON.stringify(Object.fromEntries(DOCTOR_KEYS.map(k => [k, existingSections[k]]).filter(([, v]) => v)))}\n` : ''}
${useIncremental ? `\n【年度增量更新模式——最高优先级】\n基线年度：${incrementalBase.year}；目标年度：${targetYear}。以上一年度已审核AI健康信息整理为历史基线，只用目标年度新增报告更新对应卡片。未出现本年度新证据的卡片沿用基线内容；出现新证据时更新最近检查、5年趋势、关键变化和下一步。输出仍须是完整sections，不得只输出差异。不得把基线中的历史事实改写成新发生事实。\n` : ''}
${reuseTumor ? '\n【肿瘤板块复用】本次肿瘤分析沿用已有结果，禁止输出tumor_risk；只生成其余健康顾问板块。\n' : ''}
请严格按以下JSON格式输出，仅输出JSON，不要添加任何其他内容${!wantDoctor || !wantLifestyle ? '（本次只需输出下方列出的板块，不要输出其他板块）' : ''}：
{
  "sections": {${wantLifestyle ? `
    "lifestyle_assessment": {
      "items": [
        {
          "dimension": "饮食",
          "finding": "结合膳食调查数据与体检指标描述饮食现状；若无数据，说明暂无膳食调查信息并给出通用评估",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        },
        {
          "dimension": "运动",
          "finding": "描述运动习惯现状；若无记录，说明暂无运动数据并结合体检指标（如BMI/血糖/血压）推断运动需求",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        },
        {
          "dimension": "睡眠",
          "finding": "描述睡眠质量现状；若无记录，说明暂无睡眠数据并结合档案信息评估",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        },
        {
          "dimension": "烟酒",
          "finding": "描述吸烟饮酒情况；若无记录，注明暂无相关信息",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        },
        {
          "dimension": "情绪",
          "finding": "结合PHQ-9/GAD-7量表评分描述情绪/心理状态（若有评估记录必须引用具体分数和分级）；若无量表记录，说明暂无心理健康评估并结合慢病状态与档案信息进行综合判断",
          "risk": "该维度相关的健康风险，若量表分数达中度以上需在此明确标注",
          "suggestion": "具体可执行的改善建议，若量表提示中重度以上应建议转介心理咨询师"
        }
      ],
      "summary": "生活方式综合评估（50-100字，需结合最近一次体检结果，必须覆盖饮食/运动/睡眠/烟酒/情绪5个维度）"
    }${wantDoctor ? ',' : ''}` : ''}${wantDoctor ? `
    "medical_priority": {
      "items": [
        {
          "name": "问题名称（如：血压控制不佳）",
          "current": "当前数值描述（如：152/98mmHg）",
          "meaning": "原报告或参考范围所反映的信息（30-60字，不作诊断或病因推断）",
          "action": "信息核对或携带原始资料咨询正规医疗机构",
          "department": "固定为空字符串",
          "urgency": "high或medium或low"
        }
      ]
    },
    ${reuseTumor ? '' : `"tumor_risk": {
      "completed": ["已完成的筛查项目（含年份），严格依据【肿瘤筛查覆盖度】中✓已覆盖的项，不要臆造"],
      "abnormal": ["异常发现（结合肿瘤标志物动态趋势+影像内镜所见；标志物单项轻度升高须注明特异性局限不得判癌；无则空数组）"],
      "missing": ["待补做的筛查项目，严格依据【肿瘤筛查覆盖度】中△部分/✗未筛查的待补项（如乳腺钼靶未做、HP需复查、肺癌LDCT未做等），逐条给出补做建议"],
      "summary": "肿瘤筛查总评（50-100字）：只总结最重要的异常复查、到期项和资料缺口，不逐项复述10种肿瘤",
      "overview": {
        "catalog": "男性或女性常见10种肿瘤",
        "coveredCount": 0,
        "attentionCount": 0,
        "unknownCount": 0,
        "headline": "一句话先说明当前最需要处理的事项；没有到期或异常时说明目前无紧急待办"
      },
      "cancers": [
        {
          "name": "必须严格按【本会员性别对应的10种常见肿瘤目录】顺序逐项输出，共10项",
          "status": "covered或due_soon或overdue或follow_up_due或not_routinely_recommended或unknown",
          "riskBasis": "仅写资料明确存在的适用条件；资料不足则写资料不足",
          "latest": "最近一次有效检查的日期、方式和结论摘要；没有则写暂无有效记录",
          "trendStatus": "no_data或baseline或stable或improving或worsening或fluctuating或not_comparable",
          "trend": "最长5年趋势结论，最多60字；只有一次检查不得写稳定",
          "keyChanges": ["最多3条关键年份变化，不机械罗列所有年份"],
          "nextAction": "仅写到期判断、资料核对或遵循原报告/医生复查要求，不自行开检查单",
          "evidenceIds": ["RPT-001"]
        }
      ]
    },`}
    "cardiovascular_risk": {
      "high": ["重点关注信息（仅引用已有资料，有则填，无则空数组）"],
      "medium": ["持续关注信息（仅引用已有资料，有则填，无则空数组）"],
      "summary": "心脑血管相关信息概述（50-100字，不作疾病概率判断）",
      "overview": {
        "headline": "一句话只总结最重要的变化或当前无紧急待办",
        "attentionCount": 0,
        "stableCount": 0
      },
      "topics": [
        {
          "name": "只能是：心电图、心脏超声、冠脉CTA、运动评估、心脏磁共振、颈动脉超声、头颅MRI、头颅MRA、同型半胱氨酸、脂蛋白磷脂酶A2之一；无资料不输出",
          "status": "attention或monitor或stable或unknown",
          "latest": "最近一次检查日期、项目及结果摘要",
          "trendStatus": "no_data或baseline或stable或improving或worsening或fluctuating或not_comparable",
          "trend": "最长5年同类检查趋势，最多60字；只有一次不得写稳定",
          "keyChanges": ["最多3条关键年份变化"],
          "nextAction": "依据原报告或已有管理要求给出下一步，不作诊断和开单",
          "evidenceIds": ["RPT-001"]
        }
      ]
    },
    "chronic_disease": {
      "overview": {
        "headline": "一句话只总结慢病及其他指标最重要的变化",
        "attentionCount": 0,
        "stableCount": 0
      },
      "items": [
        {
          "name": "只能是血压、血糖、血脂、尿酸、肾功能、骨质疏松之一；无资料不输出",
          "value": "当前值简述（兼容旧展示）",
          "status": "abnormal或mild_abnormal或normal",
          "note": "简要说明（30字内，兼容旧展示）",
          "latest": "最近一次检查日期、项目及结果摘要",
          "trendStatus": "no_data或baseline或stable或improving或worsening或fluctuating或not_comparable",
          "trend": "最长5年同名指标或同类检查趋势，最多60字；不同单位/方法不可硬比",
          "keyChanges": ["最多3条关键年份变化"],
          "nextAction": "依据原报告或既有管理要求给出下一步，不作诊断和用药调整",
          "evidenceIds": ["RPT-001"]
        }
      ]
    },
    "checkup_completeness": {
      "covered": ["已覆盖的主要筛查项目"],
      "missing": ["缺失的重要筛查项目"],
      "suggestion": "下年度体检补项建议（50字内）"
    }` : ''}
  }
}`;

  // maxTokens从2500提到4000：会员报告历年记录多时(如一次性上传数十份单次检验单)，
  // reportSummary本身prompt就很长，AI要输出6大板块完整JSON，2500token容易在输出中途被截断
  // 导致JSON不完整解析失败、静默降级成全空结构——2026-07-03 潘孝银"已生成但内容全空"即此原因。
  // 2026-07-07：nutrition(生活方式评估)原定1200仍偏低——5个维度(饮食/运动/睡眠/烟酒/情绪)每个都要
  // 输出finding+risk+suggestion三段文字，实测JSON在1700字符左右就被截断报错，1200token撑不住完整输出
  // 肿瘤维度新增男女常见10种肿瘤逐项卡片后，doctor/all 输出明显增长；预留足够空间，
  // 避免JSON尾部截断。生活方式单独生成仍保持原额度。
  const maxTokens = scope === 'all' ? 8192 : (scope === 'doctor' ? 8192 : 2000);
  // 健康信息整理包含最长5年资料和10种常见肿瘤卡片，属于长文本任务；仅此场景放宽
  // 单次AI请求上限，普通聊天等接口仍保持ai.js默认45秒。
  const text = await chat([{ role: 'user', content: prompt }], {
    maxTokens, temperature: 0.05, jsonMode: true, timeoutMs: wantDoctor ? 120000 : 45000,
  });

  let sections = null;
  let parseFailed = false;
  try {
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      sections = parsed.sections || parsed;
    } else {
      parseFailed = true;
    }
  } catch (parseErr) {
    parseFailed = true;
    console.error(`[ai-health-summary] JSON解析失败，userId=${user._id}，错误：${parseErr.message}，AI原始返回（前2000字）：`, text.slice(0, 2000));
  }

  if (!sections) {
    parseFailed = true;
    sections = {
      lifestyle_assessment: { items: [], summary: '' },
      medical_priority: { items: [] },
      tumor_risk: { completed: [], abnormal: [], missing: [], summary: '' },
      cardiovascular_risk: { high: [], medium: [], summary: '' },
      chronic_disease: { items: [] },
      checkup_completeness: { covered: [], missing: [], suggestion: '' },
    };
  }

  // 不再对整份长JSON发起第二次AI重写：该调用长期因输出截断或超时而回退首轮结果，
  // 还会使总请求超过网关等待时间。事实边界继续由首轮证据目录、确定性分类归并和人工审核保证。

  if (!parseFailed && reuseTumor) sections.tumor_risk = reusedTumorSection;

  // 模型偶尔仍会把血糖或血脂子指标拆成多张卡；展示前做确定性归并。
  if (!parseFailed && wantDoctor) normalizeTrendSections(sections, user, allHistoricalReports);

  // AI 可能无视提示词，把同一份子宫附件超声同时写成“卵巢癌已覆盖”和
  // “子宫内膜癌/经阴道超声缺失”。结构化规则证据优先于模型措辞，生成后强制纠正。
  if (!parseFailed && wantDoctor && !reuseTumor) reconcileGynecologicUltrasoundCoverage(sections, cancerCoverage);

  // 数据溯源：AI文本结论核实起来要反复跳转查原始档案，很麻烦。这里不是让AI自己编造溯源标识
  // （AI可能编造或对错号，指错地方比没有链接更误导人），而是后端用规则去 allReports 的
  // reportItems 里按名称模糊匹配——匹配到就补充 sourceReportId/sourceItemIndex 供前端渲染成
  // 可点击链接，匹配不到就是纯文本，不冒充精确定位。
  if (!parseFailed) {
    attachSourceLinks(sections, allHistoricalReports);
  }

  // 生活方式评估解析出的是空壳（items为空且summary为空）也视为失败，不能悄悄写入数据库
  // 让上层显示"已生成"却实际没内容——2026-07-07 赵菲盈反馈的"提示已生成但看不到"即此场景
  if (wantLifestyle) {
    const la = sections[LIFESTYLE_KEY];
    if (!la || ((la.items || []).length === 0 && !la.summary)) parseFailed = true;
  }

  // 按 scope 只保留本次需要重新生成的板块，另一方板块交给上层用旧值合并，避免互相覆盖
  if (scope === 'doctor') {
    const doctorOnly = {};
    DOCTOR_KEYS.forEach(k => { doctorOnly[k] = sections[k]; });
    return { sections: doctorOnly, failed: parseFailed };
  }
  if (scope === 'nutrition') {
    return { sections: { [LIFESTYLE_KEY]: sections[LIFESTYLE_KEY] }, failed: parseFailed };
  }
  return { sections, failed: parseFailed };
}

const CHRONIC_GROUP_PATTERNS = [
  ['血压', /血压|收缩压|舒张压/i],
  ['血糖', /血糖|葡萄糖|糖化血红蛋白|HbA1c/i],
  ['血脂', /血脂|总胆固醇|高密度脂蛋白|低密度脂蛋白|甘油三酯|载脂蛋白|脂蛋白\(a\)|\bTC\b|HDL|LDL|\bTG\b/i],
  ['尿酸', /尿酸|\bUA\b/i],
  ['肾功能', /肾功能|肌酐|尿素氮|尿素|估算肾小球滤过率|肾小球滤过率|eGFR|胱抑素C/i],
  ['骨质疏松', /骨密度|骨质疏松|骨量减少|T值|T-score|Z值|Z-score/i],
];

const CARDIO_TOPIC_ORDER = ['心电图', '心脏超声', '冠脉CTA', '运动评估', '心脏磁共振', '颈动脉超声', '头颅MRI', '头颅MRA', '同型半胱氨酸', '脂蛋白磷脂酶A2'];
const CARDIO_TOPIC_PATTERNS = CARDIO_TOPIC_ORDER.map(name => [name, new RegExp(name === '运动评估' ? '运动评估|运动负荷' : name, 'i')]);

const ENDOMETRIAL_TEXT = /子宫(?:内膜|体)癌|经阴道(?:妇科)?超声|子宫附件(?:\/经阴道)?超声/i;

function reconcileGynecologicUltrasoundCoverage(sections, coverageResults = []) {
  const coverage = coverageResults.find(item => item.key === 'endometrial');
  if (!coverage || coverage.status !== 'ok') return;

  const coveredLabel = '子宫体癌（子宫附件/经阴道超声）';
  const tumor = sections?.tumor_risk;
  if (tumor) {
    tumor.missing = (tumor.missing || []).filter(item => !ENDOMETRIAL_TEXT.test(String(item)));
    tumor.completed = [...(tumor.completed || []).filter(item => !ENDOMETRIAL_TEXT.test(String(item))), coveredLabel];
    const cancer = (tumor.cancers || []).find(item => /子宫(?:内膜|体)癌/.test(String(item.name || '')));
    if (cancer && ['unknown', 'overdue', 'due_soon'].includes(cancer.status)) {
      cancer.name = '子宫体癌';
      cancer.status = 'covered';
      cancer.latest = coverage.doneItems?.[0] || cancer.latest;
      cancer.trendStatus = cancer.trendStatus === 'no_data' ? 'baseline' : cancer.trendStatus;
      cancer.nextAction = '已完成子宫附件/经阴道超声基础影像检查；后续结合症状及原报告建议管理。';
    }
    if (tumor.overview && Array.isArray(tumor.cancers)) {
      tumor.overview.coveredCount = tumor.cancers.filter(item => item.status === 'covered').length;
      tumor.overview.unknownCount = tumor.cancers.filter(item => item.status === 'unknown').length;
      tumor.overview.attentionCount = tumor.cancers.filter(item => ['follow_up_due', 'overdue', 'due_soon'].includes(item.status)).length;
    }
  }

  const completeness = sections?.checkup_completeness;
  if (completeness) {
    completeness.missing = (completeness.missing || []).filter(item => !ENDOMETRIAL_TEXT.test(String(item)));
    completeness.covered = [...(completeness.covered || []).filter(item => !ENDOMETRIAL_TEXT.test(String(item))), coveredLabel];
    completeness.suggestion = String(completeness.suggestion || '')
      .replace(/(?:、|，|,)?(?:及)?经阴道(?:妇科)?超声/g, '')
      .replace(/补做及/g, '补做')
      .replace(/[、，,]+(?=[；。]|$)/g, '')
      .trim();
  }
}

function normalizeTrendSections(sections, user, reports = []) {
  const tumor = sections && sections.tumor_risk;
  if (tumor && Array.isArray(tumor.cancers)) {
    const order = COMMON_CANCER_CATALOG[user.gender === '女' ? 'F' : 'M'];
    const rank = new Map(order.map((name, index) => [name, index]));
    tumor.cancers = tumor.cancers
      .filter(item => rank.has(item.name))
      .sort((a, b) => rank.get(a.name) - rank.get(b.name));
  }
  const cardio = sections && sections.cardiovascular_risk;
  if (cardio && Array.isArray(cardio.topics)) {
    const normalized = new Map();
    cardio.topics.forEach(item => {
      const nameText = String(item.name || '');
      const matched = CARDIO_TOPIC_PATTERNS.find(([, pattern]) => pattern.test(nameText));
      if (matched && !normalized.has(matched[0])) normalized.set(matched[0], { ...item, name: matched[0] });
    });
    cardio.topics = CARDIO_TOPIC_ORDER.map(name => normalized.get(name)).filter(Boolean);
    backfillCardioTopicEvidence(cardio.topics, reports);
  }
  consolidateChronicDiseaseItems(sections);
}

function backfillCardioTopicEvidence(topics, reports) {
  const cutoffYear = new Date().getFullYear() - 4;
  topics.forEach(topic => {
    const rule = FOCUSED_TREND_RULES[topic.name];
    if (!rule) return;
    const hits = [];
    reports.forEach((report, reportIndex) => {
      const date = String(report.checkDate || report.date || '').slice(0, 10);
      const year = Number(report.reportYear || date.slice(0, 4));
      if (!Number.isFinite(year) || year < cutoffYear) return;
      const matched = (report.reportItems || []).filter(item => rule.test([
        item.name, item.bodyPart, item.value, item.findings, item.diagnosis, item.conclusion,
      ].filter(Boolean).join(' ')));
      if (!matched.length) return;
      const item = matched[0];
      const result = [item.diagnosis, item.conclusion, item.findings, item.value].filter(Boolean).join('；').slice(0, 80);
      hits.push({
        date, year, name: item.name || topic.name, result,
        evidenceId: `RPT-${String(reportIndex + 1).padStart(3, '0')}`,
      });
    });
    if (!hits.length) return;
    hits.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const latest = hits[hits.length - 1];
    const years = [...new Set(hits.map(hit => hit.year))];
    topic.latest = `${latest.date || latest.year} ${latest.name}${latest.result ? `：${latest.result}` : ''}`;
    const yearPrefix = `近5年检查记录：${years.join('、')}年`;
    topic.trend = String(topic.trend || '').includes(years[0])
      ? topic.trend
      : `${yearPrefix}${topic.trend ? `；${topic.trend}` : ''}`.slice(0, 120);
    const deterministicChanges = hits.map(hit => `${hit.year}年${hit.name}${hit.result ? `：${hit.result}` : ''}`.slice(0, 100));
    topic.keyChanges = [...new Set([...deterministicChanges, ...(topic.keyChanges || [])])].slice(-3);
    topic.evidenceIds = [...new Set([...(topic.evidenceIds || []), ...hits.map(hit => hit.evidenceId)])];
    if (hits.length === 1) topic.trendStatus = 'baseline';
  });
}

function consolidateChronicDiseaseItems(sections) {
  const chronic = sections && sections.chronic_disease;
  if (!chronic || !Array.isArray(chronic.items)) return;
  const grouped = new Map();
  chronic.items.forEach(item => {
    const nameText = String(item.name || '');
    const matched = CHRONIC_GROUP_PATTERNS.find(([, pattern]) => pattern.test(nameText));
    if (!matched) return;
    const groupName = matched[0];
    if (!grouped.has(groupName)) {
      grouped.set(groupName, { ...item, name: groupName });
      return;
    }
    const target = grouped.get(groupName);
    ['value', 'note', 'latest', 'trend', 'nextAction'].forEach(key => {
      const incoming = String(item[key] || '').trim();
      if (incoming && !String(target[key] || '').includes(incoming)) {
        target[key] = [target[key], incoming].filter(Boolean).join('；');
      }
    });
    target.keyChanges = [...new Set([...(target.keyChanges || []), ...(item.keyChanges || [])])].slice(0, 3);
    target.evidenceIds = [...new Set([...(target.evidenceIds || []), ...(item.evidenceIds || [])])];
    if (item.status === 'abnormal' || (item.status === 'mild_abnormal' && target.status === 'normal')) {
      target.status = item.status;
    }
  });
  chronic.items = CHRONIC_GROUP_PATTERNS.map(([name]) => grouped.get(name)).filter(Boolean);
}

// 把 allReports 展平成 {name, reportId, itemIndex} 的扁平索引，供按名称模糊匹配
function buildReportItemIndex(allReports) {
  const index = [];
  allReports.forEach(r => {
    (r.reportItems || []).forEach((item, itemIndex) => {
      if (item && item.name) index.push({ name: String(item.name), reportId: String(r._id), itemIndex });
    });
  });
  return index;
}

// 简单包含匹配（互相包含即视为同一项，如"总胆固醇"能匹配"总胆固醇(TC)"）。只做确定性字符串
// 匹配，不引入模糊相似度算法——宁可匹配不上显示纯文本，也不要匹配错导致点进去看的是无关数据。
function findSourceMatch(name, index) {
  if (!name) return null;
  const n = String(name).trim();
  if (!n) return null;
  const hit = index.find(it => it.name.includes(n) || n.includes(it.name));
  return hit ? { sourceReportId: hit.reportId, sourceItemIndex: hit.itemIndex } : null;
}

function buildStructuredSourceEvidence(name, reports, rule) {
  if (!rule) return [];
  const cutoffYear = new Date().getFullYear() - 4;
  return reports.flatMap(report => {
    const date = String(report.checkDate || report.date || '').slice(0, 10);
    const year = Number(report.reportYear || date.slice(0, 4));
    if (!Number.isFinite(year) || year < cutoffYear) return [];
    const matchedItems = (report.reportItems || []).map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => rule.test([
      item.name, item.sourceSection, item.orderName, item.bodyPart, item.value,
      item.findings, item.diagnosis, item.conclusion,
    ].filter(Boolean).join(' ')));
    const reportText = [report.title, report.screeningL2, report.examDescription, report.examConclusion, report.note].filter(Boolean).join(' ');
    if (!matchedItems.length && !rule.test(reportText)) return [];
    return [{
      reportId: String(report._id), date, year,
      items: matchedItems.map(({ item, itemIndex }) => ({
        itemIndex, name: item.name || name, sourcePage: item.sourcePage || null,
      })),
    }];
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// 遍历 medical_priority.items 和 chronic_disease.items（这两个板块的每条结论都带 name 字段，
// 最适合按名称核对到具体检查项），就地补充溯源字段
function attachSourceLinks(sections, allReports) {
  const index = buildReportItemIndex(allReports);
  if (!index.length) return;
  const idsFor = (categories) => [...new Set(allReports
    .filter(report => categories.includes(report.screeningCategory)
      || (report.reportItems || []).some(item => categories.includes(item.screeningCategory)))
    .map(report => String(report._id)))];
  if (sections.tumor_risk) sections.tumor_risk.sourceReportIds = idsFor(['tumor']);
  if (sections.cardiovascular_risk) sections.cardiovascular_risk.sourceReportIds = idsFor(['cardiovascular', 'brain_vessel']);
  if (sections.chronic_disease) sections.chronic_disease.sourceReportIds = idsFor(['chronic', 'functional', 'other_routine', 'health_promote', 'other']);
  const allIds = [...new Set(allReports.map(report => String(report._id)))];
  if (sections.checkup_completeness) sections.checkup_completeness.sourceReportIds = allIds;
  if (sections.medical_priority) sections.medical_priority.sourceReportIds = allIds;

  if (Array.isArray(sections.tumor_risk?.cancers)) {
    sections.tumor_risk.cancers.forEach(item => {
      item.sourceEvidence = buildStructuredSourceEvidence(item.name, allReports, CANCER_EVIDENCE_RULES[item.name]);
    });
  }
  if (Array.isArray(sections.cardiovascular_risk?.topics)) {
    sections.cardiovascular_risk.topics.forEach(item => {
      item.sourceEvidence = buildStructuredSourceEvidence(item.name, allReports, FOCUSED_TREND_RULES[item.name]);
    });
  }
  if (Array.isArray(sections.chronic_disease?.items)) {
    sections.chronic_disease.items.forEach(item => {
      item.sourceEvidence = buildStructuredSourceEvidence(item.name, allReports, FOCUSED_TREND_RULES[item.name]);
    });
  }

  const mp = sections.medical_priority;
  if (mp && Array.isArray(mp.items)) {
    mp.items.forEach(item => {
      const match = findSourceMatch(item.name, index);
      if (match) Object.assign(item, match);
    });
  }

  const cd = sections.chronic_disease;
  if (cd && Array.isArray(cd.items)) {
    cd.items.forEach(item => {
      const match = findSourceMatch(item.name, index);
      if (match) Object.assign(item, match);
    });
  }
}

module.exports = { generateHealthSummarySections, reconcileGynecologicUltrasoundCoverage, DOCTOR_KEYS, LIFESTYLE_KEY };
