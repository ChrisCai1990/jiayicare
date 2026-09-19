const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const staffRequire = require('node:module').createRequire(path.join(__dirname, '../../staff/package.json'));
const React = staffRequire('react');
const { renderToStaticMarkup } = staffRequire('react-dom/server');
const { transformSync } = require('esbuild');
const source = fs.readFileSync(path.join(__dirname, '../../staff/src/components/CheckupCompletionEvidence.jsx'), 'utf8');
const context = { module: { exports: {} }, require: () => React };
vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
const render = item => renderToStaticMarkup(React.createElement(context.module.exports.default, { item }));
const proof = { servicePlanId: 'service', handoffId: 'handoff', finalTaskId: 'final', reviewTaskId: 'review' };
test('completed verified handoff displays read-only provenance, no action button', () => {
  const html = render({ status: 'completed', checkupPreparationCompletion: proof });
  assert.match(html, /体检服务验收后自动完成/);
  for (const id of Object.values(proof)) assert.ok(html.includes(id));
  assert.doesNotMatch(html, /<button|<input/);
});
test('manual, incomplete and unfinished tasks never claim service closure', () => {
  assert.equal(render({ status: 'completed' }), '');
  assert.equal(render({ status: 'planned', checkupPreparationCompletion: proof }), '');
  assert.equal(render({ status: 'completed', checkupPreparationCompletion: { servicePlanId: 'service' } }), '');
});
