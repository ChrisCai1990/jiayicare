const test = require('node:test');
const assert = require('node:assert/strict');
const staffRouter = require('../src/routes/staff');

const { isAdvisoryEcho } = staffRouter.reportFilterInternals;

test('oral examination findings survive treatment suggestion wording', () => {
  assert.equal(isAdvisoryEcho({
    name: '(45)可疑邻面龋',
    sourceSection: '口腔检查结果',
    findings: '第45号牙存在可疑邻面龋',
    diagnosis: '建议拍牙片，辅助确诊，充填治疗',
  }), false);
});

test('generic recommendation prose remains removable', () => {
  assert.equal(isAdvisoryEcho({
    name: '慢性浅表性胃炎',
    findings: '多与生活习惯有关，建议定期复查治疗',
  }), true);
});
