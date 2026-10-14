const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewToken, withReviewTokens } = require('../src/utils/summaryReviewVersion');

test('review token survives the JSON round trip used by the Staff response and edit route', () => {
  const reportId = { bytes: [1, 2, 3], toJSON() { return 'report-id'; } };
  const record = { scope: 'doctor', generatedAt: new Date('2026-09-23T08:00:00.000Z'),
    sections: { cardiovascular_risk: { topics: [{ name: '同型半胱氨酸', sourceReportId: reportId }] } } };
  const displayed = withReviewTokens({ byYear: { 2026: { records: [record] } } }).byYear[2026].records[0];
  const submitted = JSON.parse(JSON.stringify(record));
  assert.equal(displayed._reviewToken, reviewToken(submitted));
  assert.equal(reviewToken(displayed), reviewToken(submitted), 'decoration must not change the token');
});
