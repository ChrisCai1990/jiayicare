const test = require('node:test');
const assert = require('node:assert/strict');
const staffRouter = require('../src/routes/staff');

const { isAdvisoryEcho, isUnclassifiedNameEcho, shouldForceSkipParsedReportPage } = staffRouter.reportFilterInternals;

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

test('unclassified oral findings are not discarded as repeated diagnosis labels', () => {
  assert.equal(isUnclassifiedNameEcho({
    name: '牙结石不同程度附着于牙颈部',
    sourceSection: '口腔检查结果',
    findings: '牙结石不同程度附着于牙颈部',
    diagnosis: '建议龈上洁治',
    matchStatus: 'unclassified',
  }), false);
});

test('summary and advice pages cannot bypass page skipping by returning structured items', () => {
  assert.equal(shouldForceSkipParsedReportPage({
    pageType: 'summary',
    skipPage: true,
    items: [{ name: '细胞角蛋白19片段', value: '5.9' }],
  }), true);
  assert.equal(shouldForceSkipParsedReportPage({
    pageType: 'advice',
    items: [{ name: '肝囊肿', findings: '建议每年复查B超' }],
  }), true);
});

test('detail pages with actual results remain extractable', () => {
  assert.equal(shouldForceSkipParsedReportPage({
    pageType: 'detail',
    skipPage: false,
    items: [{ name: '细胞角蛋白19片段', value: '5.9' }],
  }), false);
});
