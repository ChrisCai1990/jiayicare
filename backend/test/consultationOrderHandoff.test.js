const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const utils=require('../src/utils/serviceIntake');
const src=fs.readFileSync(require.resolve('../src/routes/visitorLeads'),'utf8');
const start=src.indexOf('    const row = await load(req), body = req.body;');
const end=src.indexOf('  }));',start);
async function run(row,body){
 let write,result;
 await vm.runInNewContext(`(async()=>{${src.slice(start,end)}})()`,{
  req:{body,staff:{_id:'planner'}},load:async()=>row,scope:()=>({tenantId:null}),
  ...utils,normalizeText:s=>s,mongoose:{isValidObjectId:()=>true},
  Order:{findOne:()=>({lean:async()=>({_id:'order',status:'pending',paymentStatus:'pending'})})},
  Plan:{},Intake:{findOneAndUpdate:(filter,update)=>{write={filter,update};return {lean:async()=>({...row,...update.$set})}}},
  details:async(_,r)=>r,res:{json:r=>{result=r}},
 });return {write,result};
}
test('link atomically closes consultation with order association and event, without a followup date',async()=>{
 const {write,result}=await run({_id:'intake',patientId:'patient',status:'open',revision:2},{action:'link',orderId:'order',note:'已确认购买',revision:2});
 assert.equal(write.update.$set.status,'closed');assert.equal(write.update.$set.orderId,'order');
 assert.equal('nextContactAt' in write.update.$set,false);assert.equal(write.filter.revision,2);
 assert.equal(write.update.$push.events.action,'link');assert.equal(result.data.status,'closed');
});
test('legacy linked consultation cannot schedule another followup',async()=>{
 await assert.rejects(run({_id:'intake',status:'open',orderId:'order',revision:2},{action:'followup',note:'追加',revision:2}),/已关闭/);
});
