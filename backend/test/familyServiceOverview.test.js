const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {statusLabel} = require('../src/utils/familyServiceOverview');
test('family overview status labels never expose internal codes', () => {
  assert.equal(statusLabel({tradeStatus:'awaiting_payment',status:'pending'}),'待支付');
  assert.equal(statusLabel({fulfillmentStatus:'unknown_internal_code'}),'处理中');
});
test('family overview real HTTP and Mongo authorization and projection', {skip:process.env.METABOLIC_TEST_MONGO!=='1'}, async t => {
  const m = require('mongoose'), express = require('express'), jwt = require('jsonwebtoken');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const db = 'metabolic_test_family_'+crypto.randomBytes(6).toString('hex');
  await m.connect('mongodb://127.0.0.1:27138/'+db,{serverSelectionTimeoutMS:4000});
  const User=require('../src/models/User'), Order=require('../src/models/Order');
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
    assert.deepEqual(Object.keys(r.body.data).sort(),['appointments','member','service']);
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
