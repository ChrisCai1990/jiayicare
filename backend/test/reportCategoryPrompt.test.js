const test = require('node:test');
const assert = require('node:assert/strict');
const { REPORT_PARSE_PROMPT, PRESCRIPTION_PARSE_PROMPT } = require('../src/utils/reportExtractionPolicy');
const { reportParsePromptForCategory } = require('../src/utils/reportCategoryPrompt');

test('lab and examination documents retain separate extraction rules', () => {
  assert.match(reportParsePromptForCategory('lab_report'), /同一印刷行/);
  assert.match(reportParsePromptForCategory('exam_report'), /下一栏目之前/);
  assert.equal(reportParsePromptForCategory('physical_exam'), REPORT_PARSE_PROMPT);
  assert.notEqual(PRESCRIPTION_PARSE_PROMPT, reportParsePromptForCategory('lab_report'));
});
