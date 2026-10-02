const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { transformSync } = require('esbuild'), { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'http://localhost' });
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { createRoot } = require('react-dom/client'), act = React.act || require('react-dom/test-utils').act;
const service = { key: 'followup:f', version: 'v1', patientId: 'u', patientName: '合成客户', title: '合成服务', attention: true, reasons: ['已逾期'], current: [{ taskId: 'f', label: '办理服务', person: { id: 'm', name: '健管专员' } }], coordinator: { id: 'p', name: '规划师' }, history: [], href: '/patients/u?tab=followups&supervisionTaskId=f' };
async function mount({ data = { services: [service], inbox: [] }, role = 'familyDoctor', error = '', send } = {}) {
  const writes = [], navigation = [], resource = { data, error, loading: false, refresh: async () => {} };
  const api = { getSupervisionTask: async () => ({ data: { theme: '原始任务', plannedContent: '核对预约要求', assigneeName: '健管', status: 'planned' } }), sendServiceSupervision: async body => { writes.push(body); if (send) return send(body) }, respondServiceSupervision: async (...args) => writes.push(args) };
  const m = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(require.resolve('../src/components/ServiceSupervisionPanel.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, { module: m, exports: m.exports, require: name => {
    if (name === 'react') return React;
    if (name === 'react-router-dom') return { useNavigate: () => path => navigation.push(path) };
    if (name === '../App') return { useStaff: () => ({ staff: { role } }) };
    if (name === '../api') return { getToken: () => 'test', staffAPI: api };
    if (name.includes('useWorkbenchResource')) return { default: () => resource, __esModule: true };
    if (name.includes('Pagination')) return { default: ({ page, totalPages, onChange }) => React.createElement('button', { onClick: () => onChange(page + 1) }, `${page}/${totalPages}`), __esModule: true };
    throw Error(name);
  } });
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el);
  await act(async () => root.render(React.createElement(m.exports.default)));
  return { el, writes, navigation, click: async text => act(async () => [...el.querySelectorAll('button')].find(b => b.textContent === text).click()), close: async () => { await act(async () => root.unmount()); el.remove() } };
}
const type = async (el, value) => act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); });
test('normal services collapsed, exceptions shown, pagination retains all rows', async () => {
  const h = await mount({ data: { services: [service, ...Array.from({ length: 6 }, (_, i) => ({ ...service, key: `n${i}`, title: `正常${i}`, attention: false }))], inbox: [] } });
  try { assert.match(h.el.textContent, /合成服务/); assert.doesNotMatch(h.el.textContent, /正常0/); await h.click('查看正常进度 6项'); assert.match(h.el.textContent, /正常0/); await h.click('1/2'); assert.match(h.el.textContent, /正常5/); } finally { await h.close() }
});
test('advisor sees service progress without creating reminder or coordination work', async () => {
  const h = await mount(); try {
    assert.match(h.el.textContent, /服务进度总览/);
    assert.match(h.el.textContent, /随访由健管专员督导/);
    assert.doesNotMatch(h.el.textContent, /提醒处理人|请求规划师协调/);
    await h.click('查看原服务'); assert.equal(h.navigation[0], service.href);
    assert.equal(h.writes.length, 0);
  } finally { await h.close() }
});
test('receiver submits actual response without execution controls', async () => {
  const h = await mount({ role: 'healthPlanner', data: { services: [], inbox: [{ _id: 'r', kind: 'coordinate', senderName: '顾问', note: '请协调', service }] } });
  try { await h.click('填写处理反馈'); await type(h.el.querySelector('textarea'), '已核对接续人员'); await h.click('提交'); assert.equal(h.writes[0][0], 'r'); assert.equal(h.writes[0][1].response, '已核对接续人员'); assert.doesNotMatch(h.el.textContent, /完成服务|重新派单/); } finally { await h.close() }
});
test('empty staff panel hidden; load errors remain visible without send controls', async () => {
  let h = await mount({ role: 'healthManager', data: { services: [], inbox: [] } }); try { assert.equal(h.el.textContent, '') } finally { await h.close() }
  h = await mount({ error: '网络失败' }); try { assert.match(h.el.querySelector('[role=alert]').textContent, /网络失败/); assert.doesNotMatch(h.el.textContent, /提醒处理人|请求规划师协调/) } finally { await h.close() }
});
test('source task opens read-only preview without navigating to repair-enabled patient pages', async () => {
  const h = await mount({ data: { services: [{ ...service, taskId: 'f' }], inbox: [] } });
  try { await h.click('查看原服务'); const modal = h.el.querySelector('[role=dialog]'); assert.match(modal.textContent, /核对预约要求/); assert.equal(modal.querySelectorAll('button').length, 1); assert.equal(modal.querySelector('button').textContent, '关闭'); assert.equal(h.navigation.length, 0) } finally { await h.close() }
});
