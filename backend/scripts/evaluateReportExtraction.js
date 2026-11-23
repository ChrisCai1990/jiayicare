// Run only with an authorized local truth file. Output contains counts only.
const fs = require('node:fs');
const { aggregateEvaluations } = require('../src/utils/reportExtractionEvaluation');

const filename = process.argv[2];
if (!filename) {
  process.stderr.write('用法：node backend/scripts/evaluateReportExtraction.js <授权样本.json>\n');
  process.exit(2);
}
const reports = JSON.parse(fs.readFileSync(filename, 'utf8'));
if (!Array.isArray(reports)) throw new Error('样本文件必须是报告数组');
process.stdout.write(`${JSON.stringify(aggregateEvaluations(reports), null, 2)}\n`);
