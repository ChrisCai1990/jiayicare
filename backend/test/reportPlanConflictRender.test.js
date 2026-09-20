const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const staffRequire = require('node:module').createRequire(path.join(__dirname, '../../staff/package.json'));
const React = staffRequire('react');
const { renderToStaticMarkup } = staffRequire('react-dom/server');
const { transformSync } = require('esbuild');
const source = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ReportPlanConflictCard.jsx'), 'utf8');
const context = { module: { exports: {} }, require: name => name === 'react' ? React : { staffAPI: {} } };
vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
const report = { _id: 'r', audit_status: 'audited', planItemSync: { token: 't', status: 'conflict' } };
const render = (row = report, role = 'healthManager') => renderToStaticMarkup(React.createElement(context.module.exports.default, { report: row, role }));
test('manager sees explicit exception decision initially disabled, other roles read only', () => {
  assert.match(render(), /关联核对理由/);
  assert.match(render(), /button[^>]*disabled/);
  assert.doesNotMatch(render(report, 'familyDoctor'), /<textarea|<button|<input/);
});
test('resolved decision shows reason without repeat action; unrelated reports stay unchanged', () => {
  const html = render({ ...report, planItemSync: { status: 'resolved', resolution: { reason: '已核对保留' } } });
  assert.match(html, /已核对保留/);
  assert.doesNotMatch(html, /<button|<textarea/);
  assert.equal(render({ ...report, audit_status: 'unaudited' }), '');
  assert.equal(render({ ...report, planItemSync: null }), '');
});
test('correction result distinguishes completion, recovery pending, and conflict', () => {
  for (const [status, expected] of [['completed', '已按已审核报告完成回写'], ['pending', '尚不能认定检查已完成'], ['conflict', '未确认完成'], ['obsolete', '结果尚未确认']]) {
    assert.ok(context.module.exports.relinkResultText(status).includes(expected));
  }
  const html = render({ ...report, planItemId: 'new', planItemSync: { status: 'pending' },
    planItemConflictResolutions: [{ action: 'retarget_item', targetItemId: 'new', reason: '核对更正' }] });
  assert.match(html, /核对更正/);
  assert.match(html, /尚不能认定检查已完成/);
  assert.doesNotMatch(html, /<button|<textarea/);
});
test('running claim renders a read-only warning, never a conflict resolution button', () => {
  const html = render({ ...report, planItemSync: { status: 'running' } });
  assert.match(html, /不能仅凭超时强制解除占用/);
  assert.doesNotMatch(html, /<button|<textarea|<select/);
});

test('legacy dispatch lock is visible without plan-item metadata and overrides conflict actions', () => {
  for (const planItemSync of [null, { status: 'conflict' }, { status: 'running' }]) {
    const html = render({ ...report, planItemSync, legacyReviewWrite: { status: 'running' } });
    assert.match(html, /报告复查派单处理中/);
    assert.match(html, /不代表复查任务已全部生成/);
    assert.doesNotMatch(html, /<button|<textarea|<select/);
  }
  assert.equal(render({ ...report, planItemSync: null, legacyReviewWrite: { status: 'completed' } }), '');
});
