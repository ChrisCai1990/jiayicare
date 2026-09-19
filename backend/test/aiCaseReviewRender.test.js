const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const staffRequire = require('node:module').createRequire(path.join(__dirname, '../../staff/package.json'));
const React = staffRequire('react');
const { renderToStaticMarkup } = staffRequire('react-dom/server');
const { transformSync } = require('esbuild');

function load() {
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/components/AiCaseReviewPanel.jsx'), 'utf8');
  const code = transformSync(source + '\nexport { StageWorkflow };', { loader: 'jsx', format: 'cjs' }).code;
  const context = { module: { exports: {} }, require: name => {
    if (name === 'react') return React;
    if (name === '../api') return { staffAPI: {}, API_ORIGIN: '' };
    throw Error(`Unexpected dependency ${name}`);
  } };
  vm.runInNewContext(code, context);
  return context.module.exports;
}
test('review module imports and renders without module-scope props or hooks', () => {
  const { default: Panel } = load();
  for (const role of ['familyDoctor', 'nutritionist', 'rehabSpecialist', 'tcmDoctor']) {
    assert.equal(typeof renderToStaticMarkup(React.createElement(Panel, { patientId: 'synthetic', staff: { role }, toast() {} })), 'string');
  }
});
test('stage workflow uses each assessment primary reviewer, including empty and legacy records', () => {
  const { StageWorkflow } = load();
  assert.match(renderToStaticMarkup(React.createElement(StageWorkflow, {})), /尚未生成评估/);
  for (const [role, label] of [['familyDoctor', '健康顾问审核'], ['nutritionist', '营养师审核'], ['rehabSpecialist', '运动复健师审核'], ['tcmDoctor', '药食同源专业人员审核']]) {
    assert.match(renderToStaticMarkup(React.createElement(StageWorkflow, { assessment: { primaryReviewRole: role, status: 'professional_review' } })), new RegExp(label));
  }
  assert.match(renderToStaticMarkup(React.createElement(StageWorkflow, { assessment: { status: 'pending' } })), /营养师审核/);
});
