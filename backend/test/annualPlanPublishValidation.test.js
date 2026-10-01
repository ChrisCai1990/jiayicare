const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../src/utils/annualPlanPublishValidation');
test('发布拒绝不完整或非法执行日期，完整方案可发布',()=>{
 const check=row=>validate({personalized_followups:{records:[row]}},'2026-10-01');
 assert.ok(check({}));assert.ok(check({followUpStaff:'s',executionDate:'2026-02-30'}));
 assert.ok(check({followUpStaff:'s',executionDate:'2026-09-30'}));
 assert.equal(check({followUpStaff:'s',executionDate:'2026-10-01'}),'');
 assert.ok(check({followUpStaff:'s',executionDate:'2026-10-01',collaborator:'c'}));
 assert.ok(validate({medical_treatment:{records:[{serviceMode:'single'}]}}));
 assert.equal(validate({personalized_followups:{enabled:false,records:[{}]}}),'');
});
