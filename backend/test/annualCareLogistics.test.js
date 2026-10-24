const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLogistics } = require('../src/utils/annualCareLogistics');

test('report title cannot become a followup hospital', () => {
  const raw = { abnormal_followup: [{ hospital: '爱康卓悦健康体检报告', items: '胸部CT' }] };
  const next = normalizeLogistics(raw, { reports: [{ title: '爱康卓悦健康体检报告' }] });
  assert.equal(next.abnormal_followup[0].hospital, '');
  assert.equal(raw.abnormal_followup[0].hospital, '爱康卓悦健康体检报告');
});

test('dental gift suggests clinic within valid period and asks staff to verify usage', () => {
  const next = normalizeLogistics({ medical_treatment: [{ reason: '牙科洁牙', visit_time: '2026-12-16' }] },
    { today: '2026-10-24', dentalGift: { status: 'unknown', expired: false, expiresAt: '2026-10-31' } });
  assert.equal(next.medical_treatment[0].hospital, '艾维口腔');
  assert.equal(next.medical_treatment[0].visit_time, '2026-10-31');
  assert.match(next.medical_treatment[0].notes, /使用情况.*核对/);
});

test('verified previous dental clinic takes priority and expired gift does not change date', () => {
  const next = normalizeLogistics({ medical_treatment: [{ reason: '洁牙', visit_time: '2026-12-16' }] },
    { visits: [{ date: '2026-08-01', department: '口腔科', hospital: '常去口腔医院' }],
      today: '2026-11-01', dentalGift: { status: 'unknown', expired: true, expiresAt: '2026-10-31' } });
  assert.equal(next.medical_treatment[0].hospital, '常去口腔医院');
  assert.equal(next.medical_treatment[0].visit_time, '2026-12-16');
});

test('usable cleaning gift takes priority over historical dental clinic', () => {
  const next = normalizeLogistics({ medical_treatment: [{ reason: '洁牙', visit_time: '2026-10-28' }] },
    { visits: [{ date: '2026-08-01', department: '口腔科', hospital: '旧口腔医院' }],
      today: '2026-10-24', dentalGift: { status: 'available', expired: false, expiresAt: '2026-10-31' } });
  assert.equal(next.medical_treatment[0].hospital, '艾维口腔');
});
