const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('../src/utils/phaseReviewScheduledService');
test('无已鉴权服务来源、跨机构或已换岗时保留原同意校验',async()=>{
 let calls=0;const generate=async()=>++calls;
 for(const request of [null,{actorId:'a',tenantId:'other'},{actorId:'old',tenantId:'t'}]){
 await run({_id:'u',tenantId:'t',assignedNutritionist:'a'},generate,{read:async()=>({templateSnapshot:{aiServiceRequest:request}}),runJob:()=>assert.fail('不应启用服务范围')});
 }assert.equal(calls,3);
});
test('已有鉴权来源仅承接同客户当前在岗服务，仍走现有机构及活跃人员校验',async()=>{
 const user={_id:'u',tenantId:'t',assignedNutritionist:'a'};
 const result=await run(user,async()=>42,{read:async id=>{assert.equal(id,'u');return {templateSnapshot:{aiServiceRequest:{actorId:'a',tenantId:'t'}}}},runJob:async(source,fn)=>{assert.equal(source.parseJob.actorId,'a');assert.equal(source.tenantId,'t');return fn()}});
 assert.equal(result,42);
});
