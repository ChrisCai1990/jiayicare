const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('single-card regeneration submits the displayed year, record index and token', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8');
  const start = source.indexOf('  const handleRegenerateAISummaryItem =');
  const end = source.indexOf('  const handleRefreshAISummaryOverview =', start);
  assert.ok(start >= 0 && end > start);
  let payload;
  const context = {
    window: { prompt: () => '13.1 μmol/L 需要干预' },
    staffAPI: { regenerateAIHealthSummaryItem: async (_id, body) => { payload = body; return { data: {}, newRecord: false }; } },
    id: 'member', aiYear: '2025', aiRecordIndex: { doctor: 0 },
    setAiSummaryLoading() {}, applyAIHealthSummary() {}, setLastRegeneratedItem() {}, toast() {},
  };
  await vm.runInNewContext(`${source.slice(start, end)}\nhandleRegenerateAISummaryItem('cardiovascular_risk', '同型半胱氨酸', { year: '2026', recordIndex: 2, expectedRecordToken: 'displayed-token' })`, context);
  assert.equal(payload.year, '2026');
  assert.equal(payload.recordIndex, 2);
  assert.equal(payload.expectedRecordToken, 'displayed-token');
  assert.equal(payload.itemName, '同型半胱氨酸');
});
