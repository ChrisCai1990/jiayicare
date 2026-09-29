const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { diseaseActivity } = require('../src/utils/diseaseActivity');
function harness({ scope = ['patient'], match = 1, linked = false } = {}) {
  const handlers = {}, writes = [], queries = [];
  const patient = { _id:'patient', diseaseRecords:[{_id:'d',name:'专病',serviceLinks:linked?[{key:'plan:p'}]:[]}] };
  const chain = value => ({ select() {return this}, populate() {return this}, sort(){return this}, limit(){return this}, lean:async()=>value });
  const models = {
    User:{findById:()=>chain(patient),collection:{updateOne:async(...args)=>{writes.push(args);return{matchedCount:match}}}},
    HealthPlan:{find:q=>{queries.push(q);return chain([{_id:'p',patientId:'patient',status:'active'}])}},
    ServiceRecord:{find:q=>{queries.push(q);return chain([])}}, FollowUp:{find:q=>{queries.push(q);return chain([])}},
    HealthRecord:{find:q=>{queries.push(q);return chain([])}},
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/diseaseActivity'),'utf8'),{module,require:name=>{
    if(name==='express')return{Router:()=>Object.fromEntries(['get','post'].map(method=>[method,(path,...fns)=>{handlers[method+path]=fns.at(-1)}]))};
    if(name.endsWith('/staffAuth'))return()=>{};
    if(name.endsWith('/utils/diseaseActivity'))return{diseaseActivity};
    return models[name.split('/').at(-1)];
  }});
  module.exports({getVisiblePlanPatientIds:async()=>scope});
  async function call(path,body={},role='familyDoctor'){
    const res={code:200,status(c){this.code=c;return this},json(b){this.body=b}};
    await handlers[path]({params:{id:'patient',recordId:'d'},staff:{_id:'staff',name:'顾问',role},body},res);return res;
  }
  return {call,writes,queries,patient};
}
test('activity read checks ownership and queries all sources by patient without payment filtering',async()=>{
  const denied=harness({scope:[]});assert.equal((await denied.call('get/:id/disease-activity')).code,403);assert.equal(denied.queries.length,0);
  const h=harness();const r=await h.call('get/:id/disease-activity');assert.equal(r.code,200);assert.equal(r.body.data.activities.length,1);
  assert.ok(h.queries.every(q=>q.patientId==='patient'||q.user==='patient'));assert.equal(h.writes.length,0);
});
test('linking validates role, source ownership and disease, and preserves original workflow data',async()=>{
  const path='post/:id/disease-records/:recordId/service-links';
  const h=harness();assert.equal((await h.call(path,{key:'plan:other'})).code,404);assert.equal(h.writes.length,0);
  assert.equal((await h.call(path,{key:'plan:p'},'healthManager')).code,403);
  assert.equal((await h.call(path,{key:'plan:p'})).code,200);assert.equal(h.writes.length,1);
  assert.equal(h.writes[0][0].diseaseRecords,h.patient.diseaseRecords);
  assert.equal(h.writes[0][1].$set.diseaseRecords[0].serviceLinks[0].key,'plan:p');
  assert.equal(h.patient.diseaseRecords[0].serviceLinks.length,0);
  const again=harness({linked:true});assert.equal((await again.call(path,{key:'plan:p'})).body.unchanged,true);assert.equal(again.writes.length,0);
  const race=harness({match:0});assert.equal((await race.call(path,{key:'plan:p'})).code,409);
});
