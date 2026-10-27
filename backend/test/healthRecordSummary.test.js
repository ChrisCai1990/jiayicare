const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeHealthRecords, recordSummaryView } = require('../src/utils/healthRecordSummary');
const row = (type, value, date, extra) => ({ type, value, recordedAt: new Date(date), extra });
test('extreme values remain records without diagnosis, grading or recommendations', () => {
  const result = summarizeHealthRecords([row('heartRate','45','2026-10-20'),row('bloodSugar','2.5','2026-10-21'),row('bloodPressure','190/110','2026-10-21')]);
  assert.equal(result.recordCount, 3);
  assert.equal(result.metrics[0].value, '45');
  for (const metric of result.metrics) assert.equal(metric.status, undefined);
  for (const name of ['healthScore','scoreDelta','scoreBreakdown','highlights']) assert.equal(result[name], undefined);
});
test('summary is deterministic, retains values and computes time-ordered numeric changes', () => {
  const records = [row('weight','63.2','2026-10-22'),row('weight','64','2026-10-20'),row('bloodPressure','120/80','2026-10-20'),row('bloodPressure','130/85','2026-10-22'),row('sleep','8','2026-10-21')];
  const result = summarizeHealthRecords(records);
  assert.deepEqual(result, summarizeHealthRecords(records));
  assert.equal(result.recordCount, 5);
  assert.equal(result.metrics[0].delta, '-0.8'); assert.equal(result.metrics[0].trend, 'down');
  assert.equal(result.metrics[1].delta, '+10/+5'); assert.equal(result.metrics[1].value, '130/85');
  assert.equal(records[0].value, '63.2');
});
test('malformed values do not become NaN, zero or a health assessment', () => {
  const result = summarizeHealthRecords([row('bloodSugar','','2026-10-20'),row('bloodSugar','未测','2026-10-22')]);
  assert.equal(result.metrics[0].delta, null); assert.equal(result.metrics[0].trend, null);
  assert.equal(result.metrics[0].value, '未测');
});
test('old shared snapshots lose legacy medical judgments but retain recorded content without mutation', () => {
  const original = { healthScore: 22, scoreDelta: 3, highlights: [{ text: 'synthetic diagnosis' }], summary: ['synthetic advice'],
    period: '本周', recordCount: 1, metrics: [{ type: 'heartRate', value: '45', status: 'danger', label: '心率', delta: '-1', trend: 'down' }] };
  const output = recordSummaryView(original);
  assert.equal(output.healthScore, undefined); assert.equal(output.highlights, undefined); assert.equal(output.summary, undefined);
  assert.equal(output.metrics[0].value, '45'); assert.equal(output.metrics[0].status, undefined);
  assert.equal(original.healthScore, 22); assert.equal(original.metrics[0].status, 'danger');
});
