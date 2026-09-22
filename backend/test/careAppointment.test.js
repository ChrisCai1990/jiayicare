const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { normalizeCarePreferences, carePreferenceContext } = require('../src/utils/carePreferences');
const { addMonths, appointmentDay, evaluatedTiming } = require('../../shared/annualAppointment.cjs');
test('optional care preferences default city without inventing hospital or consent', () => {
  assert.deepEqual(carePreferenceContext({ residence: { city: '杭州' } }), { residenceCity: '杭州', preferredCities: '杭州', preferredHospitals: '', allowTravel: '' });
  assert.equal(normalizeCarePreferences({ city: ' 上海 ', hospitals: '', allowTravel: 'no' }).city, '上海');
  for (const bad of [[], { city: {} }, { allowTravel: 'maybe' }, { hospitals: 'a'.repeat(501) }]) assert.throws(() => normalizeCarePreferences(bad));
});
test('calendar month evaluation and seven-day booking schedule cross leap/month/year boundaries', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-09-22', 3), '2026-12-22');
  assert.equal(appointmentDay('2027-01-03'), '2026-12-27');
  assert.equal(appointmentDay('2026-02-30'), '');
  assert.equal(addMonths('', 3), '');
  const row = evaluatedTiming({ timingBaseDate: '2026-09-22', timingIntervalMonths: 1 }, 'time');
  assert.equal(row.time, '2026-10-22'); assert.equal(row.appointmentSchedulingVersion, 1);
  assert.equal(evaluatedTiming({ time: '2026-10-25', timingBaseDate: '2026-09-22', timingIntervalMonths: 1 }, 'time').time, '2026-10-25');
  assert.equal(evaluatedTiming({ time: '' }, 'time').appointmentSchedulingVersion, undefined);
  assert.throws(() => evaluatedTiming({ time: '2026-02-30' }, 'time'), /日期无效/);
});
test('existing schedule remains unchanged unless explicitly using appointment scheduling', () => {
  const { normalizeAnnualItems } = require('../src/utils/annualItemManagement');
  const result = normalizeAnnualItems({ annual_checkup: { date: '2027-05-01', followUpStaff: 'wrong', focus: '关注项目' } }, 'manager');
  assert.equal(result.annual_checkup.followUpStaff, 'manager');
  assert.equal(result.annual_checkup.appointmentSchedulingVersion, undefined);
  assert.equal(result.annual_checkup.date, '2027-05-01');
});
test('patient edit route validates preference input and uses nested city update', () => {
  const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
  const route = source.slice(source.indexOf("router.put('/patients/:id',"), source.indexOf("router.put('/patients/:id',") + 3800);
  assert.match(route, /normalizeCarePreferences\(req.body.carePreferences\)/);
  assert.match(route, /updateData\['residence.city'\]/);
  assert.match(source, /carePreferenceContext\(user\)/);
});
test('real followup builder dispatches seven days earlier to assigned manager and preserves source key', async t => {
  const User = require('../src/models/User'), Admin = require('../src/models/Admin');
  const manager = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: manager }) }) }));
  t.mock.method(Admin, 'find', () => ({ select: () => ({ lean: async () => [{ _id: manager, name: '测试健管' }] }) }));
  const { buildAnnualPlanFollowUps } = require('../src/utils/annualPlanFollowUps');
  const plan = { _id: 'plan', patientId: 'patient', moduleData: { medical_treatment: { records: [{ visit_time: '2026-10-22', department: '眼科' }] } } };
  const oldRows = await buildAnnualPlanFollowUps(plan);
  plan.moduleData.medical_treatment.records[0].appointmentSchedulingVersion = 1;
  const rows = await buildAnnualPlanFollowUps(plan);
  assert.equal(rows.length, 1); assert.equal(rows[0].date.toISOString().slice(0, 10), '2026-10-15');
  assert.equal(rows[0].assignedTo, manager); assert.match(rows[0].content, /建议就医\/检查日期：2026-10-22/);
  assert.equal(rows[0].sourceScheduleKey, oldRows[0].sourceScheduleKey);
  assert.equal(oldRows[0].date.toISOString().slice(0, 10), '2026-10-22');
});
