const test = require('node:test');
const assert = require('node:assert/strict');
const consent = require('../src/utils/aiDataConsent');
const { createConsentCheckedCall } = require('../src/utils/aiBudget');
const staff = { _id: 'staff-a', tenantId: 'tenant-a' };
const dependencies = {
  readPatient: async query => ({ _id: query._id, tenantId: query.tenantId }),
  readReport: async () => ({ user: 'patient-a' }),
  readConsent: async () => null,
};
const check = (provider, context) => consent.assertContextPermission(provider, context, dependencies);

test('staff nutrition draft and report supplement use staff service scope without customer App consent', async () => {
  let sent = 0;
  const call = createConsentCheckedCall(async (_, send) => send(), check);
  await consent.withStaffService(staff, () => consent.withPersonalData('patient-a', 'health', () => call({ provider: 'qwen' }, async () => sent++)));
  await consent.withStaffService(staff, () => call({ provider: 'qwen', context: { reportId: 'report-a' } }, async () => sent++));
  assert.equal(sent, 2);
});

test('customer App health requests still require consent even alongside a concurrent staff request', async () => {
  await Promise.all([
    consent.withStaffService(staff, () => consent.withPersonalData('patient-a', 'health', async () => {
      await new Promise(resolve => setImmediate(resolve));
      await check('qwen', {});
    })),
    consent.withPersonalData('patient-a', 'health', () => assert.rejects(check('qwen', {}), { code: 'AI_DATA_CONSENT_REQUIRED' })),
  ]);
  await assert.rejects(check('qwen', { actorId: 'staff-a', tenantId: 'tenant-a', reportId: 'report-a' }), { code: 'AI_DATA_CONSENT_REQUIRED' });
});

test('staff scope rejects missing or foreign patients and does not grant speech or other providers', async () => {
  await consent.withStaffService(staff, () => consent.withPersonalData('patient-a', 'health', async () => {
    for (const patient of [null, { _id: 'patient-a', tenantId: 'tenant-b' }]) {
      await assert.rejects(consent.assertContextPermission('qwen', {}, { ...dependencies, readPatient: async () => patient }), { code: 'AI_DATA_CONSENT_REQUIRED' });
    }
    await assert.rejects(check('aliyun-nls', {}), { code: 'AI_DATA_CONSENT_REQUIRED' });
    await assert.rejects(check('deepseek', {}), { code: 'AI_DATA_CONSENT_REQUIRED' });
  }));
});

test('an unowned queued job cannot inherit the requesting staff scope', async () => {
  await consent.withStaffService(staff, () => consent.withReportStaffService({}, () =>
    assert.rejects(check('qwen', { reportId: 'report-a' }), { code: 'AI_DATA_CONSENT_REQUIRED' })));
});

test('queued report restores only its active staff initiator in an active matching institution', async () => {
  const report = { tenantId: 'tenant-a', parseJob: { actorId: 'staff-a' } };
  const active = { ...staff, role: 'healthManager', staffStatus: 'active' };
  const readers = { readStaff: async () => active, readTenant: async () => ({ status: 'active', code: 'jiayihui' }) };
  await consent.withReportStaffService(report, () => check('qwen', { reportId: 'report-a' }), readers);
  for (const invalid of [null, { ...active, staffStatus: 'inactive' }, { ...active, tenantId: 'tenant-b' }, { ...active, role: 'customer' }]) {
    await assert.rejects(consent.withReportStaffService(report, () => check('qwen', { reportId: 'report-a' }), { ...readers, readStaff: async () => invalid }), { code: 'AI_DATA_CONSENT_REQUIRED' });
  }
  await assert.rejects(consent.withReportStaffService(report, () => check('qwen', { reportId: 'report-a' }), { ...readers, readTenant: async () => ({ status: 'setup', code: 'jiayihui' }) }), { code: 'AI_DATA_CONSENT_REQUIRED' });
});
