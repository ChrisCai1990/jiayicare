const test=require('node:test'),assert=require('node:assert/strict');
const p=require('../src/utils/managementReviewPolicy');
const user={_id:'507f1f77bcf86cd799439011',createdAt:'2026-07-09',serviceStartDate:'2026-06-01',serviceExpiry:'2027-05-31',assignedFamilyDoctor:'507f1f77bcf86cd799439012',assignedNutritionist:'507f1f77bcf86cd799439013'};
test('new flow is closed by default and only exact allowlist enables it',()=>{assert.equal(p.enabled(user._id,{}),false);assert.equal(p.enabled(user._id,{MANAGEMENT_REVIEW_MODE:'all'}),false);assert.equal(p.enabled(user._id,{MANAGEMENT_REVIEW_MODE:'allowlist',MANAGEMENT_REVIEW_PATIENT_IDS:user._id}),true);assert.equal(p.enabled('507f1f77bcf86cd799439014',{MANAGEMENT_REVIEW_MODE:'allowlist',MANAGEMENT_REVIEW_PATIENT_IDS:user._id}),false)});
test('August review is available independently of September plan confirmation; incomplete month and year blocked',()=>{const rows=p.periods(user,new Date('2026-11-05T00:00:00Z'),{MANAGEMENT_REVIEW_FIRST_MONTH:'2026-08'});assert.equal(rows[0].key,'M:2026-08');assert.equal(rows[0].due,true);assert.equal(rows.find(x=>x.key==='M:2026-11').due,false);assert.equal(rows.find(x=>x.kind==='annual').due,false);assert.equal(rows.find(x=>x.kind==='annual').end,'2027-05-31');assert.equal(rows.find(x=>x.key==='Q:2026-06-01:1').due,true);assert.equal(rows.find(x=>x.key==='Q:2026-06-01:2').due,false)});
test('end of month is not due until Shanghai next day, annual due at service end',()=>{assert.equal(p.periods(user,new Date('2026-10-31T15:59:59Z')).find(x=>x.key==='M:2026-10').due,false);assert.equal(p.periods(user,new Date('2026-10-31T16:00:00Z')).find(x=>x.key==='M:2026-10').due,true);assert.equal(p.periods(user,new Date('2027-05-31T16:00:00Z')).find(x=>x.kind==='annual').due,true)});
test('registration must reach one calendar month; monthly partial start preserves date',()=>{const u={...user,createdAt:'2026-10-20',serviceStartDate:'2026-10-20'};assert.equal(p.periods(u,new Date('2026-11-05')).some(x=>x.due),false);assert.equal(p.periods(u,new Date('2026-11-21'))[0].start,'2026-10-20')});
test('only assigned professional can submit; admin may review but not impersonate',()=>{assert.equal(p.assigned(user,{role:'nutritionist',_id:user.assignedNutritionist}),true);assert.equal(p.assigned(user,{role:'nutritionist',_id:user.assignedFamilyDoctor}),false);assert.equal(p.assigned(user,{role:'superadmin',_id:user.assignedNutritionist},'nutritionist'),false);assert.equal(p.advisor(user,{role:'familyDoctor',_id:user.assignedFamilyDoctor}),true)});
test('returned role remains pending without resetting others',()=>{const r={status:'collecting',roles:['nutritionist','healthManager'],contributions:{nutritionist:{status:'submitted'},healthManager:{status:'returned'}}};assert.equal(p.pendingRole(r,'nutritionist'),false);assert.equal(p.pendingRole(r,'healthManager'),true)});

