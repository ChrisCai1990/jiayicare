const test=require('node:test'),assert=require('node:assert/strict'),mongoose=require('mongoose');
const {spawn}=require('node:child_process'),{mkdtempSync}=require('node:fs'),{tmpdir}=require('node:os'),path=require('node:path'),net=require('node:net');
const {migrate}=require('../scripts/migrateServiceGroupTypes');
const {staffRouter,customerRouter}=require('../src/routes/inAppServiceGroups');
const Group=require('../src/models/InAppServiceGroup'),User=require('../src/models/User'),Admin=require('../src/models/Admin'),Msg=require('../src/models/InAppServiceGroupMessage'),Inbox=require('../src/models/Message');
const oid=()=>new mongoose.Types.ObjectId();
const handler=(router,p,method)=>router.stack.find(l=>l.route?.path===p&&l.route.methods[method]).route.stack.at(-1).handle;
const res=()=>({code:200,status(v){this.code=v;return this},json(v){this.body=v;return this}});
const life=require('../src/utils/serviceGroupLifecycle'), events=require('../src/utils/serviceGroupEvents');
const Plan=require('../src/models/HealthPlan'), Period=require('../src/models/AnnualServicePeriod');
test('lifecycle confirmations, mentions, archive and repurchase with tenant isolation',{skip:!process.env.TEST_MONGOD,timeout:90000},async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'typed-group-test-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
 const server=spawn(process.env.TEST_MONGOD,['--dbpath',dir,'--bind_ip','127.0.0.1','--port',String(port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 t.after(async()=>{await mongoose.disconnect();server.kill()});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Mongo timeout')),30000);server.on('error',reject);server.stdout.on('data',d=>{if(String(d).includes('Waiting for connections')){clearTimeout(timer);resolve()}});server.stderr.resume()});
 await mongoose.connect(`mongodb://127.0.0.1:${port}/group_lifecycle`,{autoIndex:false,autoCreate:false});

 const tenant=oid(),patient=oid(),manager=oid(),nutrition=oid(),outsider=oid();
 const user={_id:patient,tenantId:tenant,name:'合成客户',assignedHealthManager:manager,assignedNutritionist:nutrition};
 const staff={_id:manager,tenantId:tenant,role:'healthManager',name:'合成专员'};
 await User.collection.insertOne(user);
 await Admin.collection.insertMany([{_id:manager,name:'合成专员',role:'healthManager'},{_id:nutrition,name:'合成营养师',role:'nutritionist'}].map(p=>({...p,tenantId:tenant,staffStatus:'active'})));
 await Group.createIndexes();await Msg.createIndexes();await Inbox.createIndexes();
 const plan=oid();await Plan.collection.insertOne({_id:plan,patientId:patient,type:'nutrition',title:'合成营养服务',status:'active',pushedAt:new Date(),updatedAt:new Date()});
 let tasks=await life.list(staff);assert.equal(tasks.length,1);assert.equal(tasks[0].action,'create');
 await assert.rejects(life.confirm({...staff,_id:outsider},tasks[0]),/健管专员/);
 await assert.rejects(life.confirm(staff,{...tasks[0],version:'stale'}),/状态已变化/);
 assert.equal(await Group.countDocuments(),0);
 const result=await life.confirm(staff,tasks[0]);const gid=result.id;
 assert.equal(await Group.countDocuments(),1);assert.equal((await life.list(staff)).length,0);
 await assert.rejects(life.confirm(staff,tasks[0]),/状态已变化/);
 const welcome=await Msg.findOne({groupId:gid,eventKey:`welcome:${gid}`}).lean();
 assert.ok(welcome.content.indexOf('健管专员是您的日常')<welcome.content.indexOf('营养师负责'));
 assert.equal(welcome.mentions.length,2);assert.equal(welcome.senderType,'ai');
 const group=await Group.findById(gid).lean();await events.flushNotices(group);assert.equal(await Msg.countDocuments({eventKey:`welcome:${gid}`}),1);
 // Reject forged out-of-group IDs. Reading other groups cannot consume a mention.
 let response=res();await handler(customerRouter,'/:groupId/messages','post')({user,params:{groupId:String(gid)},body:{content:'@外人',mentionIds:[String(outsider)]}},response);assert.equal(response.code,400);
 response=res();await handler(customerRouter,'/:groupId/messages','post')({user,params:{groupId:String(gid)},body:{content:'@合成营养师 请协助',mentionIds:[String(nutrition)]}},response,e=>{throw e});assert.equal(response.code,201);
 const mention=response.body.data;assert.equal(mention.mentions[0].name,'合成营养师');
 response=res();await handler(staffRouter,'/:groupId/messages','get')({staff:{...staff,_id:nutrition,role:'nutritionist'},params:{groupId:String(gid)}},response,e=>{throw e});
 assert.ok(response.body.firstMentionMessageId);assert.ok((await Msg.findById(mention.id)).mentionReadBy.some(v=>String(v)===String(nutrition)));
 await Plan.collection.updateOne({_id:plan},{$set:{status:'completed',updatedAt:new Date()}});
 tasks=await life.list(staff);assert.equal(tasks[0].action,'archive');assert.equal(tasks[0].waitingForStaff,true);
 await assert.rejects(life.confirm(staff,tasks[0]),/核对/);
 await life.confirm(staff,{...tasks[0],checked:true,note:'合成测试：事项已核对'});
 assert.equal((await Group.findById(gid)).status,'closed');assert.ok(await Msg.exists({eventKey:`closed:${gid}`}));
 response=res();await handler(customerRouter,'/:groupId/messages','get')({user,params:{groupId:String(gid)}},response,e=>{throw e});assert.equal(response.code,200);assert.ok(response.body.data.some(m=>m.id.toString()===mention.id.toString()));
 response=res();await handler(customerRouter,'/:groupId/messages','post')({user,params:{groupId:String(gid)},body:{content:'不能发送'}},response);assert.equal(response.code,404);
 response=res();await handler(customerRouter,'/:groupId/messages','get')({user:{...user,tenantId:oid()},params:{groupId:String(gid)}},response);assert.equal(response.code,404);
 await Plan.collection.insertOne({_id:oid(),patientId:patient,type:'nutrition',title:'再次购买营养服务',status:'active',pushedAt:new Date(),updatedAt:new Date()});
 tasks=await life.list(staff);assert.equal(tasks.length,1);assert.equal(tasks[0].action,'create');
 const next=await life.confirm(staff,tasks[0]);assert.notEqual(String(next.id),String(gid));assert.equal(await Group.countDocuments(),2);
 // Staff @customer creates a targeted inbox notification.
 response=res();await handler(staffRouter,'/:groupId/messages','post')({staff,params:{groupId:String(next.id)},body:{content:'@合成客户 请查看',mentionIds:[String(patient)]}},response,e=>{throw e});assert.equal(response.code,201);assert.equal((await Inbox.findOne({'action.messageId':String(response.body.data.id)})).action.mention,true);
 // Archive history remains pageable, with strict group-bound cursors.
 const history=Array.from({length:105},(_,i)=>({_id:oid(),tenantId:tenant,patientId:patient,groupId:gid,senderType:'staff',senderId:manager,senderName:'合成专员',content:'历史'+i,createdAt:new Date(Date.now()-1000000+i*1000)}));
 await Msg.collection.insertMany(history);
 response=res();await handler(customerRouter,'/:groupId/messages','get')({user,params:{groupId:String(gid)}},response,e=>{throw e});assert.equal(response.body.hasMore,true);
 const before=response.body.data[0].id;
 response=res();await handler(customerRouter,'/:groupId/messages','get')({user,params:{groupId:String(gid)},query:{before:String(before)}},response,e=>{throw e});assert.ok(response.body.data.some(m=>m.content==='历史0'));
 const foreignMsg=await Msg.findOne({groupId:next.id});response=res();await handler(customerRouter,'/:groupId/messages','get')({user,params:{groupId:String(gid)},query:{before:String(foreignMsg._id)}},response);assert.equal(response.code,404);
 // Annual continuous renewal keeps the same active group; a gap requires archive.
 const advisor=oid(),annualPatient=oid();await Admin.collection.insertOne({_id:advisor,tenantId:tenant,staffStatus:'active',name:'顾问',role:'familyDoctor'});
 await User.collection.insertOne({_id:annualPatient,tenantId:tenant,name:'年度合成客户',assignedHealthManager:manager,assignedFamilyDoctor:advisor});
 const date=new Date();const today=new Date(+date+8*3600000).toISOString().slice(0,10);const yesterday=new Date(+date+8*3600000-86400000).toISOString().slice(0,10);
 const oldPeriod=oid(),newPeriod=oid();await Period.collection.insertMany([{_id:oldPeriod,patientId:annualPatient,activationStatus:'active',startDate:'2020-01-01',endDate:yesterday},{_id:newPeriod,patientId:annualPatient,activationStatus:'active',startDate:today,endDate:'2099-01-01'}]);
 const oldAnnual=await Group.create({tenantId:tenant,patientId:annualPatient,serviceType:'advisor',memberIds:[advisor,manager],sourceKeys:['annual:'+oldPeriod]});
 const annualTasks=(await life.list(staff)).filter(t=>String(t.patientId)===String(annualPatient));assert.equal(annualTasks.length,1);assert.equal(annualTasks[0].action,'link');
 const renewed=await life.confirm(staff,annualTasks[0]);assert.equal(String(renewed.id),String(oldAnnual._id));
 // Service extension invalidates a stale archive request.
 const current=await Plan.findOne({status:'active'}).lean();await Plan.collection.updateOne({_id:current._id},{$set:{status:'completed',updatedAt:new Date()}});
 tasks=(await life.list(staff)).filter(t=>String(t.patientId)===String(patient));await Plan.collection.updateOne({_id:current._id},{$set:{status:'active',updatedAt:new Date()}});
 await assert.rejects(life.confirm(staff,{...tasks[0],checked:true,note:'过期请求'}),/状态已变化/);
});

test('business-source rules do not use purchase names or chat text',()=>{
 const now=new Date('2026-11-14T05:00:00Z');
 assert.equal(life.normalize('annual',{_id:'x',activationStatus:'active',startDate:'2026-01-01',endDate:'2026-11-14'},now).active,true);
 assert.equal(life.normalize('annual',{_id:'x',activationStatus:'active',startDate:'2025-01-01',endDate:'2025-12-31'},now).ended,true);
 assert.equal(life.normalize('plan',{_id:'x',type:'nutrition',status:'draft',pushedAt:now},now).active,false);
 assert.equal(life.normalize('order',{_id:'x',paymentStatus:'paid',status:'pending',serviceName:'已开通'},now).active,false);
 assert.equal(life.normalize('order',{_id:'x',paymentStatus:'paid',serviceStartedAt:now,status:'scheduled'},now).active,true);
});
