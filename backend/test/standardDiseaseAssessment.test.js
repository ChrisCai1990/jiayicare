const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStandardAssessments, matchesAssessment } = require('../../shared/standardDiseaseAssessment.cjs');

const reviewed = (name, diagnosis, date = '2026-09-30') => ({
  _id: 'report-1', title: `${name}超声`, checkDate: date,
  audit_status: 'audited', familyDoctorAudit: { status: 'audited' },
  reportItems: [{ name, diagnosis }],
});

test('extracts the report category and preserves source without converting it to a score grade', () => {
  const [result] = buildStandardAssessments(['甲状腺多发结节'], [reviewed('甲状腺结节', 'C-TIRADS 4A类')]);
  assert.equal(result.status, 'suggested');
  assert.equal(result.label, 'C-TIRADS 4A');
  assert.equal(result.reportId, 'report-1');
  assert.equal(result.evidence, 'C-TIRADS 4A类');
  assert.equal(result.severity, undefined);
  assert.equal(matchesAssessment(result, result), true);
  assert.equal(matchesAssessment(result, { ...result, reportRevision: 1 }), false);
  assert.equal(matchesAssessment(result, { ...result, ruleVersion: 'older' }), false);
});

test('unreviewed latest report cannot be bypassed by an older reviewed report', () => {
  const latest = { ...reviewed('甲状腺结节', 'C-TIRADS 2类', '2026-10-01'), audit_status: 'unaudited' };
  const [result] = buildStandardAssessments(['甲状腺多发结节'], [reviewed('甲状腺结节', 'C-TIRADS 4A类'), latest]);
  assert.equal(result.status, 'pending');
  assert.match(result.reason, /尚未完成双重审核/);
});

test('multiple categories and unspecified TI-RADS systems require review', () => {
  const [multiple] = buildStandardAssessments(['甲状腺多发结节'], [reviewed('甲状腺结节', 'C-TIRADS 3类；另一结节 C-TIRADS 4A类')]);
  const [unspecified] = buildStandardAssessments(['甲状腺多发结节'], [reviewed('甲状腺结节', 'TI-RADS 4类')]);
  assert.equal(multiple.status, 'pending');
  assert.match(multiple.reason, /多个/);
  assert.equal(unspecified.status, 'pending');
  const [range] = buildStandardAssessments(['甲状腺多发结节'], [reviewed('甲状腺结节', 'C-TIRADS 3-4A')]);
  assert.equal(range.status, 'pending');
});

test('supports explicit BI-RADS and Lung-RADS, while HPV positivity stays pending', () => {
  const reports = [
    reviewed('乳腺超声', 'BI-RADS 3类'),
    reviewed('肺部CT', 'Lung-RADS 2类'),
  ];
  const results = buildStandardAssessments(['双侧乳腺增生样改变', '肺部磨玻璃结节', '高危HPV53阳性'], reports);
  assert.deepEqual(results.map(item => item.label), ['BI-RADS 3', 'Lung-RADS 2', '待评估']);
  assert.match(results[2].reason, /不能直接换算/);
});