test('HTTP workflow enforces role, evidence, CAS and advisor approval',async()=>{
 const express=require('express'),User=require('../src/models/User'),Review=require('../src/models/ManagementReview');
 const ai=require('../src/utils/managementReviewAI'),originalAI=ai.generate;ai.generate=async({row})=>row;
 const originalUser=User.findOne,originalReview=Review.findOne,originalUpdate=Review.findOneAndUpdate;
 const env={mode:process.env.MANAGEMENT_REVIEW_MODE,ids:process.env.MANAGEMENT_REVIEW_PATIENT_IDS};
 process.env.MANAGEMENT_REVIEW_MODE='allowlist';process.env.MANAGEMENT_REVIEW_PATIENT_IDS=user._id;
 const u={...user,assignedHealthManager:'507f1f77bcf86cd799439014'};
 let row={_id:'507f1f77bcf86cd799439015',patientId:user._id,periodKey:'M:2026-08',kind:'monthly',status:'collecting',roles:['nutritionist','healthManager'],contributions:{},__v:0,actions:[]};
 User.findOne=()=>({lean:async()=>u});Review.findOne=()=>({lean:async()=>structuredClone(row)});
 Review.findOneAndUpdate=async(filter,update)=>{if(filter.__v!==row.__v||filter.status!==row.status)return null;Object.assign(row,update.$set);row.__v++;return {...structuredClone(row),toObject:()=>structuredClone(row)}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{const role=req.headers['x-role'];req.staff={role,_id:role==='superadmin'?'507f1f77bcf86cd799439099':u[p.fields[role]]};next()});app.use(require('../src/routes/managementReviews').router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(action,role,body)=>fetch(`http://127.0.0.1:${server.address().port}/patients/${u._id}/management-reviews/${row._id}/${action}`,{method:'POST',headers:{'content-type':'application/json','x-role':role},body:JSON.stringify({revision:row.__v,...body})});
 try {
  const prep=async(role,key)=>fetch(`http://127.0.0.1:${server.address().port}/patients/${u._id}/management-reviews/prepare`,{method:'POST',headers:{'content-type':'application/json','x-role':role},body:JSON.stringify({periodKey:key})});
  assert.equal((await prep('nutritionist','Q:2026-06-01:1')).status,403);
  assert.equal((await prep('familyDoctor','M:2026-08')).status,400);
  assert.equal((await prep('familyDoctor','A:2099')).status,400);
  assert.equal((await call('finalize','familyDoctor',{summary:'ok',actions:[]})).status,409);
  assert.equal((await call('generate-draft','familyDoctor',{})).status,403);
  assert.equal((await call('generate-draft','superadmin',{})).status,403);
  const contribution={action:'复查',execution:'未完成',state:'not_done',feedback:'客户已说明原因',evidence:'合成服务记录',next:'重新安排'};
  assert.equal((await call('submit','healthManager',{contribution})).status,400);
  contribution.reason='预约冲突';contribution.impact='缺少复查结果';
  assert.equal((await call('submit','superadmin',{role:'nutritionist',contribution})).status,403);
  assert.equal((await call('submit','nutritionist',{contribution})).status,200);
  assert.equal((await call('submit','healthManager',{revision:0,contribution})).status,409);
  assert.equal((await call('submit','healthManager',{contribution})).status,200);assert.equal(row.status,'advisor_review');
  assert.equal((await call('finalize','nutritionist',{summary:'ok',actions:[]})).status,403);
  assert.equal((await call('return','familyDoctor',{role:'nutritionist',note:'补充来源'})).status,200);assert.equal(row.contributions.healthManager.status,'submitted');
  assert.equal((await call('submit','nutritionist',{contribution})).status,200);
  assert.equal((await call('finalize','familyDoctor',{summary:'真实审核结论',actions:[]})).status,200);assert.equal(row.status,'finalized');
  assert.equal((await call('submit','nutritionist',{contribution})).status,409);
 }finally{server.close();ai.generate=originalAI;User.findOne=originalUser;Review.findOne=originalReview;Review.findOneAndUpdate=originalUpdate;for(const [key,value]of [['MANAGEMENT_REVIEW_MODE',env.mode],['MANAGEMENT_REVIEW_PATIENT_IDS',env.ids]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
