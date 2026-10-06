const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileReviewedConcerns } = require('../src/utils/annualConcernReconcile');

const row = (key, title, kind, status = 'suggested') => ({
  id: key, key, title, kind, status, pathway: 'undecided',
  evidence: `依据${key}`, includedByName: key,
});

test('merges duplicate and synonymous reviewed concerns while retaining decisions and provenance', () => {
  const existing = [
    row('trend-bp', '高血压', 'ai_health_trend', 'included'),
    row('tag-bp', '高血压', 'reviewed_cardiovascular_tag'),
    row('trend-glucose', '糖代谢异常', 'ai_health_trend'),
    row('tag-glucose', '糖尿病前期', 'reviewed_cardiovascular_tag'),
    row('trend-artery', '动脉粥样硬化', 'ai_health_trend'),
    row('tag-artery', '动脉粥样硬化', 'reviewed_cardiovascular_tag'),
    row('scan', '其他风险', 'ai_risk_scan'),
  ];
  const result = reconcileReviewedConcerns(existing);
  assert.equal(result.rows.length, 4);
  assert.equal(result.merged, 3);
  assert.equal(result.rows[0].status, 'included');
  assert.deepEqual(result.rows[0].mergedSourceKeys, ['trend-bp', 'tag-bp']);
  assert.equal(result.rows[1].mergedSources.length, 2);
  assert.match(result.rows[1].evidence, /依据trend-glucose/);
  assert.match(result.rows[1].evidence, /依据tag-glucose/);
  assert.equal(result.rows[3].key, 'scan');
  const again = reconcileReviewedConcerns(result.rows, existing);
  assert.equal(again.rows.length, 4);
  assert.equal(again.changed, false);
});

test('tumor tag for atrophic gastritis merges with the reviewed chronic finding', () => {
  const result = reconcileReviewedConcerns([
    row('gastritis-trend', '慢性胃炎（萎缩性+肠化）', 'ai_health_trend'),
  ], [
    row('gastritis-tag', '慢性萎缩性胃炎伴轻度肠化', 'reviewed_tumor_tag'),
    row('lung-tag', '肺磨玻璃结节', 'reviewed_tumor_tag'),
  ]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.added, 1);
  assert.equal(result.merged, 1);
  assert.deepEqual(result.rows[0].mergedSourceKeys, ['gastritis-trend', 'gastritis-tag']);
  assert.equal(result.rows[1].title, '肺磨玻璃结节');
});
