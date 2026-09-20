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
