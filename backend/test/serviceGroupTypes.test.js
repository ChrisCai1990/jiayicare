const test=require('node:test');const assert=require('node:assert/strict');
const { TYPES,memberIdsFor,inferLegacyType,titleOf }=require('../src/utils/serviceGroupTypes');
const p={name:'测试客户',assignedHealthManager:'manager',assignedFamilyDoctor:'advisor',assignedNutritionist:'nutrition',assignedMedicalAssistant:'medical',assignedSpecialist:'specialty'};
test('四类独立群命名与成员严格对应，同一客户允许四个类型',()=>{
 for(const type of Object.keys(TYPES)){
  assert.deepEqual(memberIdsFor(p,type),[type,'manager']);
  assert.equal(titleOf({serviceType:type},p),'测试客户'+TYPES[type].suffix);
  assert.equal(inferLegacyType({memberIds:[type,'manager']},p),type);
 }
 assert.equal(inferLegacyType({memberIds:['advisor','nutrition','manager']},p),'legacy');
 assert.equal(inferLegacyType({memberIds:['old-advisor','manager']},p),'legacy');
});
test('新索引约束每类有效群唯一，不再按客户唯一',()=>{
 const schema=require('../src/models/InAppServiceGroup').schema;
 const index=schema.indexes().find(([,o])=>o.name==='one_active_service_type');
 assert.deepEqual(index[0],{tenantId:1,patientId:1,serviceType:1});assert.equal(index[1].unique,true);
 assert.deepEqual(index[1].partialFilterExpression,{status:'active'});
});
const {staffRouter}=require('../src/routes/inAppServiceGroups');
const User=require('../src/models/User'),Admin=require('../src/models/Admin'),Group=require('../src/models/InAppServiceGroup');
const mongoose=require('mongoose');const id=()=>new mongoose.Types.ObjectId();
const handler=staffRouter.stack.find(l=>l.route?.path==='/'&&l.route.methods.post).route.stack.at(-1).handle;
const response=()=>({code:200,status(v){this.code=v;return this},json(v){this.body=v;return this}});
test('建群按客户与类型查重，成员跨类型拒绝，旧页面无类型拒绝',async t=>{
 const originals=[User.findOne,Admin.find,Group.findOne,Group.findOneAndUpdate];
 t.after(()=>{[User.findOne,Admin.find,Group.findOne,Group.findOneAndUpdate]=originals;});
 const tenant=id(),patient=id(),manager=id(),advisor=id(),nutrition=id();
 const person={_id:patient,tenantId:tenant,name:'合成客户',assignedHealthManager:manager,assignedFamilyDoctor:advisor,assignedNutritionist:nutrition};
 const query=v=>({select(){return this},lean:async()=>v});
 User.findOne=()=>query(person);Admin.find=()=>query([manager,advisor,nutrition].map(_id=>({_id,tenantId:tenant,staffStatus:'active'})));
 let lookup,write;Group.findOne=q=>{lookup=q;return query(null)};
 Group.findOneAndUpdate=async(q,u)=>{write={q,u};return{_id:id(),...u.$setOnInsert,...u.$set,status:'active'}};
 const req=body=>({staff:{_id:manager,tenantId:tenant,role:'healthManager'},body:{patientId:String(patient),membershipVersion:0,...body}});
 let res=response();await handler(req({serviceType:'nutrition',memberIds:[String(manager),String(advisor)]}),res);assert.equal(res.code,400);assert.equal(write,undefined);
 res=response();await handler(req({memberIds:[String(manager),String(advisor)]}),res);assert.equal(res.code,400);
 res=response();await handler(req({serviceType:'advisor',memberIds:[String(manager),String(advisor)]}),res);assert.equal(res.code,200);assert.equal(lookup.serviceType,'advisor');assert.equal(write.q.serviceType,'advisor');assert.notEqual(String(write.u.$setOnInsert._id),String(patient));assert.equal(String(write.q.patientId),String(patient));
});
