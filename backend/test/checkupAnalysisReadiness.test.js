const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { summarizeCheckupPlan } = require('../src/utils/checkupAnalysisReadiness');

const plan = {
  _id: 'plan-1', title: '2026年度体检方案',
  items: [
    { _id: 'item-1', name: '血常规', status: 'completed', reportId: 'report-1' },
    { _id: 'item-2', name: '心电图', status: 'pending', reportId: null },
  ],
};

test('a designed plan remains incomplete while any item lacks an audited report', () => {
  const result = summarizeCheckupPlan(plan, [{ _id: 'report-1', audit_status: 'audited' }]);
  assert.equal(result.ready, false);
  assert.equal(result.completed, 1);
  assert.deepEqual(result.pending, [{ id: 'item-2', name: '心电图', reason: '项目尚未核对完成' }]);
});

test('a completed item with a withdrawn or missing report is not complete evidence', () => {
  const item = { ...plan.items[0] };
  const result = summarizeCheckupPlan({ ...plan, items: [item] }, [{ _id: 'report-1', audit_status: 'pending' }]);
  assert.equal(result.ready, false);
  assert.equal(result.completed, 0);
  assert.equal(result.pending[0].reason, '关联报告未通过当前审核');
  assert.equal(summarizeCheckupPlan({ ...plan, items: [{ ...item, reportId: null }] }, []).pending[0].reason,
    '已标记完成，但未关联报告');
});

test('a skipped scheme item does not count as collected material', () => {
  const result = summarizeCheckupPlan({ ...plan, items: [{ ...plan.items[0], status: 'skipped' }] },
    [{ _id: 'report-1', audit_status: 'audited' }]);
  assert.equal(result.ready, false);
  assert.equal(result.completed, 0);
});

test('all items require completed status and audited linked reports', () => {
  const complete = { ...plan, items: [{ ...plan.items[0] }, { ...plan.items[1], status: 'completed', reportId: 'report-2' }] };
  const result = summarizeCheckupPlan(complete, [
    { _id: 'report-1', audit_status: 'audited' },
    { _id: 'report-2', audit_status: 'audited' },
  ]);
  assert.equal(result.ready, true);
  assert.equal(result.completed, 2);
});

test('no designed plan keeps the existing analysis path; an empty plan is incomplete', () => {
  assert.equal(summarizeCheckupPlan(null).ready, true);
  assert.equal(summarizeCheckupPlan({ ...plan, items: [] }).ready, false);
});

test('readiness selects only pushed plans, allowing an unpublished newer draft', async () => {
  let filter;
  const source = fs.readFileSync(require.resolve('../src/utils/checkupAnalysisReadiness'), 'utf8');
  const context = {
    module: { exports: {} },
    require: name => name === '../models/HealthPlan'
      ? { findOne: query => {
        filter = query;
        return { sort: () => ({ select: () => ({ lean: async () => null }) }) };
      } }
      : {},
  };
  vm.runInNewContext(source, context);
  const result = await context.module.exports.checkupAnalysisReadiness('patient', 2026);
  assert.equal(result.ready, true);
  assert.deepEqual(Array.from(filter.status.$in), ['active', 'completed']);
  assert.equal(filter.pushedAt.$ne, null);
  assert.equal(filter.checkupDate.$gte.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(filter.checkupDate.$lt.toISOString(), '2027-01-01T00:00:00.000Z');
});
