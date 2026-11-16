const test=require('node:test'),assert=require('node:assert/strict'),mongoose=require('mongoose');
const {spawn}=require('node:child_process'),{mkdtempSync}=require('node:fs'),{tmpdir}=require('node:os'),path=require('node:path'),net=require('node:net');
const {migrate}=require('../scripts/migrateServiceGroupTypes');
const {staffRouter,customerRouter}=require('../src/routes/inAppServiceGroups');
const Group=require('../src/models/InAppServiceGroup'),User=require('../src/models/User'),Admin=require('../src/models/Admin'),Msg=require('../src/models/InAppServiceGroupMessage'),Inbox=require('../src/models/Message');
const oid=()=>new mongoose.Types.ObjectId();
const handler=(router,p,method)=>router.stack.find(l=>l.route?.path===p&&l.route.methods[method]).route.stack.at(-1).handle;
const res=()=>({code:200,status(v){this.code=v;return this},json(v){this.body=v;return this}});
test('history filters, pagination, permissions, context and offline recovery', {skip:!process.env.TEST_MONGOD,timeout:90000},async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'typed-group-test-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
 const server=spawn(process.env.TEST_MONGOD,['--dbpath',dir,'--bind_ip','127.0.0.1','--port',String(port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 t.after(async()=>{await mongoose.disconnect();server.kill()});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Mongo timeout')),30000);server.on('error',reject);server.stdout.on('data',d=>{if(String(d).includes('Waiting for connections')){clearTimeout(timer);resolve()}});server.stderr.resume()});
 await mongoose.connect(`mongodb://127.0.0.1:${port}/typed_groups`,{autoIndex:false,autoCreate:false});

 const tenant=oid(),patient=oid(),manager=oid(),groupId=oid();
 const staff={_id:manager,tenantId:tenant,role:'healthManager'};
 await User.collection.insertOne({_id:patient,tenantId:tenant,name:'合成客户',assignedHealthManager:manager});
 await Admin.collection.insertOne({...staff,staffStatus:'active'});
 const at=new Date('2026-11-15T16:00:00Z');
 await Group.create({_id:groupId,tenantId:tenant,patientId:patient,status:'active',memberIds:[manager],lastCustomerMessageAt:at});
 const rows=Array.from({length:125},(_,i)=>({_id:oid(),groupId,tenantId:tenant,patientId:patient,senderType:'customer',senderId:patient,senderName:'合成客户',content:i===2?'literal [test]':'记录'+i,createdAt:new Date(+at+i*1000)}));
 await Msg.collection.insertMany(rows);
 const call=async(query={},actor=staff,messageId)=>{const r=res();await handler(staffRouter,messageId?'/:groupId/history/:messageId/context':'/:groupId/history','get')({staff:actor,params:{groupId:String(groupId),messageId},query},r,e=>{throw e});return r};
 let r=await call();assert.equal(r.body.data.length,100);const first=r.body.data.map(x=>String(x.id));
 r=await call({before:String(r.body.nextBefore)});assert.equal(r.body.data.length,25);assert.ok(r.body.data.every(x=>!first.includes(String(x.id))));
 assert.equal((await call({q:'[test]'})).body.data.length,1);
 assert.equal((await call({date:'2026-11-16'})).body.data.length,100);
 assert.equal((await call({date:'2026-11-15'})).body.data.length,0);
 assert.equal((await call({end:'2026-11-15'})).body.data.length,0);
 assert.equal((await call({start:'2026-02-30'})).code,400);
 assert.equal((await call({}, {...staff,_id:oid()})).code,403);
 assert.equal((await call({}, {...staff,tenantId:oid()})).code,404);
 r=await call({},staff,String(rows[60]._id));assert.equal(r.body.data.length,41);assert.equal(String(r.body.data[20].id),String(rows[60]._id));
 assert.equal((await call({},staff,String(oid()))).code,404);
 const Report=require('../src/models/MedicalReport');
 for(const [i,mimeType] of [[0,'image/png'],[1,'application/pdf']]){
 const id=oid();await Report.collection.insertOne({_id:id,user:patient,tenantId:tenant,sourceInAppGroupId:groupId,mimeType,title:'合成资料',fileUrls:[]});
 await Msg.updateOne({_id:rows[i]._id},{$set:{materialReportId:id}});
 }
 assert.equal((await call({kind:'image'})).body.data.length,1);assert.equal((await call({kind:'file'})).body.data.length,1);
 assert.ok((await call({kind:'text'})).body.data.every(x=>!x.material));
 await Group.updateOne({_id:groupId},{$set:{status:'closed'}});assert.equal((await call()).code,200);
 const customerCall=async(user,query={},messageId)=>{const r=res();await handler(customerRouter,messageId?'/:groupId/history/:messageId/context':'/:groupId/history','get')({user,params:{groupId:String(groupId),messageId},query},r,e=>{throw e});return r};
 const customer={_id:patient,tenantId:tenant};
 assert.equal((await customerCall(customer,{date:'2026-11-16',kind:'image'})).body.data.length,1);
 assert.equal((await customerCall(customer,{},String(rows[60]._id))).body.data.length,41);
 assert.equal((await customerCall({...customer,_id:oid()})).code,403);
 assert.equal((await customerCall({...customer,tenantId:oid()})).code,404);
 // Recovery after presence expires; no model/network or real customer is used.
 const retry=require('../src/utils/serviceGroupReplyRetry'),assistant=require('../src/utils/serviceGroupAssistant');
 const old=assistant.reply;let calls=0;assistant.reply=async(g,tr)=>{calls++;await Msg.collection.insertOne({_id:oid(),groupId:g,tenantId:tenant,patientId:patient,senderType:'ai',replyTo:tr.id,createdAt:new Date()})};t.after(()=>assistant.reply=old);
 const recent=new Date(Date.now()-20000);await Msg.collection.updateMany({groupId},{$set:{createdAt:new Date(+recent-60000)}});await Msg.collection.updateOne({_id:rows[124]._id},{$set:{createdAt:recent}});
 await Group.updateOne({_id:groupId},{$set:{status:'active',lastCustomerMessageAt:recent,humanActiveUntil:new Date(Date.now()+90000)}});
 await retry.retryPendingReplies();assert.equal(calls,0);
 await Group.updateOne({_id:groupId},{$set:{humanActiveUntil:new Date(Date.now()-1)}});
 await retry.retryPendingReplies();assert.equal(calls,1);await retry.retryPendingReplies();assert.equal(calls,1);
 assert.ok((await Group.findById(groupId)).aiReplyDoneAt);
 const next=await Msg.collection.insertOne({_id:oid(),groupId,tenantId:tenant,patientId:patient,senderType:'customer',content:'新的问题',createdAt:new Date(+recent+1000)});
 await Group.updateOne({_id:groupId},{$set:{lastCustomerMessageAt:new Date(+recent+1000)}});
 assistant.reply=async()=>{calls++};
 for(let n=0;n<3;n++){await Group.updateOne({_id:groupId},{$unset:{aiReplyRetryAt:1}});await retry.retryPendingReplies();}
 assert.equal((await Group.findById(groupId)).aiReplyAttempts,3);assert.equal(calls,4);
 await retry.retryPendingReplies();assert.equal(calls,4);
 await Group.updateOne({_id:groupId},{$unset:{aiReplyDoneAt:1},$set:{lastStaffMessageAt:new Date()}});
 await retry.retryPendingReplies();assert.equal(calls,4);
 const supervisor=oid();await User.updateOne({_id:patient},{$set:{assignedFamilyDoctor:supervisor}});
 assert.equal((await call({}, {_id:supervisor,tenantId:tenant,role:'familyDoctor'})).code,200);

});
