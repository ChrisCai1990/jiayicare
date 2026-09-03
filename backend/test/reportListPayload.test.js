const test = require('node:test');
const assert = require('node:assert/strict');
const { toReportListItem } = require('../src/utils/reportListPayload');

test('large audit snapshots are omitted without changing current findings or source history', () => {
  const report = {
    _id: 'report-1', reportItems: [{ name: 'test item', value: '5' }],
    content: 'data:image/png;base64,large', fileUrl: 'private-file',
    staffAuditSnapshot: { reportItems: [{ name: 'test item', value: '4' }] },
    pageParseHistory: [{ text: 'historical parse' }],
    dataEditLog: [{ itemName: 'test item', field: 'value', oldValue: '4', newValue: '5', operatorName: 'reviewer', at: '2026-09-03' }],
    familyDoctorAudit: { status: 'audited' },
  };
  const original = structuredClone(report);
  const result = toReportListItem(report);
  assert.deepEqual(result.reportItems, original.reportItems);
  assert.equal(result.fileUrl, original.fileUrl);
  assert.deepEqual(result.familyDoctorAudit, original.familyDoctorAudit);
  for (const field of ['content', 'staffAuditSnapshot', 'pageParseHistory']) assert.equal(field in result, false);
  assert.deepEqual(result.dataEditLog, [{ itemName: 'test item', field: 'value', operatorName: 'reviewer', at: '2026-09-03' }]);
  assert.deepEqual(report, original);
});

test('latest value attribution remains identical to the existing UI for repeated edits and duplicate names', () => {
  const history = [
    { itemName: 'A', itemIndex: 0, field: 'value', operatorName: 'first', at: '2026-08-01' },
    { itemName: 'B', field: 'value', operatorName: 'other', at: '2026-08-02' },
    { itemName: 'A', itemIndex: 1, field: 'value', operatorName: 'latest', at: '2026-08-03' },
    { itemName: 'A', field: 'unit', operatorName: 'unit edit', at: '2026-08-04' },
    { field: 'reportItems', oldValue: 'large snapshot', newValue: 'large snapshot' },
  ];
  const result = toReportListItem({ dataEditLog: history });
  assert.equal(result.dataEditLog.length, 2);
  for (const name of ['A', 'B']) {
    const before = [...history].reverse().find(log => log.itemName === name && log.field === 'value');
    const after = [...result.dataEditLog].reverse().find(log => log.itemName === name && log.field === 'value');
    assert.equal(after.operatorName, before.operatorName);
    assert.equal(after.at, before.at);
  }
});

test('legacy reports without edit history and Mongoose documents remain supported', () => {
  assert.deepEqual(toReportListItem({ _id: 'old' }), { _id: 'old', dataEditLog: [] });
  assert.deepEqual(toReportListItem({ toObject: () => ({ _id: 'doc', content: 'hidden' }) }), { _id: 'doc', dataEditLog: [] });
});
