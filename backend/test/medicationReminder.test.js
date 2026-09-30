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

function fixture() {
  const calls = [], inserted = [], removed = [];
  const med = { _id:'med', name:'测试药', dosage:'原剂量', frequency:'一日三次', timing:'餐后', reminder:{enabled:true,remindTime:'09:00'}, async save() { calls.push('save'); } };
  const FollowUp = {
    find(filter) { calls.push(filter); return { select() { return { async lean() { return filter.$or ? [{date:new Date('2026-09-30T00:00:00Z')}] : [{_id:'old'}]; } }; } }; },
    async insertMany(rows) { calls.push('insert'); inserted.push(...rows); },
    async deleteMany(filter) { calls.push('delete'); removed.push(filter); },
  };
  return { med, FollowUp, calls, inserted, removed, args: { med, FollowUp, User:{findById(){return{select:async()=>({assignedHealthManager:'manager'})}}}, patientId:'patient', staff:{_id:'staff'}, body:input, now } };
}
test('saving preserves protected occurrences and replaces only untouched old future IDs', async () => {
  const f=fixture(), result=await saveReminder(f.args);
  assert.equal(result.generated,38);
  assert.equal(f.inserted[0].assignedTo,'manager');
  assert.match(f.inserted[0].plannedContent,/原剂量，一日三次，餐后/);
  assert.ok(f.calls.indexOf('insert') < f.calls.indexOf('save') && f.calls.indexOf('save') < f.calls.indexOf('delete'));
  assert.deepEqual(f.removed[0]._id,{$in:['old']});
  assert.equal(f.removed[0].status,'planned');
  assert.deepEqual(f.removed[0].tags,{$nin:['人工跟进']});
  assert.deepEqual(f.med.reminder.remindTimes,input.remindTimes);
});
test('failed partial insertion removes only the new batch and retains old reminders', async () => {
  const f=fixture(); f.FollowUp.insertMany=async()=>{throw new Error('storage failed')};
  await assert.rejects(saveReminder(f.args),/storage failed/);
  assert.equal(f.removed.length,1); assert.match(f.removed[0].sourceScheduleKey,/^medication:/);
  assert.equal(f.med.reminder.remindTime,'09:00');
  assert.ok(!f.calls.includes('save'));
});
test('failed medication save rolls back only new batch; validation does not touch storage', async () => {
  const f=fixture(); f.med.save=async()=>{throw new Error('save failed')};
  await assert.rejects(saveReminder(f.args),/save failed/);
  assert.match(f.removed[0].sourceScheduleKey,/^medication:/);
  const invalid=fixture(); invalid.args.body={...input,remindTimes:['25:00']};
  await assert.rejects(saveReminder(invalid.args),e=>e.statusCode===400);
  assert.equal(invalid.calls.length,0);
});
test('disable works with expired or invalid form dates and retains the last configuration', async () => {
  const f=fixture(); f.args.body={enabled:false,startDate:'bad'};
  await saveReminder(f.args);
  assert.equal(f.med.reminder.enabled,false); assert.equal(f.med.reminder.remindTime,'09:00');
  assert.equal(f.inserted.length,0); assert.deepEqual(f.removed[0]._id,{$in:['old']});
});
test('concurrent save is rejected until the active save finishes', async () => {
  const f=fixture(); let release;
  f.med.save=()=>new Promise(resolve=>{release=resolve});
  const first=saveReminder(f.args);
  while(!release) await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(saveReminder(f.args),e=>e.statusCode===409);
  release(); await first;
});
test('real schemas accept and persist the multi-time configuration and customer task', async () => {
  const mongoose=require('mongoose'), Medication=require('../src/models/Medication'), FollowUp=require('../src/models/FollowUp');
  const med=new Medication({user:new mongoose.Types.ObjectId(),name:'测试药',dosage:'1粒',frequency:'一天3次',reminder:{enabled:true,remindTimes:input.remindTimes}});
  await med.validate(); assert.deepEqual(med.toObject().reminder.remindTimes,input.remindTimes);
  const row=new FollowUp({staffId:new mongoose.Types.ObjectId(),patientId:med.user,sourceId:med._id,sourceType:'medication_reminder',status:'planned',type:'other',date:now});
  await row.validate();
});
