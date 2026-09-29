const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function panel(states, navigate = () => {}) {
  const source = fs.readFileSync(require.resolve('../../staff/src/components/ConsultationTodosPanel.jsx'), 'utf8')
    .replace(/^import [^\r\n]*\r?\n/gm, '').replace('export default function', 'function');
  const compiled = require('@babel/core').transformSync(source + '\nConsultationTodosPanel;', { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')] }).code;
  let index = 0;
  const Component = vm.runInNewContext(compiled, { React, useEffect() {}, useState: () => [states[index++], () => {}], useNavigate: () => navigate });
  return Component();
}
function buttons(element) {
  if (!element || typeof element !== 'object') return [];
  return [...(element.type === 'button' ? [element] : []), ...React.Children.toArray(element.props?.children).flatMap(buttons)];
}
test('consultation panel renders all-item count, paginates and opens the exact original record', () => {
  const items = Array.from({ length: 23 }, (_, i) => ({ id: String(i), name: '验收客户', label: '服务承接待跟进', summary: '待核对需求', overdue: i === 0, link: '/visitor-leads?workbench=intakes&itemId=' + i }));
  let target;
  const tree = panel([items, '', false, 0], link => { target = link; });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /23 项/); assert.match(html, /1 项逾期/);
  assert.equal((html.match(/待核对需求/g) || []).length, 10);
  assert.match(html, /下一页/);
  buttons(tree).find(b => b.props.style?.display === 'block').props.onClick();
  assert.equal(target, items[0].link);
});
test('failed consultation query never renders an empty-success message', () => {
  const html = renderToStaticMarkup(panel([[], '接口暂不可用', false, 0]));
  assert.match(html, /role="alert"/); assert.match(html, /接口暂不可用/);
  assert.doesNotMatch(html, /暂无待联系/);
});
test('polling shrink clamps to the last available page', () => {
  const html = renderToStaticMarkup(panel([[{ id: 'one', name: '唯一待办', label: '待联系', summary: '仍需处理' }], '', false, 9]));
  assert.match(html, /唯一待办/); assert.match(html, /仍需处理/);
});
