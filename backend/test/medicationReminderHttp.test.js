const test=require('node:test'), assert=require('node:assert/strict'), crypto=require('node:crypto');
test('isolated HTTP: one recurring plan, grouped notifications, toggles and one staff followup', {skip:!process.env.MEDICATION_TEST_MONGO_BIN}, async t=>{
  const {spawn}=require('node:child_process'), fs=require('node:fs'), os=require('node:os'), path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'med-reminder-test-'));
  const proc=spawn(process.env.MEDICATION_TEST_MONGO_BIN,['--dbpath',dir,'--port','27968','--bind_ip','127.0.0.1','--logpath',path.join(dir,'mongo.log')],{windowsHide:true,stdio:'ignore'});
  const mongoose=require('mongoose'), express=require('express'), jwt=require('jsonwebtoken');
  let server;
  t.after(async()=>{if(server) await new Promise(r=>server.close(r));await mongoose.disconnect();proc.kill();});
  process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');
  await mongoose.connect('mongodb://127.0.0.1:27968/med_reminder_'+crypto.randomBytes(6).toString('hex'),{serverSelectionTimeoutMS:15000});
  const Reminder=require('../src/models/Reminder'), Message=require('../src/models/Message');
  const Admin=require('../src/models/Admin'), User=require('../src/models/User'), Medication=require('../src/models/Medication'), FollowUp=require('../src/models/FollowUp');
  const staff=await Admin.create({username:'reminder_test',name:'测试健管',role:'healthManager',password:crypto.randomBytes(20).toString('hex')});
  const patient=await User.create({name:'隔离测试客户',phone:'19900007968',assignedHealthManager:staff._id});
  const med=await Medication.create({user:patient._id,staffId:staff._id,name:'隔离测试药',dosage:'1粒',frequency:'一天3次',timing:'餐后'});
  const app=express();app.use(express.json());app.use('/staff',require('../src/routes/staff'));app.use('/user',require('../src/routes/user'));app.use('/reminders',require('../src/routes/reminders'));
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});
  const st=jwt.sign({type:'admin',id:String(staff._id)},process.env.JWT_SECRET), ut=jwt.sign({id:String(patient._id)},process.env.JWT_SECRET);
  async function call(url,method,body,token=st){const res=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()}}
  const start=new Date(Date.now()+86400000).toISOString().slice(0,10), end=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  const url=`/staff/patients/${patient._id}/medications/${med._id}/reminder`, body={enabled:true,intervalDays:1,startDate:start,endDate:end,remindTimes:['08:00','12:00','18:00']};
  let r=await call(url,'PUT',body);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.generated,1);
  for(const name of ['测试药二','测试药三']) {
    const extra=await Medication.create({user:patient._id,staffId:staff._id,name,dosage:'1粒',frequency:'一天3次',timing:'餐后'});
    const response=await call(`/staff/patients/${patient._id}/medications/${extra._id}/reminder`,'PUT',body);assert.equal(response.status,200,JSON.stringify(response));
  }
  assert.equal(await Reminder.countDocuments({user:patient._id}),1);assert.equal(await FollowUp.countDocuments({patientId:patient._id}),0);
  r=await call('/reminders','GET',null,ut);assert.equal(r.status,200);assert.equal(r.body.data.length,0);
  process.env.OSS_BUCKET='attachment-test-bucket';
  const originalAttachment='https://attachment-test-bucket.oss-cn-beijing.aliyuncs.com/reports/test.png';
  await Medication.updateOne({_id:med._id},{$set:{imageUrls:[originalAttachment]}});
  const previewAttachment=`/api/staff/patients/${patient._id}/medications/${med._id}/attachments/0/preview?token=expired`;
  for(let i=0;i<2;i++) {
    const saved=await call(`/staff/patients/${patient._id}/medications/${med._id}`,'PATCH',{imageUrls:[previewAttachment]});
    assert.equal(saved.status,200,JSON.stringify(saved));assert.deepEqual(Array.from((await Medication.findById(med._id)).imageUrls),[originalAttachment]);
  }
  const scheduler=require('../src/utils/combinedMedicationReminder');
  const at=new Date(`${start}T08:00:00+08:00`);
  assert.equal(await scheduler.scanMedicationReminders(new Date(+at-1)),0);
  await Promise.all([scheduler.scanMedicationReminders(at),scheduler.scanMedicationReminders(at)]);
  assert.equal(await Message.countDocuments({user:patient._id}),1);
  const message=await Message.findOne({user:patient._id});assert.match(message.content,/测试药二/);assert.match(message.content,/测试药三/);assert.match(message.content,/餐后/);
  await scheduler.scanMedicationReminders(at);assert.equal(await Message.countDocuments({user:patient._id}),1);
  let plan=await Reminder.findOne({user:patient._id});assert.equal(plan.nextMedicationAt.toISOString(),new Date(`${start}T12:00:00+08:00`).toISOString());
  await Medication.updateOne({_id:med._id},{$set:{stopped:true}});
  await scheduler.scanMedicationReminders(new Date(`${start}T12:00:00+08:00`));
  const noon=await Message.findOne({user:patient._id,title:'12:00 用药提醒'});assert.ok(noon);assert.ok(!noon.content.includes('隔离测试药：'));assert.match(noon.content,/测试药二/);
  // Customer can toggle medication reminders without blood-pressure consent.
  r=await call(`/reminders/${plan._id}/toggle`,'PATCH',{},ut);assert.equal(r.status,200);assert.equal(r.body.data.enabled,false);
  await scheduler.scanMedicationReminders(new Date(`${start}T18:00:00+08:00`));assert.equal(await Message.countDocuments({user:patient._id}),2);
  r=await call(`/reminders/${plan._id}/toggle`,'PATCH',{},ut);assert.equal(r.status,200);assert.equal(r.body.data.enabled,true);
  // Late after outage: no old-dose messages, only advance the schedule.
  await scheduler.scanMedicationReminders(new Date(`${start}T19:00:00+08:00`));assert.equal(await Message.countDocuments({user:patient._id}),2);
  plan=await Reminder.findOne({user:patient._id});assert.ok(+plan.nextMedicationAt>+new Date(`${start}T19:00:00+08:00`));
  r=await call('/user/followup-tasks','GET',null,ut);assert.equal(r.status,200);assert.equal(r.body.data.filter(x=>x.sourceType==='medication_reminder').length,3);
  const legacy=await FollowUp.insertMany(Array.from({length:6},(_,i)=>({patientId:patient._id,staffId:staff._id,assignedTo:staff._id,sourceId:med._id,sourceType:'medication_reminder',status:'planned',date:new Date(+at+i*3600000),tags:['人工跟进']})));
  const consolidate=require('../src/utils/consolidateMedicationFollowUps').consolidateMedicationFollowUps;
  const consolidated=await consolidate(patient._id,{expectedName:patient.name,now:new Date(`${start}T19:00:00+08:00`)});assert.equal(consolidated.retired,6);
  assert.equal(await FollowUp.countDocuments({patientId:patient._id,status:'planned'}),4);
  const again=await consolidate(patient._id,{expectedName:patient.name,now:new Date(`${start}T19:00:00+08:00`)});assert.equal(String(again.staffTaskId),String(consolidated.staffTaskId));assert.equal(again.retired,0);
  r=await call('/user/followup-tasks','GET',null,ut);assert.equal(r.body.data.length,3);
  r=await call(`/user/followup-tasks/${consolidated.staffTaskId}/done`,'PATCH',{done:true},ut);assert.equal(r.status,403);
  assert.equal(await FollowUp.countDocuments({patientId:patient._id,status:'cancelled'}),6);
  const nextDay=new Date(+new Date(`${start}T00:00:00+08:00`)+86400000);
  await scheduler.scanMedicationReminders(nextDay);
  const activeDoses=await FollowUp.find({patientId:patient._id,sourceType:'medication_reminder',status:'planned'}).lean();
  const ended=await FollowUp.find({patientId:patient._id,'formData.autoEndedAt':{$exists:true}}).lean();assert.equal(ended.length,3);assert.ok(ended.every(x=>x.status==='cancelled' && x.formData.executionStatus==='unconfirmed' && !x.completedAt));
  assert.equal(activeDoses.length,3);assert.ok(activeDoses.every(x=>+x.date>=+nextDay && +x.date<+nextDay+86400000));
  assert.equal(await Message.countDocuments({user:patient._id}),2);
  await Medication.updateMany({user:patient._id},{$set:{stopped:true}});await scheduler.refreshExistingPlan(patient._id);
  plan=await Reminder.findOne({user:patient._id});assert.equal(plan.enabled,false);assert.equal(plan.nextMedicationAt,null);
});
