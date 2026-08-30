const isReportInterpretation = name => /(?:体检)?报告.*(?:解读|解析)|(?:解读|解析).*(?:体检)?报告/.test(String(name || ''));
const isPlanDesign = name => /体检.*方案.*(?:制定|定制)|(?:制定|定制).*体检.*方案/.test(String(name || ''));

module.exports = { isReportInterpretation, isPlanDesign };
