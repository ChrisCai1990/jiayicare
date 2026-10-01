// Isolated persistence verification; never accepts a production database URL.
const assert=require('node:assert/strict'), mongoose=require('mongoose');
async function main(){
 const db=`jiayicare_healthdata_test_${require('node:crypto').randomBytes(8).toString('hex')}`;
 await mongoose.connect(`mongodb://127.0.0.1:27981/${db}`);
 try {
 const User=require('../src/models/User'),Admin=require('../src/models/Admin'),FollowUp=require('../src/models/FollowUp'),Reminder=require('../src/models/Reminder');
 const id=()=>new mongoose.Types.ObjectId(),user=id(),staff=id();
 await User.collection.insertOne({_id:user,name:'合成测试客户',assignedHealthManager:staff});
 await Admin.collection.insertOne({_id:staff,name:'测试健管',role:'healthManager'});
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
 const config={enabled:true,id:'synthetic-water-plan',kind:'water',startDate:day,endDate:'2027-12-31',reminderDays:1,followUpDays:14,reminderTime:'20:00'};
 const row={standardPlanId:'test-standard',standardPlanName:'饮水记录',executionDate:day,personalization:'合成验证内容',managementFollowUpVersion:1,healthDataPlan:config};
 const plan={_id:id(),patientId:user,createdBy:staff,confirmedAt:new Date(),moduleData:{personalized_followups:{records:[row]}}};
 const {syncAnnualPlanFollowUps:sync}=require('../src/utils/annualPlanFollowUps');
 await sync(plan);await sync(plan);
 assert.equal(await FollowUp.countDocuments({}),1);assert.equal(await Reminder.countDocuments({}),1);
 let task=await FollowUp.findOne({}).lean();
 const now=new Date();
 const {saveProgress}=require('../src/utils/followUpProgress');
 const args={FollowUp,id:task._id,actor:{_id:staff,role:'healthManager'},now,body:{requestId:'synthetic-progress-01',content:'合成沟通记录',type:'phone',updatedAt:task.updatedAt}};
 await saveProgress(args);await saveProgress(args);await sync(plan);
 task=await FollowUp.findOne({}).lean();assert.equal(task.progressRecords.length,1);assert.equal(+task.date,+now+14*86400000);
 row.healthDataPlan={...config,enabled:false};await sync(plan);
 assert.equal(await FollowUp.countDocuments({}),1);assert.equal((await FollowUp.findOne({})).status,'cancelled');assert.equal((await Reminder.findOne({})).enabled,false);
 row.healthDataPlan=config;await sync(plan);
 task=await FollowUp.findOne({}).lean();assert.equal(task.status,'planned');assert.equal(task.progressRecords.length,1);assert.equal(await FollowUp.countDocuments({}),1);
 await Reminder.updateOne({},{$set:{userDisabled:true,enabled:false}});await sync(plan);assert.equal((await Reminder.findOne({})).enabled,false);
 await FollowUp.updateOne({},{$set:{status:'completed'}});await sync(plan);assert.equal((await FollowUp.findOne({})).status,'completed');assert.equal(await FollowUp.countDocuments({}),1);
 console.log('PASS: real Mongo one task/reminder, retry, history, 14-day advance, pause/resume, user opt-out and no reopening completed tasks');
 }finally{assert.match(mongoose.connection.name,/^jiayicare_healthdata_test_[a-f0-9]+$/);await mongoose.connection.dropDatabase();await mongoose.disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;mongoose.disconnect();});
