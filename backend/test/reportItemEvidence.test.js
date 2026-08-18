const test = require('node:test');
const assert = require('node:assert/strict');
const {
  itemTouchesPage,
  mergeAdjacentReportItemEvidence,
  normalizeReportItemEvidence,
  reportItemSourcePages,
} = require('../src/utils/reportItemEvidence');
const MedicalReport = require('../src/models/MedicalReport');

test('legacy sourcePage is normalized into a page evidence collection', () => {
  const [item] = normalizeReportItemEvidence([{
    name: '胸部CT', itemType: 'imaging', sourcePage: 8,
    evidenceText: '肺部未见明显异常', textLayerEvidence: 'verified',
  }]);
  assert.equal(item.sourcePage, 8);
  assert.deepEqual(item.sourcePages, [8]);
  assert.deepEqual(item.sourceEvidence, [{ page: 8, text: '肺部未见明显异常', method: 'text_layer' }]);
});

test('exact adjacent imaging continuations merge without losing page evidence', () => {
  const result = mergeAdjacentReportItemEvidence([
    { name: '胸部CT', itemType: 'imaging', sourceSection: 'CT室', sourcePage: 8, findings: '双肺纹理增多', status: 'attention' },
    { name: '胸部CT', itemType: 'imaging', sourceSection: 'CT室', sourcePage: 9, diagnosis: '建议结合临床复查', status: 'unknown' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourcePage, 8);
  assert.deepEqual(result[0].sourcePages, [8, 9]);
  assert.equal(result[0].findings, '双肺纹理增多');
  assert.equal(result[0].diagnosis, '建议结合临床复查');
  assert.equal(itemTouchesPage(result[0], 9), true);
});

test('lab rows and non-adjacent records are never auto-merged', () => {
  const rows = mergeAdjacentReportItemEvidence([
    { name: '血糖', itemType: 'lab', sourcePage: 8, value: '5.1' },
    { name: '血糖', itemType: 'lab', sourcePage: 9, value: '5.2' },
    { name: '胸部CT', itemType: 'imaging', sourcePage: 10, findings: 'A' },
    { name: '胸部CT', itemType: 'imaging', sourcePage: 12, findings: 'B' },
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(reportItemSourcePages(rows[1]), [9]);
});

test('multiple evidence inputs are deduplicated and sorted', () => {
  assert.deepEqual(reportItemSourcePages({
    sourcePage: 9,
    sourcePages: [10, 8, 9],
    sourceEvidence: [{ page: 10 }, { page: 11 }],
  }), [8, 9, 10, 11]);
});

test('mongoose report subdocuments normalize into plain snapshot items', () => {
  const report = new MedicalReport({
    user: '507f1f77bcf86cd799439011',
    title: 'test',
    reportItems: [{ name: '胸部CT', itemType: 'imaging', sourcePage: 8 }],
  });
  const [item] = normalizeReportItemEvidence(report.reportItems);
  assert.equal(item.name, '胸部CT');
  assert.deepEqual(item.sourcePages, [8]);
  assert.equal(Object.prototype.hasOwnProperty.call(item, '$__parent'), false);
});
