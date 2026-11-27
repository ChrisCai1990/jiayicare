const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
const annualDispatch = require('../../shared/annualDispatch.cjs');
test('actual appointment entry opens advisor-plan/booking detail, not completion form', () => {
  const start = source.indexOf('const openExec = (f) => {');
  // Run the actual leading branch; reaching the old path must remain detectable.
  const prefix = source.slice(start, source.indexOf('if (isAnnualCheckupPreparation', start));
  const entry = prefix;
  const dependencies = { annualNutrition: { isTask: () => false }, isBodyCompInvitation: () => false,
    annualServiceItem: require('../../shared/annualServiceItem.cjs') };
  for (const f of [{ sourceType: 'scheduled', sourceAnnualPlanId: 'annual', deliveryMode: 'single', sourceScheduleKey: 'medical_treatment:2026-12-10:x' }, { annualBookingTask: true, plannedContent: '顾问：肾脏彩超，浙二超声科' }, { sourceType: 'annual_service', workflowKey: 'service_request', formData: { serviceRequest: { mode: 'single', moduleKey: 'abnormal_followup' } } }, { sourceType: 'annual_service', workflowKey: 'assistance_execute' }]) {
    let detail;
    vm.runInNewContext(entry + '\n throw new Error("旧事务入口"); }; openExec(f)', { ...dependencies, f, annualDispatch, medicalProxyStage: () => '', setFollowUpDetail: row => { detail = row; } });
    assert.equal(detail, f);
  }
  assert.throws(() => vm.runInNewContext(entry + '\n throw new Error("旧事务入口"); }; openExec(f)', { ...dependencies, annualDispatch, medicalProxyStage: () => '', f: { sourceType: 'scheduled', deliveryMode: 'reminder' }, setFollowUpDetail: () => assert.fail('纯提醒不能改成预约') }), /旧事务入口/);
});
