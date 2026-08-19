const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReportScreeningProjectionView } = require('../src/utils/reportScreeningProjectionView');

test('projection detail is built from the immutable revision rather than the mutable report draft', () => {
  const [row] = buildReportScreeningProjectionView({
    report: {
      title: '年度体检', checkDate: '2026-08-14', institution: '原报告机构',
      reportItems: [{ sourceItemId: 'draft-item', name: '草稿项目', value: '错误值' }],
    },
    revision: {
      items: [{ sourceItemId: 'formal-item', name: '空腹血糖', value: '4.9', screeningKey: 'lab|glucose' }],
    },
    projections: [{ itemId: 'lab|glucose', itemLabel: '血糖', sourceItemIds: ['formal-item'] }],
  });

  assert.equal(row.title, '血糖');
  assert.equal(row.checkDate, '2026-08-14');
  assert.deepEqual(row.reportItems.map(item => item.sourceItemId), ['formal-item']);
  assert.ok(!row.reportItems.some(item => item.sourceItemId === 'draft-item'));
});

test('legacy projection source ids fall back to the formal revision screening key', () => {
  const [row] = buildReportScreeningProjectionView({
    report: { title: '年度体检', hospital: '体检机构' },
    revision: {
      items: [
        { sourceItemId: 'a', name: '总胆固醇', screeningKeys: ['lab|lipid'] },
        { sourceItemId: 'b', name: '无关项目', screeningKey: 'lab|other' },
      ],
    },
    projections: [{ itemId: 'lab|lipid', itemLabel: '血脂' }],
  });

  assert.equal(row.institution, '体检机构');
  assert.deepEqual(row.reportItems.map(item => item.name), ['总胆固醇']);
});

test('no projection rows never manufacture a screening record from the report title', () => {
  assert.deepEqual(buildReportScreeningProjectionView({
    report: { title: '与专项筛查同名的待审核报告' },
    revision: { items: [{ name: '项目' }] },
    projections: [],
  }), []);
});
