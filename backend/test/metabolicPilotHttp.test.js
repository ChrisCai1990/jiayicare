const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
// Explicitly opt in to a loopback-only, randomly named database. Never inherit MONGODB_URI.
test('pilot real Mongo/HTTP acceptance: auth, whitelist, feedback, correction, pause, help, stages', {skip:process.env.METABOLIC_TEST_MONGO!=='1'},async t=>{
  const mongoose=require('mongoose');
  const express=require('express');
  const jwt=require('jsonwebtoken');
  process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');
  const dbName='metabolic_test_'+crypto.randomBytes(6).toString('hex');
  await mongoose.connect('mongodb://127.0.0.1:27138/'+dbName,{serverSelectionTimeoutMS:4000});
  const Admin=require('../src/models/Admin'), User=require('../src/models/User'), Pilot=require('../src/models/MetabolicPilot');
  const Record=require('../src/models/HealthRecord');
  const Config=require('../src/models/SystemConfig');
  await Promise.all([Admin.init(),User.init(),Pilot.init(),Record.init(),Config.init()]);
  const pass=crypto.randomBytes(20).toString('hex');
  const manager=await Admin.create({username:'pilot-manager-'+dbName,password:pass,name:'测试健管',role:'healthManager'});
  const other=await Admin.create({username:'pilot-other-'+dbName,password:pass,name:'未分配健管',role:'healthManager'});
  const admin=await Admin.create({username:'pilot-admin-'+dbName,password:pass,name:'测试超管',role:'superadmin'});
  const outsider=await Admin.create({username:'pilot-tenant-'+dbName,password:pass,name:'其他机构',role:'superadmin',tenantId:new mongoose.Types.ObjectId()});
  const user=await User.create({name:'试点虚构用户',phone:'19900001001',assignedHealthManager:manager._id});
  const excluded=await User.create({name:'非白名单虚构用户',phone:'19900001002',assignedHealthManager:manager._id});
  const app=express(); app.use(express.json());
  app.use('/api/metabolic-pilot',require('../src/routes/metabolicPilot'));
  app.use('/api/records',require('../src/routes/healthRecords'));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await mongoose.disconnect()});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const tokens=new Map([manager,other,admin,outsider].map(a=>[String(a._id),jwt.sign({type:'admin',id:String(a._id)},process.env.JWT_SECRET)]));
  for(const u of [user,excluded])tokens.set(String(u._id),jwt.sign({id:String(u._id)},process.env.JWT_SECRET));
  async function call(actor,path,method='GET',body){
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+tokens.get(String(actor._id))}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json()};
  }
  async function action(name,body={}){return call(user,'/metabolic-pilot/me','POST',{action:name,...body})}
  await t.test('unauthorized, role and tenant isolation',async()=>{
    assert.equal((await call(null,'/metabolic-pilot/admin')).status,401);
    assert.equal((await call(manager,'/metabolic-pilot/admin')).status,403);
    assert.equal((await call(user,'/metabolic-pilot/admin')).status,403);
    assert.equal((await call(user,'/metabolic-pilot/me')).body.data.available,false);
    assert.equal((await action('start',{consent:true})).status,403);
    assert.equal((await call(outsider,'/metabolic-pilot/admin/invite','POST',{identity:String(user._id),eligibilityConfirmed:true,eligibilityNote:'虚构测试已核对'})).status,404);
  });
  await t.test('default off, explicit invitation and versioned switches',async()=>{
    const invite={identity:String(user._id),eligibilityConfirmed:true,eligibilityNote:'仅虚构测试数据，已核对适配及服务团队'};
    assert.equal((await call(admin,'/metabolic-pilot/admin/invite','POST',invite)).status,200);
    assert.equal((await call(admin,'/metabolic-pilot/admin/invite','POST',invite)).status,409);
    assert.equal((await action('start',{consent:true})).status,403);
    assert.equal((await call(admin,'/metabolic-pilot/admin/config','PUT',{enabled:true,accepting:true,revision:0})).status,200);
    assert.equal((await call(admin,'/metabolic-pilot/admin/config','PUT',{enabled:false,accepting:false,revision:0})).status,409);
    assert.equal((await action('start',{consent:false})).status,409);
    const start=await action('start',{consent:true,goal:'观察体重变化'});assert.equal(start.status,200,JSON.stringify(start));
    const before=await Pilot.findById(user._id).lean();await action('start',{consent:true});
    const after=await Pilot.findById(user._id).lean();assert.equal(+before.startedAt,+after.startedAt);
    assert.equal(+after.endsAt-+after.startedAt,84*86400000);
    assert.equal((await call(excluded,'/metabolic-pilot/me','POST',{action:'start',consent:true})).status,403);
  });
  let originalRecord;
  await t.test('record creation yields factual feedback; correction and deletion recompute',async()=>{
    const now=Date.now();
    await Pilot.updateOne({_id:user._id},{$set:{startedAt:new Date(now-7*86400000)}});
    originalRecord=await Record.create({user:user._id,type:'weight',category:'vitals',label:'体重',value:'80',unit:'kg',recordedAt:new Date(now-3*86400000)});
    const saved=await call(user,'/records','POST',{type:'weight',label:'体重',category:'vitals',value:'79',unit:'kg'});
    assert.equal(saved.status,201,JSON.stringify(saved));assert.match(saved.body.feedback.text,/减少 1 kg/);
    const excludedSave=await call(excluded,'/records','POST',{type:'weight',value:'70',unit:'kg'});
    assert.equal(excludedSave.status,201);assert.equal(excludedSave.body.feedback,null);
    assert.equal((await Record.findById(saved.body.data._id)).metabolicFeedback.version,'weight-awareness-v1');
    await call(user,'/records/'+originalRecord._id,'PUT',{value:'81',unit:'kg'});
    const summary=await call(user,'/metabolic-pilot/me');assert.equal(summary.body.data.summary.baseline,81);
    assert.match(summary.body.data.feedback.text,/减少 2 kg/);
    await call(user,'/records/'+originalRecord._id,'DELETE');
    assert.equal((await call(user,'/metabolic-pilot/me')).body.data.summary.baseline,79);
  });
  await t.test('pause does not block original record saving; resume and action choices',async()=>{
    assert.equal((await action('pause')).status,200);
    const r=await call(user,'/records','POST',{type:'weight',value:'79',unit:'kg'});assert.equal(r.status,201);assert.equal(r.body.feedback,null);
    assert.equal((await action('resume')).status,200);
    assert.equal((await action('choose',{id:'invented',choice:'try'})).status,400);
    assert.equal((await action('choose',{id:'meal-awareness',choice:'later'})).status,200);
    assert.equal((await action('preferences',{reminderEnabled:true,reminderEveryDays:3})).status,200);
    assert.equal((await action('reflect',{day:28,text:'提前复评'})).status,400);
  });
  await t.test('help goes to assigned team; duplicates and stale completion rejected',async()=>{
    assert.equal((await action('help',{message:'需要调整记录节奏'})).status,200);
    assert.equal((await action('help',{message:'重复求助'})).status,409);
    assert.equal((await call(other,'/metabolic-pilot/staff')).body.data.length,0);
    const list=await call(manager,'/metabolic-pilot/staff');assert.equal(list.body.data.length,1);
    const revision=list.body.data[0].revision;
    assert.equal((await call(other,`/metabolic-pilot/staff/${user._id}/resolve`,'POST',{reply:'越权',minutes:2,revision})).status,403);
    const close=()=>call(manager,`/metabolic-pilot/staff/${user._id}/resolve`,'POST',{reply:'已按你的意愿说明提醒设置方法',minutes:2,revision});
    const replies=await Promise.all([close(),close()]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
    const row=await Pilot.findById(user._id).lean();assert.equal(row.humanMinutes,2);
    assert.match((await call(user,'/metabolic-pilot/me')).body.data.help.reply,/提醒设置/);
  });
  await t.test('kill switch and revoked whitelist stop feedback without losing records',async()=>{
    const before=await Record.countDocuments({user:user._id});
    assert.equal((await call(admin,`/metabolic-pilot/admin/${user._id}`,'PATCH',{action:'revoke'})).status,200);
    const revoked=await call(user,'/metabolic-pilot/me');assert.equal(revoked.body.data.available,false);assert.equal(revoked.body.data.feedback,null);
    assert.equal((await action('choose',{id:'meal-awareness',choice:'try'})).status,403);
    assert.equal((await call(admin,`/metabolic-pilot/admin/${user._id}`,'PATCH',{action:'restore'})).status,200);
    assert.equal((await call(admin,'/metabolic-pilot/admin/config','PUT',{enabled:false,accepting:false,revision:1})).status,200);
    const saved=await call(user,'/records','POST',{type:'weight',value:'78',unit:'kg'});assert.equal(saved.status,201);assert.equal(saved.body.feedback,null);
    assert.equal((await action('pause')).status,403);
    assert.equal(await Record.countDocuments({user:user._id}),before+1);
    assert.equal((await call(admin,'/metabolic-pilot/admin/config','PUT',{enabled:true,accepting:false,revision:2})).status,200);
    assert.equal((await call(user,'/metabolic-pilot/me')).body.data.status,'active');
    assert.equal((await call(admin,'/metabolic-pilot/admin/config','PUT',{enabled:true,accepting:true,revision:3})).status,200);
  });
  await t.test('stages and end-of-cycle do not auto-charge or renew',async()=>{
    await Pilot.updateOne({_id:user._id},{$set:{startedAt:new Date(Date.now()-85*86400000),endsAt:new Date(Date.now()-86400000)}});
    const me=await call(user,'/metabolic-pilot/me');assert.equal(me.body.data.status,'completed');assert.equal(me.body.data.feedback,null);assert.equal(me.body.data.summary.checkpoints.length,3);
    assert.equal((await action('reflect',{day:84,text:'周期回顾测试'})).status,200);
    assert.equal((await action('start',{consent:true})).status,409);
    const recordsBefore=await Record.countDocuments({user:user._id});
    assert.equal((await action('withdraw')).status,200);assert.equal(await Record.countDocuments({user:user._id}),recordsBefore);
    assert.equal((await call(admin,`/metabolic-pilot/admin/${user._id}`,'PATCH',{action:'restore'})).status,400);
  });
  console.log('Isolated acceptance database retained:',dbName);
});
