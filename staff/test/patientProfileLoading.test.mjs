import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the page's actual loader with controlled network/state boundaries.
const page = fs.readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = page.indexOf('  const load = async (refreshScreening = true) => {');
const end = page.indexOf('\n  }\n', start) + '\n  }'.length;
assert.ok(start >= 0 && end > start);
function harness(getPatient, tab = 'info') {
  const calls = {};
  const context = {
    id: 'patient-A', tab, activePatientId: { current: 'patient-A' }, profileLoadVersion: { current: 0 },
    staffAPI: { getPatient, getScreeningReports: () => { throw new Error('archive must be lazy'); } },
    loadScreening: () => { calls.screening = true; return new Promise(() => {}); },
  };
  for (const name of ['LoadError', 'Data', 'EditForm', 'BasicInfoForm', 'HealthNeedsForm', 'HealthForm', 'LifestyleForm', 'InsuranceForm', 'LabForm', 'SeverityForm', 'BodyCompForm', 'AiSummaryForm', 'Loading']) {
    context[`set${name}`] = value => { calls[name] = value; };
  }
  for (const name of ['EditForm', 'BasicInfoForm', 'HealthNeedsForm', 'HealthForm', 'LifestyleForm', 'InsuranceForm']) context[`build${name}`] = value => value;
  context.toast = value => { calls.toast = value; };
  const load = vm.runInNewContext(`${page.slice(start, end)}; load`, context);
  return { load, calls, context };
}

test('basic profile displays without requesting the screening archive', async () => {
  const data = { user: { name: 'Fixture' } };
  const { load, calls } = harness(async () => ({ data }));
  await load(false);
  assert.equal(calls.Data, data);
  assert.equal(calls.Loading, false);
  assert.equal(calls.screening, undefined);
});

test('saving from screening refreshes it without awaiting a slow report request', async () => {
  const { load, calls } = harness(async () => ({ data: { user: {} } }), 'ai');
  await load();
  assert.equal(calls.screening, true);
  assert.equal(calls.Loading, false);
});

test('late responses cannot replace another patient or a newer profile load', async () => {
  let resolve;
  const first = new Promise(r => { resolve = r; });
  const { load, calls, context } = harness(() => first);
  const pending = load(false);
  context.activePatientId.current = 'patient-B';
  resolve({ data: { user: {} } });
  await pending;
  assert.deepEqual(calls, {});

  let finishOld;
  let count = 0;
  const newer = { user: { name: 'Newer' } };
  const same = harness(() => ++count === 1 ? new Promise(r => { finishOld = r; }) : Promise.resolve({ data: newer }));
  const old = same.load(false);
  await same.load(false);
  finishOld({ data: { user: { name: 'Old' } } });
  await old;
  assert.equal(same.calls.Data, newer);
});

test('access failures end loading and preserve the permission error', async () => {
  const { load, calls } = harness(async () => { throw { status: 403 }; });
  await load(false);
  assert.equal(calls.LoadError, '无权限查看该会员');
  assert.equal(calls.Loading, false);
  assert.equal(calls.Data, undefined);
});
