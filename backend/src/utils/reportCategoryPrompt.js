const { REPORT_PARSE_PROMPT } = require('./reportExtractionPolicy');

function reportParsePromptForCategory(category) {
  if (category === 'physical_exam') return `${REPORT_PARSE_PROMPT}\n【综合体检】同页按印刷栏目顺序提取，一般项目保留独立测量行。眼科、内外科（全科）、耳鼻喉、口腔牙科、妇科的体格检查每科每页一条，完整按顺序抄录每项名称及结果，包括左右侧、正常所见及印刷建议。独立的化验、超声及其他专项仍按各自原件栏目提取。检验先读完当前表左栏，再读右栏，之后才进入下一张表；结果、单位、参考值均不得借用相邻单元格。心电图仅有诊断时完整抄在结论栏。`;
  if (category === 'lab_report') return `${REPORT_PARSE_PROMPT}\n【检验单专项】先找印刷检验单标题和表头，再按每一行读取。项目名、结果、单位、参考范围只允许来自同一印刷行；跨行或表格列对应不清时保留可确认字段并写具体reviewIssues。不要把相邻行数值、汇总文字或检查诊断当作检验结果。`;
  if (category === 'exam_report') return `${REPORT_PARSE_PROMPT}\n【检查报告专项】先按印刷栏目划分每项检查，再分别读该栏目内的检查所见与诊断/结论。每段文字只能归属其标题之下、下一栏目之前的检查；同页其他器官、其他检查的文字不得拼入本项。栏目边界或归属不清时留空并写具体reviewIssues。`;
  return REPORT_PARSE_PROMPT;
}

module.exports = { reportParsePromptForCategory };
