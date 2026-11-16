const test=require('node:test'),assert=require('node:assert/strict'),mongoose=require('mongoose');
const {spawn}=require('node:child_process'),{mkdtempSync}=require('node:fs'),{tmpdir}=require('node:os'),path=require('node:path'),net=require('node:net');
const {migrate}=require('../scripts/migrateServiceGroupTypes');
const {staffRouter,customerRouter}=require('../src/routes/inAppServiceGroups');
const Group=require('../src/models/InAppServiceGroup'),User=require('../src/models/User'),Admin=require('../src/models/Admin'),Msg=require('../src/models/InAppServiceGroupMessage'),Inbox=require('../src/models/Message');
const oid=()=>new mongoose.Types.ObjectId();
const handler=(router,p,method)=>router.stack.find(l=>l.route?.path===p&&l.route.methods[method]).route.stack.at(-1).handle;
const res=()=>({code:200,status(v){this.code=v;return this},json(v){this.body=v;return this}});
test('isolated Mongo: migration preserves history, four independent groups, membership and read isolation', {skip:!process.env.TEST_MONGOD,timeout:90000},async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'typed-group-test-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
 const server=spawn(process.env.TEST_MONGOD,['--dbpath',dir,'--bind_ip','127.0.0.1','--port',String(port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 t.after(async()=>{await mongoose.disconnect();server.kill()});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Mongo timeout')),30000);server.on('error',reject);server.stdout.on('data',d=>{if(String(d).includes('Waiting for connections')){clearTimeout(timer);resolve()}});server.stderr.resume()});
 await mongoose.connect(`mongodb://127.0.0.1:${port}/typed_groups`,{autoIndex:false,autoCreate:false});
 const tenant=oid(),patient=oid(),manager=oid(),advisor=oid(),nutrition=oid(),medical=oid(),specialty=oid();
 const user={_id:patient,tenantId:tenant,name:'合成客户',preferredTitle:'合成老师',gender:'女',assignedHealthManager:manager,assignedFamilyDoctor:advisor,assignedNutritionist:nutrition,assignedMedicalAssistant:medical,assignedSpecialist:specialty};
 await User.collection.insertOne(user);await Admin.collection.insertMany([manager,advisor,nutrition,medical,specialty].map(_id=>({_id,tenantId:tenant,staffStatus:'active',name:'合成员工'})));
 await Group.collection.insertOne({_id:patient,tenantId:tenant,patientId:patient,status:'active',memberIds:[advisor,manager],membershipVersion:0});
 await Group.collection.createIndex({tenantId:1,patientId:1},{unique:true});
 const oldMessage=oid();await Msg.collection.insertOne({_id:oldMessage,tenantId:tenant,patientId:patient,groupId:patient,senderType:'staff',senderId:advisor,senderName:'顾问',content:'原始记录',createdAt:new Date()});
 const migration=await migrate(mongoose.connection.db,path.join(dir,'backup'));
 assert.equal(migration.classified.advisor,1);assert.equal(String((await Msg.findById(oldMessage)).groupId),String(patient));
 const groups={};const staff={_id:manager,tenantId:tenant,role:'healthManager'};
 for(const [type,professional]of Object.entries({advisor,nutrition,medical,specialty})){
  const response=res();await handler(staffRouter,'/','post')({staff,body:{patientId:String(patient),serviceType:type,memberIds:[String(professional),String(manager)],membershipVersion:0}},response,e=>{throw e});
  assert.equal(response.code,200,JSON.stringify(response.body));groups[type]=response.body.data.id;
 }
 assert.equal(new Set(Object.values(groups).map(String)).size,4);assert.equal(await Group.countDocuments({patientId:patient}),4);
 for(const type of ['nutrition','medical','specialty']) {
   const welcome=await Msg.findOne({groupId:groups[type],eventKey:`welcome:${groups[type]}`}).lean();
   assert.ok(welcome.content.startsWith('合成老师，'), 'manual creation must load preferredTitle');
 }
 // The assigned advisor sees every group. Other professionals cannot read a
 // colleague's group merely because they are assigned to the same customer.
 for(const [id,role,visible] of [[advisor,'familyDoctor',4],[nutrition,'nutritionist',1],[medical,'medicalAssistant',1],[specialty,'specialist',1],[manager,'healthManager',4]]){
   const actor={_id:id,tenantId:tenant,role};
   const list=res();await handler(staffRouter,'/','get')({staff:actor,query:{}},list,e=>{throw e});
   assert.equal(list.body.data.length,visible,role);
   for(const [type,gid] of Object.entries(groups)){
     const read=res();await handler(staffRouter,'/:groupId/messages','get')({staff:actor,params:{groupId:String(gid)},query:{}},read,e=>{throw e});
     const allowed=role==='familyDoctor'||role==='healthManager'||String({nutrition,medical,specialty}[type])===String(id);
     assert.equal(read.code,allowed?200:403,`${role}/${type}`);
   }
 }
 const Team=require('../src/models/Team'),mentor=oid(),team=oid();
 await Team.collection.insertOne({_id:team,tenantId:tenant,mentorId:mentor,status:'active'});
 await Admin.collection.updateOne({_id:nutrition},{$set:{teamId:team}});
 const observer={_id:mentor,tenantId:tenant,role:'nutritionist',staffStatus:'active'};
 const observed=res();await handler(staffRouter,'/','get')({staff:observer,query:{}},observed,e=>{throw e});
 assert.equal(observed.body.data.length,1);assert.equal(observed.body.data[0].supervised,true);
 assert.equal(String(observed.body.data[0].id),String(groups.nutrition));
 const read=res();await handler(staffRouter,'/:groupId/messages','get')({staff:observer,params:{groupId:String(groups.nutrition)},query:{}},read,e=>{throw e});assert.equal(read.code,200);
 const write=res();await handler(staffRouter,'/:groupId/messages','post')({staff:observer,params:{groupId:String(groups.nutrition)},body:{content:'不得发送'}},write,e=>{throw e});assert.equal(write.code,403);
 const duplicate=res();await handler(staffRouter,'/','post')({staff,body:{patientId:String(patient),serviceType:'advisor',memberIds:[String(advisor),String(manager)],membershipVersion:0}},duplicate);assert.equal(duplicate.code,409);
 const denied=res();await handler(staffRouter,'/:groupId/messages','post')({staff:{_id:nutrition,tenantId:tenant,role:'nutritionist'},params:{groupId:String(groups.advisor)},body:{content:'不可发送'}},denied);assert.equal(denied.code,403);
 await Inbox.collection.insertOne({_id:oid(),user:patient,unread:true,type:'system',dedupeKey:`in-app-service-group:${oldMessage}`,action:{type:'service_group',groupId:String(groups.advisor)}});
 const nutritionRead=res();await handler(customerRouter,'/:groupId/messages','get')({user,params:{groupId:String(groups.nutrition)}},nutritionRead);assert.equal(nutritionRead.body.data.length,1);assert.equal(await Inbox.countDocuments({user:patient,unread:true,'action.groupId':String(groups.advisor)}),1);
 const advisorRead=res();await handler(customerRouter,'/:groupId/messages','get')({user,params:{groupId:String(groups.advisor)}},advisorRead);assert.equal(advisorRead.body.data[0].content,'原始记录');assert.equal(await Inbox.countDocuments({user:patient,unread:true,'action.groupId':String(groups.advisor)}),0);
 const foreign=res();await handler(customerRouter,'/:groupId/messages','get')({user:{...user,tenantId:oid()},params:{groupId:String(groups.advisor)}},foreign);assert.equal(foreign.code,404);

 const extra=Array.from({length:105},(_,i)=>({_id:oid(),tenantId:tenant,name:i===104?'搜索目标':'分页客户'+i,assignedHealthManager:manager,assignedFamilyDoctor:advisor}));
 await User.collection.insertMany(extra);
 await Group.collection.insertMany(extra.map((p,i)=>({_id:oid(),patientId:p._id,tenantId:tenant,serviceType:'advisor',memberIds:[manager,advisor],status:'active',createdAt:new Date(i===104?'2020-01-01':'2026-01-01')})));
 const searchGroups=async(actor,query)=>{const r=res();await handler(staffRouter,'/','get')({staff:actor,query},r,e=>{throw e});return r.body.data};
 const lead={_id:advisor,tenantId:tenant,role:'familyDoctor'};
 assert.equal((await searchGroups(lead,{q:'搜索目标嘉医服务群'})).length,1);
 assert.equal((await searchGroups(lead,{q:'KH-'+extra[104]._id})).length,1);
 assert.equal((await searchGroups(lead,{q:'搜索目标',serviceType:'nutrition'})).length,0);
 assert.equal((await searchGroups(lead,{q:'搜索目标',status:'closed'})).length,0);
 assert.equal((await searchGroups({_id:nutrition,tenantId:tenant,role:'nutritionist'},{q:'搜索目标'})).length,0);
 assert.equal((await searchGroups(lead,{q:'.*'})).length,0);
});
