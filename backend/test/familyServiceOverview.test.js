const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {statusLabel} = require('../src/utils/familyServiceOverview');
test('family overview status labels never expose internal codes', () => {
  assert.equal(statusLabel({tradeStatus:'awaiting_payment',status:'pending'}),'待支付');
  assert.equal(statusLabel({fulfillmentStatus:'unknown_internal_code'}),'处理中');
});
test('linked family overview exposes payable order and product recommendation without private content', async () => {
  const {loadOverview} = require('../src/utils/familyServiceOverview');
  const actorId='507f1f77bcf86cd799439011', memberId='507f1f77bcf86cd799439012';
  const pushId='507f1f77bcf86cd799439013', productId='507f1f77bcf86cd799439014';
  const recommendedProductId='507f1f77bcf86cd799439015';
  const query = value => ({select(){return this;},sort(){return this;},limit(){return this;},lean(){return Promise.resolve(value);}});
  const models={
    User:{findOne: filter => query(String(filter._id)===actorId
      ? {familyLinks:[{linkedUser:memberId,relation:'配偶'}]}
      : { _id:memberId,name:'虚构家人',familyLinks:[{linkedUser:actorId}]} )},
    Order:{countDocuments:async()=>0,findOne:()=>query(null),find:filter=>query(filter.paymentStatus
      ? [{_id:'payable',user:memberId,serviceId:productId,serviceName:'虚构服务',
        status:'pending',tradeStatus:'awaiting_payment',paymentStatus:'pending',paymentExpectedAmount:88,
        pushRecordId:pushId,note:'PRIVATE_ORDER_NOTE'}] : [])},
    PushRecord:{find:()=>query([{_id:pushId,products:[{productId:recommendedProductId,name:'虚构推荐',price:88}],content:'PRIVATE_PUSH_CONTENT'}])},
  };
  const result=await loadOverview({_id:actorId,tenantId:null},memberId,models);
  assert.equal(result.pendingPayments[0].payable,true);
  assert.equal(result.pendingPayments[0].amount,88);
  assert.equal(result.recommendations[0].name,'虚构推荐');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
});
test('direct guardian can view child service overview; an unrelated adult cannot', async () => {
  const {loadOverview} = require('../src/utils/familyServiceOverview');
  const actorId='507f1f77bcf86cd799439011', childId='507f1f77bcf86cd799439012';
  const query = value => ({select(){return this;},sort(){return this;},limit(){return this;},lean(){return Promise.resolve(value);}});
  let active = true;
  const models = {
    User: {findOne: filter => query(String(filter._id) === actorId
      ? {familyLinks:[]} : {_id:childId,name:'虚构孩子',patientCategory:'child',birthDate:'2020-06-25',familyLinks:[]})},
    ChildGuardianLink: {findOne: () => query(active ? {relation:'母亲'} : null)},
    Order: {countDocuments:async()=>0,findOne:()=>query(null),find:()=>query([])},
    PushRecord: {find:()=>query([])},
  };
  const result = await loadOverview({_id:actorId,tenantId:null},childId,models);
  assert.equal(result.member.relation,'母亲');
  active = false;
  await assert.rejects(loadOverview({_id:actorId,tenantId:null},childId,models), {status:403});
});
test('family overview real HTTP and Mongo authorization and projection', {skip:process.env.METABOLIC_TEST_MONGO!=='1'}, async t => {
  const m = require('mongoose'), express = require('express'), jwt = require('jsonwebtoken');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const db = 'metabolic_test_family_'+crypto.randomBytes(6).toString('hex');
  await m.connect('mongodb://127.0.0.1:27138/'+db,{serverSelectionTimeoutMS:4000});
  const User=require('../src/models/User'), Order=require('../src/models/Order'), PushRecord=require('../src/models/PushRecord');
  const a=await User.create({name:'虚构A',phone:'19900002101'});
  const b=await User.create({name:'虚构B',phone:'19900002102',familyLinks:[{linkedUser:a._id,relation:'配偶'}]});
  const c=await User.create({name:'虚构C',phone:'19900002103'});
  await User.updateOne({_id:a._id},{$set:{familyLinks:[{linkedUser:b._id,relation:'配偶'},{linkedUser:c._id,relation:'其他'}]}});
  const common={user:b._id,serviceId:'synthetic-service',serviceName:'虚构服务',orderType:'service',status:'scheduled',tradeStatus:'paid',paymentStatus:'paid',scheduledAt:new Date(),note:'NEVER_EXPOSE_PRIVATE_NOTE',serviceRequirements:'NEVER_EXPOSE_MEDICAL_DETAILS'};
  await Order.insertMany(Array.from({length:15},()=>({...common})));
  await Order.insertMany([
    {...common,status:'cancelled'}, {...common,status:'completed'}, {...common,tradeStatus:'refunded'},
    {...common,tradeStatus:'refund_pending'}, {...common,fulfillmentStatus:'completed'},
    {...common,refundStatus:'processing'}, {...common,orderType:'product'},
    {...common,tenantId:new m.Types.ObjectId()},
  ]);
  const staffId = new m.Types.ObjectId();
  const recommendation = await PushRecord.create({staffId,patientId:b._id,type:'product',
    products:[{productId:String(new m.Types.ObjectId()),name:'虚构推荐商品',price:88}],
    content:'NEVER_EXPOSE_PUSH_CONTENT'});
  const payable = await Order.create({user:b._id,serviceId:'synthetic-payable',serviceName:'虚构待付商品',
    orderType:'product',status:'pending',tradeStatus:'awaiting_payment',paymentStatus:'pending',
    paymentExpectedAmount:88,servicePrice:88,pushRecordId:recommendation._id,note:'NEVER_EXPOSE_ORDER_NOTE'});
  const app=express();app.use(express.json());app.use('/api/user',require('../src/routes/user'));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await m.disconnect();});
  const token=jwt.sign({id:String(a._id)},process.env.JWT_SECRET);
  async function call(id,auth=true){const r=await fetch(`http://127.0.0.1:${server.address().port}/api/user/family-links/${id}/service-overview`,{headers:auth?{Authorization:'Bearer '+token}:{}});return {status:r.status,body:await r.json()};}
  await t.test('unauthenticated, invalid and one-way links are rejected',async()=>{
    assert.equal((await call(b._id,false)).status,401);
    assert.equal((await call('invalid')).status,400);
    assert.equal((await call(c._id)).status,403);
    assert.equal((await call(a._id)).status,403);
  });
  await t.test('counts all 15 active services, omits ended/refunding and cross-tenant orders',async()=>{
    const r=await call(b._id);assert.equal(r.status,200);
    assert.equal(r.body.data.service.activeCount,15);
    assert.equal(r.body.data.appointments.length,5);
    assert.equal(r.body.data.service.latestStatus,'已安排');
    assert.equal(r.body.data.appointments[0].dateLabel,'已安排');
    assert.ok(!JSON.stringify(r.body).includes('NEVER_EXPOSE'));
    assert.deepEqual(Object.keys(r.body.data).sort(),['appointments','member','pendingPayments','recommendations','service']);
    assert.deepEqual(r.body.data.pendingPayments.map(item => String(item.id)),[String(payable._id)]);
    assert.equal(r.body.data.recommendations[0].name,'虚构推荐商品');
  });
  await t.test('unlink immediately revokes overview',async()=>{
    await User.updateOne({_id:b._id},{$set:{familyLinks:[]}});
    assert.equal((await call(b._id)).status,403);
  });
  await t.test('deleted or different-tenant member is denied despite stale bilateral links',async()=>{
    await User.updateOne({_id:b._id},{$set:{familyLinks:[{linkedUser:a._id}],tenantId:new m.Types.ObjectId()}});
    assert.equal((await call(b._id)).status,403);
    await User.updateOne({_id:b._id},{$set:{tenantId:null,isDeleted:true}});
    assert.equal((await call(b._id)).status,403);
  });
});
