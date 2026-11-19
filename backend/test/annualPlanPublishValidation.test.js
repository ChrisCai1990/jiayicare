const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../src/utils/annualPlanPublishValidation');
test('发布拒绝不完整或非法执行日期，完整方案可发布',()=>{
 const check=row=>validate({personalized_followups:{records:[row]}},'2026-10-01');
 assert.ok(check({}));assert.ok(check({followUpStaff:'s',executionDate:'2026-02-30'}));
 assert.ok(check({followUpStaff:'s',executionDate:'2026-09-30'}));
 assert.equal(check({followUpStaff:'s',executionDate:'2026-10-01'}),'');
 assert.equal(check({executionDate:'2026-10-01',collaborator:'old'}),'');
 assert.ok(validate({medical_treatment:{records:[{serviceMode:'single'}]}}));
 assert.match(validate({annual_checkup:{focus:'年度体检'}},'2026-10-01'),/年度体检日期/);
 assert.equal(validate({personalized_followups:{enabled:false,records:[{}]}}),'');
});
test('同次就诊可全部仅提醒，日期仍须一致且不会创建单项服务', () => {
 const rows = [{ items:'肺结节', time:'2026-12-03', serviceMode:'reminder', serviceType:'', visitGroupId:'同次复查' },
   { items:'甲状腺超声', time:'2026-12-03', serviceMode:'reminder', serviceType:'', visitGroupId:'同次复查' }];
 const data = { abnormal_followup: { records: rows } };
 assert.equal(validate(data, '2026-11-19'), '');
 assert.match(validate({ abnormal_followup: { records: [rows[0], { ...rows[1], time:'2026-12-04' }] } }, '2026-11-19'), /日期须一致/);
});
test('顾问新增年度体检草稿可暂存，发布前必须补齐重点项目和日期', () => {
 assert.match(validate({ annual_checkup: { enabled: true } }, '2026-11-19'), /重点关注项目和计划日期/);
 assert.equal(validate({ annual_checkup: { enabled: true, focus: '核对已确认的体检项目', date: '2027-06-01' } }, '2026-11-19'), '');
});
