const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync(path.join(__dirname, '../src/components/ConsultationCorrespondence.jsx'), 'utf8');
const output = transformSync(source, { loader: 'jsx', format: 'cjs' }).code;
const moduleObject = { exports: {} };
vm.runInNewContext(output, { module: moduleObject, exports: moduleObject.exports, require });
const View = moduleObject.exports.default;
const consultation = { status: 'expert', correspondence: [{ _id: 'q1', question: '请补充报告', expertName: '测试专家', answers: [{ _id: 'a1', actorName: '测试顾问', content: '暂无报告' }, { _id: 'a2', content: '新增资料说明' }] }], members: [{ repliedAt: '2026-11-03T12:30:00Z', expertId: { name: '测试专家' }, opinion: '专业意见', nextStep: '下一步安排', revisions: [{ opinion: '原意见', nextStep: '原安排' }] }] };
test('archive renders complete correspondence and formal response without edit controls', () => {
  const html = renderToStaticMarkup(React.createElement(View, { consultation }));
  for (const text of ['请补充报告', '暂无报告', '新增资料说明', '专业意见', '下一步安排', '原意见']) assert.ok(html.includes(text));
  assert.ok(!html.includes('<textarea'));
});
test('only active advisor view offers response fields', () => {
  assert.ok(renderToStaticMarkup(React.createElement(View, { consultation, advisor: true })).includes('<textarea'));
  assert.ok(!renderToStaticMarkup(React.createElement(View, { consultation: { ...consultation, status: 'completed' }, advisor: true })).includes('<textarea'));
});
