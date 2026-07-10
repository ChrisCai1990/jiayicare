const { chat } = require('./ai');
const { deriveLabFromReports, buildLatestLabText, buildTrendText, extractTumorMarkers, buildTumorMarkerText, extractGeneticFindings, extractExamFindings } = require('./labFromScreening');
const { assessCancerCoverage, buildCoverageText } = require('./cancerScreeningCoverage');

const DOCTOR_KEYS = ['medical_priority', 'tumor_risk', 'cardiovascular_risk', 'chronic_disease', 'checkup_completeness'];
const LIFESTYLE_KEY = 'lifestyle_assessment';

// 生成AI健康汇总分析的 sections 内容（不含审核字段），供医护端接口和用户端自助接口共用
// scope: 'all'（默认，全量生成）| 'doctor'（仅5维度，生活方式评估留空对象供上层合并旧值）| 'nutrition'（仅生活方式评估）
// existingSections: 已有的 sections（用于生成时给AI提供另一方内容作为上下文，实现两部分内容互相关联而非孤立）
async function generateHealthSummarySections(user, { scope = 'all', existingSections = null } = {}) {
  const MedicalReport = require('../models/MedicalReport');
  const Medication = require('../models/Medication');
  const Supplement = require('../models/Supplement');

  const [activeMeds, activeSupplements] = await Promise.all([
    Medication.find({ user: user._id, stopped: false }).select('name dosage frequency purpose startDate').lean(),
    Supplement.find({ user: user._id, stopped: false }).select('name dosage frequency purpose startDate').lean(),
  ]);
  const medicationSummary = activeMeds.length
    ? activeMeds.map(m => `${m.name} ${m.dosage}，${m.frequency}${m.purpose ? `（${m.purpose}）` : ''}${m.startDate ? `，自${m.startDate}起` : ''}`).join('；')
    : '暂无长期用药记录';
  const supplementSummary = activeSupplements.length
    ? activeSupplements.map(s => `${s.name} ${s.dosage}，${s.frequency}${s.purpose ? `（${s.purpose}）` : ''}${s.startDate ? `，自${s.startDate}起` : ''}`).join('；')
    : '暂无长期营养素补充记录';

  const allReports = await MedicalReport.find({ user: user._id })
    .sort({ checkDate: -1, date: -1, createdAt: -1 })
    .select('title screeningL2 examConclusion checkDate date reportYear screeningCategory reportItems note');

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
  Object.keys(reportsByYear).sort((a, b) => b - a).forEach(year => {
    reportSummaryLines.push(`▶ ${year}年：`);
    reportsByYear[year].forEach(r => {
      const conclusion = r.examConclusion ? r.examConclusion.slice(0, 150) : (r.note ? r.note.slice(0, 100) : '未记录结论');
      const abnormal = (r.reportItems || []).filter(i => i.status === 'abnormal').map(i => i.name).join('、');
      const dateStr = (r.checkDate || r.date || '').slice(0, 10);
      reportSummaryLines.push(`  - ${r.screeningL2 || r.title}（${dateStr}）：${conclusion}${abnormal ? '；异常项：' + abnormal : ''}`);
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
  const coverageText = buildCoverageText(assessCancerCoverage(user, allReports));

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
        // ——金娟名下患者精神病性因子1.2实为正常，此前被AI说成"升高"且错塞进心脑血管维度
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
    ? '你是一位经验丰富的营养师，请根据以下患者完整健康档案，仅针对「生活方式评估」维度生成结构化分析。'
    : scope === 'doctor'
      ? '你是一位经验丰富的家庭医师，请根据以下患者完整健康档案，仅针对医疗5个维度（优先医疗问题/肿瘤风险/心脑血管风险/慢病管理/体检完整性）生成结构化分析。'
      : '你是一位经验丰富的家庭医师，请根据以下患者完整健康档案生成结构化综合健康分析报告。';

  const prompt = `${roleIntro}问题分析必须身心结合，不能只谈躯体指标而忽略心理健康量表数据，反之亦然——如果心理评估分数偏高但躯体指标正常，仍需在情绪维度和风险清单中明确指出；如果慢病/躯体症状可能与情绪压力互为因果，也需在分析中点明关联。

【心理量表铁律——必须严格遵守】①SCL90各因子分必须严格按系统标注的正常/异常判定来解读：因子分＜2一律属正常范围，即使某因子（如精神病性1.2）在数值上略高于其他因子，只要＜2就是正常，绝不能描述为"升高/偏高/异常"。②心理量表（SCL90/SAS/SDS/嗜睡）的因子和结论只能写进"情绪/心理"相关分析，严禁把精神病性、偏执等心理因子塞进 cardiovascular_risk（心脑血管）、tumor_risk（肿瘤）等躯体维度——这些心理因子与躯体疾病风险无直接因果关系。③只有当系统明确标注某因子为异常时，才可在情绪维度提示。

分析原则：以【最近一次体检关键指标】为立足点判断当前健康状态，结合【历年体检指标趋势】和【历年专项筛查报告】判断变化方向与风险演进，并结合【健康档案】【生活方式与膳食调查】【当前用药与营养素补充】综合评估。你手上的是该患者全部专项筛查数据（体检指标/肿瘤标志物/影像内镜所见/基因/心理量表/听力视力等专科检查），请充分利用，不要只盯着少数几个指标。【专科检查异常发现】里列出的每一条（如听力高频下降、视力/屈光异常、口腔、骨密度等）都必须在分析中被提及并给出建议，这类非主流指标最容易被遗漏，务必逐条覆盖，纳入 medical_priority 或 chronic_disease 相应维度。专项筛查报告中的检查所见（影像/内镜）请重点比对历年变化趋势，如结节大小/形态变化、颈动脉斑块变化、甲状腺TI-RADS分级变化等。每个分析维度都应体现「几年数据的趋势变化 → 原因分析 → 未来建议」三段式，而非仅描述当前值。

【肿瘤标志物解读铁律——必须严格遵守，避免制造恐慌】除 PSA（前列腺癌相对特异）外，AFP/CEA/CA19-9/CA125/CA15-3/CA724/HE4/NSE 等常见肿瘤标志物特异性都不高：单项轻度升高绝不能直接判为"疑似癌症"或建议患者恐慌就医，必须结合影像/内镜结果、动态趋势（是否持续进行性升高）、既往史家族史综合判断。标志物正常也不代表无肿瘤风险。请在 tumor_risk 维度中明确说明标志物的这一局限性。

【重要】发现检查异常时，请先排查是否与当前用药或营养素补充相关，不要只从疾病角度解读：
- 长期服用蒽醌类泻药（番泻叶、大黄、芦荟等成分）是结肠黑变病的明确诱因，肠镜发现黑变时应结合用药记录判断，若确实在用此类泻药应在medical_priority中建议评估更换通便方式而非仅当作独立疾病处理
- 部分保肝药/降脂药/抗生素本身可引起转氨酶(ALT/AST)一过性升高，某些营养素超量补充（如高剂量维生素A/铁剂）也可能影响肝肾指标
- 判断时说明"异常是否可能与现有用药/营养素相关"，若相关应在建议里提及复核该药物/营养素的必要性，而不是孤立建议"就医检查肝功能"

【患者基本信息】
姓名：${user.name}，性别：${user.gender}，年龄：${user.age || '未知'}岁
慢性病标签：${user.chronicDiseases?.join('、') || '无'}
健康诉求：${user.healthConcern || '未填写'}

【健康档案】
${archiveSummary}

【心理健康量表评估】
${psychSummary}

【生活方式与膳食调查】
${lifestyleSummary}

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

${existingSections && scope === 'doctor' && existingSections.lifestyle_assessment ? `\n【营养师已评估的生活方式内容（供参考，本次不需要重新生成这部分，仅作为你判断5维度分析时的背景信息）】\n${JSON.stringify(existingSections.lifestyle_assessment)}\n` : ''}${existingSections && scope === 'nutrition' && DOCTOR_KEYS.some(k => existingSections[k]) ? `\n【家庭医师已生成的5维度分析（供参考，本次请结合这些医疗判断来评估生活方式，本次不需要重新生成这部分）】\n${JSON.stringify(Object.fromEntries(DOCTOR_KEYS.map(k => [k, existingSections[k]]).filter(([, v]) => v)))}\n` : ''}
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
          "meaning": "临床意义（30-60字）",
          "action": "建议行动（具体可执行）",
          "department": "建议就诊科室",
          "urgency": "high或medium或low"
        }
      ]
    },
    "tumor_risk": {
      "completed": ["已完成的筛查项目（含年份），严格依据【肿瘤筛查覆盖度】中✓已覆盖的项，不要臆造"],
      "abnormal": ["异常发现（结合肿瘤标志物动态趋势+影像内镜所见；标志物单项轻度升高须注明特异性局限不得判癌；无则空数组）"],
      "missing": ["待补做的筛查项目，严格依据【肿瘤筛查覆盖度】中△部分/✗未筛查的待补项（如乳腺钼靶未做、HP需复查、肺癌LDCT未做等），逐条给出补做建议"],
      "summary": "肿瘤筛查总评（50-100字）：按男女高发肿瘤说明覆盖情况，点明哪些该补做，并强调标志物特异性局限避免制造恐慌"
    },
    "cardiovascular_risk": {
      "high": ["高风险因素（有则填，无则空数组）"],
      "medium": ["中风险因素（有则填，无则空数组）"],
      "summary": "心脑血管综合评估（50-100字）"
    },
    "chronic_disease": {
      "items": [
        {
          "name": "系统或指标名称",
          "value": "当前值描述",
          "status": "abnormal或mild_abnormal或normal",
          "note": "简要说明（30字内）"
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

  // maxTokens从2500提到4000：患者报告历年记录多时(如一次性上传数十份单次检验单)，
  // reportSummary本身prompt就很长，AI要输出6大板块完整JSON，2500token容易在输出中途被截断
  // 导致JSON不完整解析失败、静默降级成全空结构——2026-07-03 潘孝银"已生成但内容全空"即此原因。
  // 2026-07-07：nutrition(生活方式评估)原定1200仍偏低——5个维度(饮食/运动/睡眠/烟酒/情绪)每个都要
  // 输出finding+risk+suggestion三段文字，实测JSON在1700字符左右就被截断报错，1200token撑不住完整输出
  const maxTokens = scope === 'all' ? 4000 : (scope === 'doctor' ? 3200 : 2000);
  const text = await chat([{ role: 'user', content: prompt }], { maxTokens });

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

module.exports = { generateHealthSummarySections, DOCTOR_KEYS, LIFESTYLE_KEY };
