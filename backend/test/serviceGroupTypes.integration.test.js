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
 const user={_id:patient,tenantId:tenant,name:'合成客户',assignedHealthManager:manager,assignedFamilyDoctor:advisor,assignedNutritionist:nutrition,assignedMedicalAssistant:medical,assignedSpecialist:specialty};
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
 const duplicate=res();await handler(staffRouter,'/','post')({staff,body:{patientId:String(patient),serviceType:'advisor',memberIds:[String(advisor),String(manager)],membershipVersion:0}},duplicate);assert.equal(duplicate.code,409);
 const denied=res();await handler(staffRouter,'/:groupId/messages','post')({staff:{_id:nutrition,tenantId:tenant,role:'nutritionist'},params:{groupId:String(groups.advisor)},body:{content:'不可发送'}},denied);assert.equal(denied.code,403);
 await Inbox.collection.insertOne({_id:oid(),user:patient,unread:true,type:'system',dedupeKey:`in-app-service-group:${oldMessage}`,action:{type:'service_group',groupId:String(groups.advisor)}});
 const nutritionRead=res();await handler(customerRouter,'/:groupId/messages','get')({user,params:{groupId:String(groups.nutrition)}},nutritionRead);assert.equal(nutritionRead.body.data.length,1);assert.equal(await Inbox.countDocuments({user:patient,unread:true,'action.groupId':String(groups.advisor)}),1);
 const advisorRead=res();await handler(customerRouter,'/:groupId/messages','get')({user,params:{groupId:String(groups.advisor)}},advisorRead);assert.equal(advisorRead.body.data[0].content,'原始记录');assert.equal(await Inbox.countDocuments({user:patient,unread:true,'action.groupId':String(groups.advisor)}),0);
 const foreign=res();await handler(customerRouter,'/:groupId/messages','get')({user:{...user,tenantId:oid()},params:{groupId:String(groups.advisor)}},foreign);assert.equal(foreign.code,404);
});
