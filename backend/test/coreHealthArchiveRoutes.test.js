const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const utility=require('../src/utils/initialArchiveReview');
function harness({scope=['patient'],matched=1}={}) {
  const handlers={},writes=[],permission=[];
  const user={_id:'patient',coreHealthArchive:{},healthProfile:{}};
  const chain={select(){return this},lean:async()=>user};
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/coreHealthArchive'),'utf8'),{module:mod,require:name=>{
    if(name==='express')return {Router:()=>({put:(path,...f)=>handlers[path]=f.at(-1),post:()=>{}})};
    if(name==='mongoose')return {isValidObjectId:id=>id==='patient'};
    if(name.endsWith('/staffAuth'))return ()=>{};
    if(name.endsWith('/checkPermission'))return (...args)=>{permission.push(args);return ()=>{}};
    if(name.endsWith('/User'))return {findById:()=>chain,collection:{updateOne:async(...args)=>{writes.push(args);return {matchedCount:matched}}}};
    if(name.endsWith('/initialArchiveReview'))return utility;
    throw Error(name);
  }});
  mod.exports({getVisiblePlanPatientIds:async()=>scope});
  async function call(role='healthManager',body={revision:0,presence:'unknown',records:[]},id='patient') {
    const res={code:200,status(c){this.code=c;return this},json(body){this.body=body}};
    await handlers['/:id/core-health-archive/:section']({params:{id,section:'family'},staff:{role,_id:'staff'},body},res);
    return res;
  }
  return {call,writes,permission};
}
test('route rejects unrelated clients, unsupported roles and invalid identifiers without writing',async()=>{
  const denied=harness({scope:[]});assert.equal((await denied.call()).code,403);assert.equal(denied.writes.length,0);
  const h=harness();assert.equal((await h.call('healthPlanner')).code,403);assert.equal((await h.call('healthManager',{},'invalid')).code,400);assert.equal(h.writes.length,0);
});
test('authorized save uses edit permission, validated mutation and reports concurrent conflicts',async()=>{
  const h=harness();assert.equal((await h.call()).code,200);assert.deepEqual(h.permission[0],['patients','edit']);assert.equal(h.writes.length,1);
  assert.equal(h.writes[0][0]['coreHealthArchive.family'],null);
  assert.equal(h.writes[0][1].$set['coreHealthArchive.family'].presence,'unknown');
  assert.equal((await harness({matched:0}).call()).code,409);
});
