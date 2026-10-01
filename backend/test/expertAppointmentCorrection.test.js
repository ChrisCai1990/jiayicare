const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/routes/staff.js'),'utf8');
const route=source.slice(source.indexOf("router.post('/followups/:id/expert-appointment/reschedule'"),source.indexOf('// GET /api/staff/service-records?'));
async function run({role='healthManager',owner='manager',stale=false,conflict=false,status='completed'}={}){
 let handler,write,sideEffects=0;
 const order={_id:'order',user:'patient',status,updatedAt:new Date('2026-09-28'),medicalProxyPlan:{hospital:'原医院',booking:{appointmentDate:'2026-09-28',appointmentTime:'14:00',department:'原科室',appointmentExpert:'原医生'}}};
 const context={router:{post:(...args)=>handler=args.at(-1)},staffAuth:()=>{},checkPermission:()=>()=>{},User:{findById:()=>({select:()=>({lean:async()=>({assignedHealthManager:owner})})})},FollowUp:{findOne:()=>({lean:async()=>({_id:'task',sourceOrderId:'order',patientId:'patient'})}),updateOne:()=>{sideEffects++}},Order:{findOne:()=>({lean:async()=>order}),findOneAndUpdate:async(q,u)=>{write={q,u};return conflict?null:{...order,medicalProxyPlan:{...order.medicalProxyPlan,booking:{...order.medicalProxyPlan.booking}}}}},require:()=>{sideEffects++;throw Error('unexpected side effect')},Date,Message:{}};
 vm.runInNewContext(route,context);
 let code=200,result;const res={status:c=>{code=c;return res},json:d=>result=d};
 await handler({staff:{role,_id:'manager',name:'新健管'},params:{id:'task'},body:{baseUpdatedAt:stale?'old':order.updatedAt.toISOString(),appointmentDate:'2026-09-27',appointmentTime:'15:00',hospital:'新医院',campus:'新院区',department:'新科室',expert:'新医生',reason:'补记客户确认的实际预约',customerConfirmed:true,hospitalConfirmed:true}},res);
 return{code,result,write,sideEffects};
}
test('completed correction keeps full previous arrangement and actor; no task or notification effects',async()=>{const r=await run();assert.equal(r.code,200);assert.equal(r.sideEffects,0);assert.equal(r.write.q.status,'completed');const c=r.write.u.$push['medicalProxyPlan.bookingChanges'];assert.equal(c.kind,'correction');assert.equal(c.from.expert,'原医生');assert.equal(c.to.expert,'新医生');assert.equal(c.changedByName,'新健管');assert.equal(r.write.u.$set.status,undefined)});
test('ownership, stale version and concurrent update are rejected',async()=>{assert.equal((await run({owner:'other'})).code,403);assert.equal((await run({role:'nutritionist'})).code,403);assert.equal((await run({stale:true})).code,409);assert.equal((await run({conflict:true})).code,409)});
test('unfinished service cannot be rescheduled to a historical date',async()=>{const r=await run({status:'scheduled'});assert.equal(r.code,400);assert.equal(r.write,undefined)});
