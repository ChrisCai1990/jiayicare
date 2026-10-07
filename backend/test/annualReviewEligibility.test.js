const test = require('node:test');
const assert = require('node:assert/strict');
const { eligibility, examReports } = require('../src/utils/annualReviewEligibility');
const now = new Date('2026-10-07T08:00:00Z');
const split = ['血常规', '肝功能', '尿常规', '心电图', '腹部超声'].map((title,i) => ({_id:String(i), title, type:'other', audit_status:'audited', checkDate:'2026-06-01', reportItems:[{name:title}]}));
test('audited split exam batch is detected without changing legacy categories', () => {
 assert.equal(eligibility(split,now).allowed,true);
 assert.equal(eligibility(split,now).latest.date,'2026-06-01');
 assert.equal(examReports(split).length,5);
 assert.equal(eligibility(split.map(r=>({...r,documentCategory:'other_customer_material'})),now).allowed,true);
});
test('unreviewed, stale and future batches are rejected', () => {
 for(const change of [{audit_status:'pending'},{checkDate:'2025-10-06'},{checkDate:'2026-10-08'},{checkDate:'2026-02-30'}]) assert.equal(eligibility(split.map(r=>({...r,...change})),now).allowed,false);
});
test('single tests and notes do not become a physical exam', () => {
 assert.equal(eligibility([split[0]],now).allowed,false);
 assert.equal(eligibility(split.map(r=>({...r,documentCategory:'outpatient_record'})),now).allowed,false);
 assert.equal(eligibility(split.map((r,i)=>({...r,checkDate:`2026-06-0${i+1}`})),now).allowed,false);
});
test('explicit reviewed exam retains calendar twelve-month boundary', () => {
 const r={audit_status:'audited',documentCategory:'physical_exam',checkDate:'2025-10-07'};
 assert.equal(eligibility([r],now).allowed,true);
 assert.equal(eligibility([{...r,checkDate:'2025-10-06'}],now).allowed,false);
});
