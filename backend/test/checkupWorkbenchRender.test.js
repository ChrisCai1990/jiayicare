const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');
function load(file, imports) {
  const context = { module: { exports: {} }, require: name => name === 'react' ? React : imports[name] };
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../../staff/src', file), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, context);
  return context.module.exports;
}
const Pagination = load('components/Pagination.jsx', {}).default;
const { CheckupProgressList } = load('components/CheckupProgressPanel.jsx', {
  './Pagination': { default: Pagination, __esModule: true },
  'react-router-dom': {}, '../api': {}, '../hooks/useWorkbenchResource': {},
});
const row = (id, completed = false) => ({
  planId: id, patientId: id, patientName: '客户' + id, patientPhone: '000',
  planTitle: '体检方案' + id, totalItems: 3, completedCount: completed ? 3 : 1,
  pendingCount: completed ? 0 : 2, skippedCount: 0, progressStatus: completed ? 'completed' : 'in_progress',
});
test('real component supports pagination, completed history, counts, opening plans, and error retry', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  let opened, retried = false;
  const rows = [...Array.from({ length: 6 }, (_, i) => row(String(i + 1))), row('done', true)];
  const props = { rows, onOpen: id => { opened = id; }, onRetry: () => { retried = true; } };
  const text = () => document.body.textContent;
  const button = label => [...document.querySelectorAll('button')].find(b => b.textContent === label);
  try {
    await act(async () => root.render(React.createElement(CheckupProgressList, props)));
    assert.match(text(), /6位客户 · 6份方案/);
    assert.match(text(), /核对中/);
    assert.match(text(), /已完成 1\/3 项 · 未完成 2 项/);
    assert.doesNotMatch(text(), /客户6/);
    await act(async () => button('下一页').click());
    assert.match(text(), /客户6/);
    await act(async () => document.querySelector('button[aria-label="查看客户6的体检方案6"]').click());
    assert.equal(opened, '6');
    await act(async () => button('已完成 1').click());
    assert.match(text(), /客户done/);
    assert.match(text(), /已完成 3\/3 项/);
    assert.doesNotMatch(text(), /客户6/);
    await act(async () => button('待完成 6').click());
    assert.match(text(), /客户1/);
    await act(async () => root.render(React.createElement(CheckupProgressList, { ...props, error: '连接失败' })));
    assert.match(document.querySelector('[role="alert"]').textContent, /显示上次结果/);
    assert.match(text(), /客户1/);
    await act(async () => button('重试').click());
    assert.equal(retried, true);
    await act(async () => root.render(React.createElement(CheckupProgressList, { ...props, rows: [row('1', true)] })));
    assert.match(text(), /暂无待完成的体检方案/);
    await act(async () => button('已完成 1').click());
    assert.match(text(), /客户1/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});

test('execution task view does not retain a completed checkup plan', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(CheckupProgressList, { taskMode: true, rows: [row('pending')] })));
    assert.match(document.body.textContent, /体检方案核对任务/);
    assert.doesNotMatch(document.body.textContent, /已完成 0/);
    await act(async () => root.render(React.createElement(CheckupProgressList, { taskMode: true, rows: [] })));
    assert.equal(document.body.textContent, '');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
