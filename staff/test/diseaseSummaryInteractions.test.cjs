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
test('initial overview only allows correction; history is collapsed and subsequent AI has a separate tab', async () => {
  let saves=0;
  const h=await setup({updateDiseaseRecordSummary:async()=>{saves++;return{}}});
  try {
    assert.ok(h.container.textContent.includes('首次专病概况'));
    assert.ok(h.container.textContent.includes('阶段性概要'));
    assert.ok(!h.container.textContent.includes('服务与跟进记录'));
    assert.ok(h.container.querySelector('details > summary').textContent.includes('修订留痕'));
    await h.click('纠正首次概况');
    assert.ok(!h.container.textContent.includes('结合后续资料更新摘要'));
    assert.equal(saves,0);
    await h.click('保存摘要'); assert.equal(saves,1);
  } finally {await h.close()}
});
