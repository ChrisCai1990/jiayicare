const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { transformSync } = require('esbuild'), { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'http://localhost' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { createRoot } = require('react-dom/client'), act = React.act || require('react-dom/test-utils').act;
const pending = { planId: 'p', baseUpdatedAt: 'v1', taskVersion: 't1', reviews: [{ id: 'r', status: 'pending', createdAt: '2026-10-01', changes: [{ module: '异常复查', title: '合成事项', action: '更新', before: { title: '合成事项', date: '2026-10-01', advice: '原建议' }, after: { title: '合成事项', date: '', datePending: true, advice: '新建议' } }] }], followUps: [{ _id: 'f', theme: '原事项', status: 'in_progress', assignedTo: { name: '合成健管' } }], tasks: [], totals: { followUps: 1, tasks: 0 } };
async function mount(data = pending, canEdit = true, custom = {}) {
  let result = data; const writes = [];
  const api = { getAnnualExecutionReview: async () => ({ data: result }), completeAnnualExecutionReview: async (...args) => {
    writes.push(args); result = { ...data, reviews: data.reviews.map(r => ({ ...r, status: 'reviewed', note: args[2].note, outcome: args[2].outcome, reviewedAt: '2026-10-01', reviewedByName: '合成顾问' })) }; return { message: '已记录核对结果' };
  }, ...custom };
  const m = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(require.resolve('../src/components/AnnualExecutionReview.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, { module: m, exports: m.exports, require: n => n === 'react' ? React : { staffAPI: api }, window, document });
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el);
  const render = async (props = {}) => act(async () => root.render(React.createElement(m.exports.default, { patientId: 'u', planId: 'p', planVersion: 'v1', canEdit, ...props })));
  await render();
  return { el, api, writes, render, close: async () => { await act(async () => root.unmount()); el.remove(); } };
}
async function type(el, text) {
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, text); el.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
test('no empty panel; non-advisors can inspect but cannot acknowledge', async () => {
  let h = await mount({ ...pending, reviews: [] }); try { assert.equal(h.el.textContent, ''); } finally { await h.close(); }
  h = await mount(pending, false); try { assert.match(h.el.textContent, /日期待确认/); assert.match(h.el.textContent, /待健康顾问核对/); assert.equal(h.el.querySelector('textarea'), null); } finally { await h.close(); }
});
test('actual note and displayed versions are submitted; record becomes folded history', async () => {
  const h = await mount(); try {
    let button = [...h.el.querySelectorAll('button')].find(b => b.textContent === '记录核对结果'); assert.equal(button.disabled, true);
    await type(h.el.querySelector('textarea'), '已实际核对，现有安排不受影响');
    assert.equal(button.disabled, false); await act(async () => button.click());
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0][2].baseUpdatedAt, 'v1'); assert.equal(h.writes[0][2].taskVersion, 't1');
    assert.match(h.el.textContent, /已核对记录/); assert.equal(h.el.querySelector('textarea'), null);
  } finally { await h.close(); }
});
test('conflict preserves note and requires refresh; plan refresh never discards entered note', async () => {
  const h = await mount(pending, true, { completeAnnualExecutionReview: async () => { throw new Error('方案已变化'); } });
  try {
    await type(h.el.querySelector('textarea'), '保留实际说明');
    await h.render({ planVersion: 'v2' }); assert.equal(h.el.querySelector('textarea').value, '保留实际说明');
    await act(async () => [...h.el.querySelectorAll('button')].find(b => b.textContent === '记录核对结果').click());
    assert.match(h.el.querySelector('[role=alert]').textContent, /方案已变化/); assert.equal(h.el.querySelector('textarea').value, '保留实际说明');
    assert.equal([...h.el.querySelectorAll('button')].find(b => b.textContent === '记录核对结果').disabled, true);
  } finally { await h.close(); }
});
test('late response from another selected plan cannot replace current review', async () => {
  let release;
  const h = await mount(pending, true, { getAnnualExecutionReview: async (patient, plan) => plan === 'p' ? new Promise(resolve => { release = resolve; }) : ({ data: { ...pending, reviews: [] } }) });
  try { await h.render({ planId: 'new' }); await act(async () => release({ data: pending })); assert.equal(h.el.textContent, ''); }
  finally { await h.close(); }
});
test('load failure is visible instead of masquerading as no review', async () => {
  const h = await mount(pending, true, { getAnnualExecutionReview: async () => { throw new Error('合成加载失败'); } });
  try { assert.match(h.el.querySelector('[role=alert]').textContent, /合成加载失败/); } finally { await h.close(); }
});
