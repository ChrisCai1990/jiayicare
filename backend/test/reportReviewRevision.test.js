const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewRevisionMatch } = require('../src/utils/reportReviewRevision');

test('旧报告的初始版本同时匹配缺失字段和明确的零版本', () => {
  assert.deepEqual(reviewRevisionMatch(undefined), { $in: [0, null] });
  assert.deepEqual(reviewRevisionMatch(0), { $in: [0, null] });
  assert.deepEqual(reviewRevisionMatch(3), 3);
});
