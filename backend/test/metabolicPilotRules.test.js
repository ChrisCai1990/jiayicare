const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DAY,stateOf,canReceive,feedbackFor,summaryFor}=require('../src/utils/metabolicPilotRules');
const now=new Date('2026-09-28T04:00:00Z');
const weight=(id,value,date)=>({_id:id,type:'weight',unit:'kg',value:String(value),recordedAt:new Date(date),status:'normal'});
test('default and non-whitelisted users fail closed; expiry and pause stop feedback',()=>{
  const e={allowed:true,status:'active',endsAt:new Date(now.getTime()+DAY)};
  assert.equal(canReceive(undefined,e,now),false);
  assert.equal(canReceive({enabled:true},undefined,now),false);
  assert.equal(canReceive({enabled:true},{...e,allowed:false},now),false);
  assert.equal(canReceive({enabled:true},{...e,status:'paused'},now),false);
  assert.equal(canReceive({enabled:true},e,now),true);
  assert.equal(canReceive({enabled:true},{...e,endsAt:now},now),false);
  assert.equal(stateOf({...e,status:'paused',endsAt:now},now),'completed');
});
test('single reading and same-day readings never invent a trend',()=>{
  const r=weight('now',70,'2026-09-28T04:00:00Z');
  assert.match(feedbackFor(r,[],now).text,/没有更早日期/);
  const f=feedbackFor(r,[weight('same',90,'2026-09-28T00:00:00Z')],now);
  assert.equal(f.sourceIds.length,1);
});
test('backdated record compares only earlier valid days; ignores future and wrong units',()=>{
  const r=weight('backdated',70,'2026-09-25T04:00:00Z');
  const f=feedbackFor(r,[weight('future',68,'2026-09-28'),weight('old',71,'2026-09-24'),{...weight('jin',140,'2026-09-24T05:00:00Z'),unit:'斤'}],now);
  assert.deepEqual(f.sourceIds,['backdated','old']);assert.match(f.text,/减少 1 kg/);assert.match(f.text,/不能据此判断/);
});
test('invalid measurement is flagged; warning does not imply an automated diagnosis',()=>{
  assert.equal(feedbackFor(weight('bad','70abc',now),[],now).kind,'verify');
  const f=feedbackFor({...weight('symptom',70,now),type:'symptom'},[],now);
  assert.equal(f.action,null);assert.match(f.text,/不要等待/);
});
test('stage summaries only include data within enrollment and reflect edits/deletions',()=>{
  const e={status:'active',startedAt:new Date(now.getTime()-28*DAY),endsAt:new Date(now.getTime()+56*DAY)};
  const rows=[weight('before',95,new Date(now.getTime()-29*DAY)),weight('base',80,new Date(now.getTime()-27*DAY)),weight('latest',78,new Date(now.getTime()-DAY)),weight('future',72,new Date(now.getTime()+DAY))];
  const s=summaryFor(e,rows,now);assert.equal(s.baseline,80);assert.equal(s.latest,78);assert.equal(s.checkpoints.length,1);assert.equal(s.recordedDays,2);
  const corrected=summaryFor(e,[rows[2]],now);assert.equal(corrected.baseline,78);assert.equal(corrected.checkpoints[0].recordedDays,1);
  assert.match(corrected.checkpoints[0].note,/不足/);
});
test('84-day ending stops delivery without deleting history or pretending renewal',()=>{
  const e={allowed:true,status:'active',startedAt:new Date(now.getTime()-84*DAY),endsAt:now};
  const s=summaryFor(e,[],now);assert.equal(s.state,'completed');assert.equal(s.week,12);assert.equal(s.checkpoints.length,3);assert.equal(s.latest,null);
});
