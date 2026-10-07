const test = require('node:test');
const assert = require('node:assert/strict');
const { eligibility } = require('../src/utils/annualReviewEligibility');
const { inheritArrangements } = require('../src/utils/annualArrangementHistory');
const { metricsFromTargets } = require('../../shared/nutritionComparisonMetrics.cjs');
const { buildAnnualCheckupPreparation: build } = require('../src/utils/annualCheckupPreparation');
const { buildAnnualPlanServiceTasks } = require('../src/utils/annualPlanServiceTasks');
test('annual eligibility uses actual reviewed exam dates and inclusive rolling twelve months', () => {
 const now = new Date('2026-10-07T08:00:00Z');
 const r = {audit_status:'audited',type:'annual',checkDate:'2025-10-07'};
 assert.equal(eligibility([r],now).allowed,true);
 for(const other of [{...r,checkDate:'2025-10-06'},{...r,checkDate:'2026-10-08'},{...r,checkDate:'2026-02-30'},{...r,documentCategory:'outpatient_record'},{...r,audit_status:'pending'}]) assert.equal(eligibility([other],now).allowed,false);
});
test('logistics only inherit exact report provenance; explicit choice is retained', () => {
 const reports=[{_id:'r',type:'annual',checkDate:'2026-09-01',institution:'原机构',reportItems:[{itemId:'i',institution:'原医院'}]}];
 const raw={annual_checkup:{date:'2027-09-01'},medical_treatment:[{timingSourceId:'report:r:i'},{timingSourceId:'report:r:other'},{timingSourceId:'report:r:i',hospital:'顾问指定'}]};
 const next=inheritArrangements(raw,reports);
 assert.equal(next.annual_checkup.institution,'原机构');assert.equal(next.medical_treatment[0].hospital,'原医院');assert.equal(next.medical_treatment[1].hospital,undefined);assert.equal(next.medical_treatment[2].hospital,'顾问指定');assert.equal(raw.medical_treatment[0].hospital,undefined);
});
test('nutrition extraction is limited to explicitly nutrition-related goals', () => {
 assert.deepEqual(metricsFromTargets([{goal:'HbA1c',nutritionRelevant:false},{goal:'LDL-C、消化功能',nutritionRelevant:true}]),['消化功能','低密度脂蛋白']);
});
test('new preparation gives manager/planner thirty-day preparation and advisor seven-day design', () => {
 const patient={_id:'u',assignedHealthManager:'m',assignedHealthPlanner:'p',assignedFamilyDoctor:'a'};
 const plan={_id:'x',patientId:'u',checkupPreparationVersion:2,confirmedAt:'2026-09-01',pushedAt:'2026-09-01',reviewStatus:'approved',moduleData:{annual_checkup:{date:'2026-11-01'}}};
 const gate={allowed:true,access:{active:true},anchor:'2026-09-01'};
 assert.equal(build(plan,patient,gate,'2026-10-01').tasks.length,0);
 assert.deepEqual(build(plan,patient,gate,'2026-10-02').tasks.map(t=>t.assignedTo),['p','m']);
 assert.deepEqual(build(plan,patient,gate,'2026-10-25').tasks.map(t=>t.assignedTo),['a','p','m']);
 assert.equal(buildAnnualPlanServiceTasks(plan,patient)[0].stage,'service_supervision');
});
