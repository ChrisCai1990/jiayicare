const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const act = React.act || require('react-dom/test-utils').act;
const helpers = require('../../shared/diseaseSummary.cjs');
const page = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8');
const start = page.indexOf('function DiseaseArchivePanel('), end = page.indexOf('\nfunction ', start + 10);
async function setup(api) {
  const module = { exports: {} };
  vm.runInNewContext(transformSync(page.slice(start, end) + '\nmodule.exports = DiseaseArchivePanel', { loader: 'jsx', format: 'cjs' }).code, {
    ...React, React, module, diseaseSummaryHelpers: helpers, staffAPI: api, useStaff: () => ({ staff: { role: 'familyDoctor' } }),
    sourceLabels: { medical_record: '医疗资料' }, verifyLabels: { verified: '已核验' },
  });
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  const summary = { chiefComplaint: '初次资料', sourceType: 'medical_record', verificationStatus: 'verified' };
  await act(async () => root.render(React.createElement(module.exports, { patientId: 'patient', user: { diseaseRecords: [{ _id: 'record', name: '测试专病', summary, summaryHistory: [{ ...summary, archivedAt: '2026-09-17T11:39:34Z' }, { ...summary, archivedAt: '2026-09-17T11:40:59Z' }], courseEntries: [] }] }, serviceRecords: [], onSaved: async () => {}, toast: () => {} })));
  return { container, async click(text) { const b = [...container.querySelectorAll('button')].find(b => b.textContent === text); assert.ok(b, text); await act(async () => b.click()); }, async close() { await act(async () => root.unmount()); container.remove(); } };
}
test('duplicate history is grouped with both audit times; AI draft requires explicit saving', async () => {
  let saves = 0, sent;
  const h = await setup({ generateDiseaseSummary: async () => ({ data: { summary: { chiefComplaint: '含后续资料的新摘要' }, expectedRecordVersion: 'version', coverage: { courseCount: 7, reportCount: 1 } } }), updateDiseaseRecordSummary: async (_, body) => { saves++; sent = body; return {}; } });
  try {
    await h.click('修订历史（1）');
    assert.match(h.container.textContent, /相同内容 2 次留痕/);
    await h.click('专病概况'); await h.click('修订健康信息摘要'); await h.click('结合后续资料更新摘要');
    assert.equal(saves, 0);
    assert.match(h.container.textContent, /已纳入 7 条健康变化、1 份关联报告/);
    assert.equal(h.container.querySelector('textarea').value, '含后续资料的新摘要');
    await h.click('保存摘要'); assert.equal(saves, 1); assert.equal(sent.expectedRecordVersion, 'version');
  } finally { await h.close(); }
});
test('generation error keeps editable original summary with visible error and no save', async () => {
  const h = await setup({ generateDiseaseSummary: async () => { throw new Error('服务不可用'); }, updateDiseaseRecordSummary: () => { throw new Error('unexpected save'); } });
  try {
    await h.click('修订健康信息摘要'); await h.click('结合后续资料更新摘要');
    assert.equal(h.container.querySelector('[role=alert]').textContent, '服务不可用');
    assert.equal(h.container.querySelector('textarea').value, '初次资料');
  } finally { await h.close(); }
});
