const test=require('node:test'),assert=require('node:assert/strict');
const {normalize}=require('../../shared/healthDataPlan.cjs');
const config={enabled:true,id:'sample-plan-001',kind:'water',startDate:'2026-10-01',endDate:'2026-10-14',reminderDays:1,followUpDays:14,reminderTime:'20:00'};
test('separate record reminders and staff interval, validate without changing clinical frequency',()=>{
 for(const kind of ['water','medication','supplement']) {
   const result=normalize({...config,kind});assert.equal(result.reminderDays,1);assert.equal(result.followUpDays,14);
 }
 for(const change of [{endDate:'2026-09-30'},{startDate:'2026-02-30'},{followUpDays:0},{reminderDays:1.5},{kind:'other'},{reminderTime:'99:00'}])assert.throws(()=>normalize({...config,...change}));
 assert.equal(normalize({enabled:false}),null);
});
test('record reminder is active only in configured Beijing date range and interval',()=>{
 const {activeToday}=require('../src/utils/annualPlanMonitoringReminders');
 const reminder={enabled:true,startDate:new Date('2026-10-01T00:00:00+08:00'),endDate:new Date('2026-10-14T23:59:59+08:00'),customEveryNDays:2};
 assert.equal(activeToday(reminder,new Date('2026-09-30T15:59:59Z')),false);
 assert.equal(activeToday(reminder,new Date('2026-09-30T16:00:00Z')),true);
 assert.equal(activeToday(reminder,new Date('2026-10-02T12:00:00+08:00')),false);
 assert.equal(activeToday(reminder,new Date('2026-10-15T00:00:00+08:00')),false);
 assert.equal(activeToday({...reminder,enabled:false},new Date('2026-10-01')),false);
});
