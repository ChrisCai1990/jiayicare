const { chat } = require('./ai');

const FACT_GUARD_SYSTEM_PROMPT = `你是医疗事实审计器，不是自由写作助手。你的唯一任务是核对候选分析与证据目录，并返回修正后的同结构JSON。
最高优先级规则：
1. 只能保留证据目录明确支持的患者事实、诊断、病史、检查、用药、手术史和家族史；找不到证据的内容必须删除或改成“资料未提供/不足以判断”。
2. 禁止相近概念推断：冠心病、冠脉支架、心肌梗死均不等于脑梗死或脑卒中；颈动脉斑块不等于脑卒中；风险因素不等于确诊疾病；检查正常不等于排除疾病。
3. 同一事实存在冲突时，不得自行选边，必须写“资料冲突，待人工确认”。
4. 必须逐项检查证据目录中的报告，补回候选分析遗漏的、与对应分析维度直接相关的重要已完成检查和明确异常；不得凭医学常识新增患者事实。
5. 规则引擎信号属于确定性事实，不得遗漏、改写成其他疾病或降低其重要性。
6. 保持输入JSON的字段结构，不增加解释文字，不输出Markdown，只返回完整JSON。`;

function buildEvidenceCatalog(user, reports = [], extraFacts = []) {
  const lines = [
    `[PAT-01] 性别=${user.gender || '未提供'}；年龄=${user.age || '未提供'}；身高=${user.height || '未提供'}cm；体重=${user.weight || '未提供'}kg`,
    `[PAT-02] 慢性病标签=${(user.chronicDiseases || []).join('、') || '未提供'}`,
    `[PAT-03] 既往史=${user.healthProfile?.pastHistory || '未提供'}`,
    `[PAT-04] 家族史=${user.healthProfile?.familyHistoryNote || '未提供'}`,
  ];
  reports.forEach((report, reportIndex) => {
    const evidenceId = `RPT-${String(reportIndex + 1).padStart(3, '0')}`;
    const date = String(report.checkDate || report.date || report.createdAt || '').slice(0, 10) || '日期未提供';
    const title = report.screeningL2 || report.title || '未命名报告';
    const details = [];
    if (report.examConclusion) details.push(`结论=${String(report.examConclusion).slice(0, 300)}`);
    if (report.note) details.push(`备注=${String(report.note).slice(0, 200)}`);
    (report.reportItems || []).forEach((item, itemIndex) => {
      const values = [item.value, item.unit, item.findings, item.diagnosis].filter(Boolean).join('；');
      details.push(`${evidenceId}-I${itemIndex + 1} ${item.name || '未命名项目'}=${values || '未记录结果'}；状态=${item.status || '未标注'}`);
    });
    lines.push(`[${evidenceId}] ${title}；日期=${date}${details.length ? `；${details.join(' | ')}` : ''}`);
  });
  extraFacts.filter(Boolean).forEach((fact, index) => lines.push(`[SYS-${String(index + 1).padStart(2, '0')}] ${fact}`));
  return lines.join('\n');
}

async function auditMedicalJson(candidate, evidenceCatalog, { maxTokens = 3200 } = {}) {
  try {
    const prompt = `【证据目录】\n${evidenceCatalog}\n\n【待审计JSON】\n${JSON.stringify(candidate)}\n\n请执行事实核对、遗漏检查和概念纠错，返回修正后的同结构JSON。`;
    const text = await chat([{ role: 'user', content: prompt }], {
      systemPrompt: FACT_GUARD_SYSTEM_PROMPT,
      maxTokens,
      temperature: 0,
      jsonMode: true,
    });
    const match = text.trim().match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : candidate;
  } catch (error) {
    console.error('[ai-fact-guard] audit failed, keeping first-pass result:', error.message);
    return candidate;
  }
}

module.exports = { FACT_GUARD_SYSTEM_PROMPT, buildEvidenceCatalog, auditMedicalJson };
