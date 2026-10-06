const test = require('node:test');
const assert = require('node:assert/strict');
const { clinicalType, isEvidenceConcern } = require('../src/utils/annualConcernTypes');
const { reconcileReviewedConcerns } = require('../src/utils/annualConcernReconcile');

const row = (title, kind = 'ai_health_trend') => ({ id: title, key: title, title, kind, status: 'suggested' });

test('examinations and markers remain evidence while findings and questions remain problems', () => {
  for (const title of ['心脏超声', '冠脉CTA', '颈动脉超声']) assert.equal(clinicalType(row(title)), 'examination');
  assert.equal(clinicalType(row('脂蛋白磷脂酶A2')), 'marker');
  assert.equal(clinicalType(row('肺磨玻璃结节', 'reviewed_tumor_tag')), 'finding');
  assert.equal(clinicalType(row('地中海贫血?', 'reviewed_chronic_tag')), 'question');
  assert.equal(clinicalType(row('高血压')), 'health_issue');
  assert.equal(isEvidenceConcern(row('冠脉CTA')), true);
  assert.equal(isEvidenceConcern(row('肺磨玻璃结节', 'reviewed_tumor_tag')), false);
});

test('existing reviewed rows are reclassified without losing review decisions or sources', () => {
  const existing = [{ ...row('冠脉CTA'), status: 'included', pathway: 'specialist', evidence: '非钙化斑块' }, row('肺磨玻璃结节', 'reviewed_tumor_tag')];
  const result = reconcileReviewedConcerns(existing);
  assert.equal(result.rows.length, 2);
  assert.equal(result.reclassified, 2);
  assert.equal(result.rows[0].clinicalType, 'examination');
  assert.equal(result.rows[0].status, 'included');
  assert.equal(result.rows[0].pathway, 'specialist');
  assert.equal(result.rows[0].evidence, '非钙化斑块');
  assert.equal(reconcileReviewedConcerns(result.rows).changed, false);
});
