const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../../shared/medicationReminder.cjs');
const { saveReminder } = require('../src/utils/medicationReminder');
const now = new Date('2026-09-29T16:00:00Z');
const input = { intervalDays: 1, startDate: '2026-09-30', endDate: '2026-10-12', remindTimes: ['08:00', '12:00', '18:00'] };
test('three daily doses cover the complete inclusive course in Beijing time', () => {
  const result = helpers.schedule(input, {}, now);
  assert.equal(result.dates.length, 39);
  assert.equal(result.dates[0].date.toISOString(), '2026-09-30T00:00:00.000Z');
  assert.equal(result.dates.at(-1).date.toISOString(), '2026-10-12T10:00:00.000Z');
});
test('one year of three daily doses is not silently truncated to 120', () => {
  const result = helpers.schedule({ ...input, endDate: '' }, {}, now);
  assert.equal(result.dates.length, 1095);
  assert.equal(result.endDate, '2027-09-29');
});
test('invalid time, duplicate time, malformed dates, reversed dates and excessive ranges fail', () => {
  for (const patch of [{remindTimes:[]}, {remindTimes:['24:00']}, {remindTimes:['09:60']}, {remindTimes:['09:00','09:00']}, {remindTimes:Array(7).fill('09:00')}, {startDate:'2026-02-30'}, {endDate:'2026-09-29'}, {endDate:'2030-01-01'}, {intervalDays:0}, {intervalDays:1.5}]) {
    assert.throws(() => helpers.schedule({ ...input, ...patch }, {}, now), JSON.stringify(patch));
  }
});
test('today skips elapsed doses; legacy single-time requests and medication end dates work', () => {
  const result = helpers.schedule(input, {}, new Date('2026-09-30T05:00:00Z'));
  assert.equal(result.dates.length, 37);
  assert.equal(result.dates[0].time, '18:00');
  const legacy = helpers.schedule({startDate:'2026-09-30',remindTime:'09:30'}, {endDate:'2026-10-01'}, now);
  assert.equal(legacy.dates.length, 2); assert.deepEqual(legacy.remindTimes, ['09:30']);
});
test('daily frequency suggestions preserve saved times and do not infer meal instructions', () => {
  for (const frequency of ['一日三次', '每日3次', '一天3次', '一日三餐', 'TID']) assert.equal(helpers.suggestedTimes({frequency}).length, 3);
  assert.equal(helpers.suggestedTimes({frequency:'每周三次'}).length, 1);
  assert.equal(helpers.suggestedTimes({frequency:'必要时每日三次'}).length, 1);
  assert.deepEqual(helpers.initialForm({frequency:'一天3次'}, now).remindTimes, input.remindTimes);
  assert.deepEqual(helpers.initialForm({frequency:'一天3次', reminder:{enabled:true,remindTime:'10:00',intervalDays:7}}, now).remindTimes, ['10:00']);
  assert.deepEqual(helpers.initialForm({reminder:{remindTimes:['07:00','13:00','19:00']}}, now).remindTimes, ['07:00','13:00','19:00']);
});

test('saving stores one plan, validates before writes and retires only untouched legacy tasks', async () => {
  const calls=[]; const med={_id:'med',reminder:{enabled:true},async save(){calls.push('save')}};
  const args={med,patientId:'patient',staff:{_id:'staff'},body:input,now,
    sync:async()=>{calls.push('sync');return{_id:'plan',enabled:true}},FollowUp:{async updateMany(filter,update){calls.push('retire');assert.equal(filter.status,'planned');assert.deepEqual(filter.tags,{$nin:['人工跟进']});assert.equal(update.$set.status,'cancelled')}}};
  const result=await saveReminder(args); assert.equal(result.generated,1);assert.deepEqual(calls,['save','sync','retire']);
  await assert.rejects(saveReminder({...args,body:{...input,remindTimes:['25:00']}}),e=>e.statusCode===400);assert.equal(calls.length,3);
});
test('failed synchronization restores prior medication configuration and does not retire tasks', async () => {
  let saves=0;const previous={enabled:true,remindTime:'10:00'};
  const med={_id:'med',reminder:previous,async save(){saves++}};
  await assert.rejects(saveReminder({med,patientId:'patient',staff:{_id:'staff'},body:input,now,
    sync:async()=>{throw new Error('failed')},FollowUp:{updateMany(){throw new Error('must not retire')}}}),/failed/);
  assert.equal(saves,2);assert.deepEqual(med.reminder,previous);
});
test('real schemas accept and persist the multi-time configuration and customer task', async () => {
  const mongoose=require('mongoose'), Medication=require('../src/models/Medication'), FollowUp=require('../src/models/FollowUp');
  const med=new Medication({user:new mongoose.Types.ObjectId(),name:'测试药',dosage:'1粒',frequency:'一天3次',reminder:{enabled:true,remindTimes:input.remindTimes}});
  await med.validate(); assert.deepEqual(med.toObject().reminder.remindTimes,input.remindTimes);
  const row=new FollowUp({staffId:new mongoose.Types.ObjectId(),patientId:med.user,sourceId:med._id,sourceType:'medication_reminder',status:'planned',type:'other',date:now});
  await row.validate();
});
