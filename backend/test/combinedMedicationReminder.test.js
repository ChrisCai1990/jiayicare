const test=require('node:test'),assert=require('node:assert/strict');
const {groupedSlots,slotContent}=require('../../shared/combinedMedicationReminder.cjs');
const now=new Date('2026-09-30T00:00:00+08:00');
const med=(id,changes={})=>({_id:id,name:`药${id}`,dosage:'1粒',frequency:'每天3次',timing:'餐后',reminder:{enabled:true,intervalDays:1,startDate:'2026-09-30',endDate:'2026-10-12',remindTimes:['08:00','12:00','18:00']},...changes});
test('three drugs at the same times produce 39 shared slots, never 117 notifications',()=>{
 const slots=groupedSlots([med('a'),med('b'),med('c')],now);assert.equal(slots.length,39);assert.equal(slots[0].medications.length,3);
 const body=slotContent(slots[0]);for(const name of ['药a','药b','药c'])assert.ok(body.includes(name));assert.match(body,/餐后/);
});
test('different schedules, expiry, stopped drugs and disabled drugs only affect their own doses',()=>{
 const slots=groupedSlots([med('a'),med('b',{endDate:'2026-09-30'}),med('c',{stopped:true}),med('d',{active:false})],now);
 assert.equal(slots.length,39);assert.equal(slots[0].medications.length,2);assert.equal(slots[3].medications.length,1);
 const spaced=med('e');spaced.reminder={...spaced.reminder,intervalDays:2,remindTimes:['09:00']};
 assert.equal(groupedSlots([spaced],now).length,7);
});
test('next schedule advances past sent slot and returns nothing after the course',()=>{
 const slots=groupedSlots([med('a')],new Date('2026-09-30T08:00:00.001+08:00'));assert.equal(slots[0].time,'12:00');
 assert.deepEqual(groupedSlots([med('a')],new Date('2026-10-12T18:00:00.001+08:00')),[]);
});
