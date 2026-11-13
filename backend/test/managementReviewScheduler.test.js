const test=require('node:test'),assert=require('node:assert/strict');
const {missingDraftRoles,canRetry,generateMissing}=require('../src/utils/managementReviewScheduler');
test('automatic scan fills only empty roles and preserves human/AI drafts, returns and submissions',()=>{
 const row={status:'collecting',roles:['nutritionist','healthManager','rehabSpecialist','tcmDoctor'],contributions:{nutritionist:{status:'draft',action:'原有草稿'},healthManager:{status:'submitted'},rehabSpecialist:{status:'returned'}}};
 assert.deepEqual(missingDraftRoles(row),['tcmDoctor']);assert.deepEqual(missingDraftRoles({...row,status:'advisor_review'}),[]);
});
test('running generation and recent failures are not repeatedly billed',()=>{const now=new Date('2026-11-05T08:00:00Z');assert.equal(canRetry({generation:{status:'running',startedAt:now}},now),false);assert.equal(canRetry({generation:{status:'failed',at:now}},now),false);assert.equal(canRetry({generation:{status:'failed',at:'2026-11-05T01:00:00Z'}},now),true)});
test('each missing monthly draft is generated under its actual assigned professional, never advisor',async()=>{
 const row={status:'collecting',roles:['nutritionist','healthManager'],contributions:{}};
 const user={assignedNutritionist:'n',assignedHealthManager:'h',tenantId:'t'},actors={n:{_id:'n',role:'nutritionist',tenantId:'t'},h:{_id:'h',role:'healthManager',tenantId:'t'}};
 const calls=[];const result=await generateMissing({user,row,loadSource:async()=>({}),readActor:async id=>actors[id],withinActor:async(a,fn)=>fn(),generate:async args=>{calls.push([args.staff.role,args.roles,args.automatic]);return {...args.row,contributions:{...args.row.contributions,[args.roles[0]]:{status:'draft',action:'AI待审核'}}}}});
 assert.deepEqual(calls,[['nutritionist',['nutritionist'],true],['healthManager',['healthManager'],true]]);assert.equal(result.status,'collecting');assert.equal(result.contributions.healthManager.status,'draft');
 const again=await generateMissing({user,row:result,loadSource:()=>{throw Error('must not reload')},generate:()=>{throw Error('must not regenerate')}});assert.equal(again,result);
});
test('invalid assignment cannot authorize automatic AI',async()=>{
 let called=false;await assert.rejects(generateMissing({user:{tenantId:'one',assignedNutritionist:'n'},row:{status:'collecting',roles:['nutritionist']},loadSource:async()=>({}),readActor:async()=>({role:'nutritionist',tenantId:'other'}),generate:()=>{called=true},withinActor:async(a,fn)=>fn()}),/指派/);assert.equal(called,false);
});
