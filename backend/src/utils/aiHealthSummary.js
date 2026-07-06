const { chat } = require('./ai');

// 生成AI健康汇总分析的 sections 内容（不含审核字段），供医护端接口和用户端自助接口共用
async function generateHealthSummarySections(user) {
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

  const lv = user.labValues || {};
  const bc = user.bodyComposition || {};
  const labLines = [
    lv.fpg   && `空腹血糖 ${lv.fpg} mmol/L`,
    lv.hba1c && `糖化血红蛋白 ${lv.hba1c}%`,
    lv.sbp   && `血压 ${lv.sbp}/${lv.dbp} mmHg`,
    lv.tc    && `总胆固醇 ${lv.tc} mmol/L`,
    lv.ldl   && `LDL-C ${lv.ldl} mmol/L`,
    lv.hdl   && `HDL-C ${lv.hdl} mmol/L`,
    lv.tg    && `甘油三酯 ${lv.tg} mmol/L`,
    lv.ua    && `尿酸 ${lv.ua} μmol/L`,
    lv.alt   && `ALT ${lv.alt} U/L`,
    lv.ast   && `AST ${lv.ast} U/L`,
    lv.ggt   && `GGT ${lv.ggt} U/L`,
    lv.hcy   && `同型半胱氨酸 ${lv.hcy} μmol/L`,
    lv.lpla2 && `Lp-PLA2 ${lv.lpla2} U/L`,
    lv.waist && `腰围 ${lv.waist} cm`,
    lv.liverUs  && `肝脏超声：${lv.liverUs}`,
    lv.carotiUs && `颈动脉超声：${lv.carotiUs}`,
    bc.skelMuscle  && `骨骼肌量 ${bc.skelMuscle} kg`,
    bc.visceralFat && `内脏脂肪 ${bc.visceralFat}`,
    bc.bodyFatRate && `体脂率 ${bc.bodyFatRate}%`,
  ].filter(Boolean);
  const labSummary = labLines.join('、') || '暂无体检数据';

  const allReports = await MedicalReport.find({ user: user._id })
    .sort({ checkDate: -1, date: -1, createdAt: -1 })
    .select('title screeningL2 examConclusion checkDate date reportYear screeningCategory reportItems note');

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

  const labHistory = (user.labHistory || [])
    .filter(h => h.recordedAt)
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .slice(0, 5);
  const labTrendLines = labHistory.length > 1
    ? labHistory.map(h => {
        const yr = new Date(h.recordedAt).getFullYear();
        const vals = [
          h.sbp   && `血压${h.sbp}/${h.dbp}`,
          h.fpg   && `空腹血糖${h.fpg}`,
          h.hba1c && `糖化${h.hba1c}%`,
          h.tc    && `总胆固醇${h.tc}`,
          h.ldl   && `LDL${h.ldl}`,
          h.ua    && `尿酸${h.ua}`,
          h.alt   && `ALT${h.alt}`,
        ].filter(Boolean).join('、');
        return `  ${yr}年（${String(h.recordedAt).slice(0,10)}）：${vals || '无数据'}`;
      }).join('\n')
    : '  仅有当次数据，无法比较趋势';

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
      const factorStr = key === 'scl90' && r.factorScores
        ? `（因子分：${Object.entries(r.factorScores).map(([f, s]) => `${f}${s}`).join('、')}）`
        : '';
      return `${label}（${String(r.filledAt).slice(0,10)}）：总分${r.totalScore}分，${r.severity}${factorStr}`;
    })
    .filter(Boolean).join('\n') || '暂无心理健康量表评估记录';

  const prompt = `你是一位经验丰富的家庭医师，请根据以下患者完整健康档案生成结构化综合健康分析报告。问题分析必须身心结合，不能只谈躯体指标而忽略心理健康量表数据，反之亦然——如果心理评估分数偏高但躯体指标正常，仍需在情绪维度和风险清单中明确指出；如果慢病/躯体症状可能与情绪压力互为因果，也需在分析中点明关联。

分析原则：以【最近一次体检关键指标】为立足点判断当前健康状态，结合【历年体检指标趋势】和【历年专项筛查报告】判断变化方向与风险演进，并结合【健康档案】【生活方式与膳食调查】【当前用药与营养素补充】综合评估。专项筛查报告中的检查所见（影像/内镜）请重点比对历年变化趋势，如结节大小/形态变化、颈动脉斑块变化、甲状腺TI-RADS分级变化等。

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

请严格按以下JSON格式输出，仅输出JSON，不要添加任何其他内容：
{
  "sections": {
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
    },
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
      "completed": ["已完成的筛查项目（含年份）"],
      "abnormal": ["异常发现（有则填，无则空数组）"],
      "missing": ["未覆盖的重要筛查项目"],
      "summary": "肿瘤筛查总评（50-100字）"
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
    }
  }
}`;

  // maxTokens从2500提到4000：患者报告历年记录多时(如一次性上传数十份单次检验单)，
  // reportSummary本身prompt就很长，AI要输出6大板块完整JSON，2500token容易在输出中途被截断
  // 导致JSON不完整解析失败、静默降级成全空结构——2026-07-03 潘孝银"已生成但内容全空"即此原因。
  const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 4000 });

  let sections = null;
  try {
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      sections = parsed.sections || parsed;
    }
  } catch (parseErr) {
    console.error(`[ai-health-summary] JSON解析失败，userId=${user._id}，错误：${parseErr.message}，AI原始返回（前2000字）：`, text.slice(0, 2000));
  }

  if (!sections) sections = {
    lifestyle_assessment: { items: [], summary: '' },
    medical_priority: { items: [] },
    tumor_risk: { completed: [], abnormal: [], missing: [], summary: '' },
    cardiovascular_risk: { high: [], medium: [], summary: '' },
    chronic_disease: { items: [] },
    checkup_completeness: { covered: [], missing: [], suggestion: '' },
  };

  return sections;
}

module.exports = { generateHealthSummarySections };
