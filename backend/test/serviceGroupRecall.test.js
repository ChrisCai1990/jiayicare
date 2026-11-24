const test = require('node:test');
const assert = require('node:assert/strict');
const {staffRouter} = require('../src/routes/inAppServiceGroups');
const Group = require('../src/models/InAppServiceGroup');
const User = require('../src/models/User');
const Message = require('../src/models/InAppServiceGroupMessage');
const Inbox = require('../src/models/Message');
const events = require('../src/utils/serviceGroupEvents');

const id = n => String(n).padStart(24, '0');
const query = value => ({select() {return this},sort() {return this},lean:async () => value});
const response = () => ({code:200,status(code) {this.code=code;return this},json(body) {this.body=body;return this}});

test('service group recall requires the sender and a fresh message, then removes its notification', async t => {
  const route = staffRouter.stack.find(layer => layer.route?.path === '/:groupId/messages/:messageId/recall').route.stack.at(-1).handle;
  const tenantId=id(1),groupId=id(2),patientId=id(3),senderId=id(4),otherId=id(5),messageId=id(6);
  const group={_id:groupId,tenantId,patientId,status:'active',memberIds:[senderId,otherId]};
  const patient={_id:patientId,tenantId,assignedHealthManager:senderId,assignedFamilyDoctor:otherId};
  let createdAt=new Date(Date.now()-1000),recalled=false,updates=0,notifications=0;
  const originals={groupFind:Group.findOne,groupUpdate:Group.updateOne,userFind:User.findOne,
    messageFind:Message.findOne,messageUpdate:Message.updateOne,inboxUpdate:Inbox.updateMany,lock:events.withGroupLock};
  t.after(()=>{Group.findOne=originals.groupFind;Group.updateOne=originals.groupUpdate;User.findOne=originals.userFind;
    Message.findOne=originals.messageFind;Message.updateOne=originals.messageUpdate;Inbox.updateMany=originals.inboxUpdate;events.withGroupLock=originals.lock;});
  Group.findOne=()=>query(group);
  User.findOne=()=>query(patient);
  Message.findOne=scope=>query(scope._id
    ? (!recalled && String(scope.senderId)===senderId ? {_id:messageId,createdAt} : null)
    : scope.senderType==='customer' ? null : {_id:messageId,createdAt});
  Message.updateOne=async scope=>{assert.equal(String(scope.senderId),senderId);recalled=true;updates++;return {modifiedCount:1}};
  Group.updateOne=async()=>({modifiedCount:1});
  Inbox.updateMany=async scope=>{assert.equal(scope.dedupeKey,`in-app-service-group:${messageId}`);notifications++;};
  events.withGroupLock=async(_group,_tenant,fn)=>fn(group);
  const call=async sender=>{const out=response();await route({staff:{_id:sender,tenantId,role:'healthManager'},params:{groupId,messageId}},out,error=>{throw error});return out;};
  assert.equal((await call(otherId)).code,404);
  assert.equal(updates,0);
  createdAt=new Date(Date.now()-121000);
  assert.equal((await call(senderId)).code,400);
  assert.equal(updates,0);
  createdAt=new Date(Date.now()-1000);
  assert.equal((await call(senderId)).code,200);
  assert.equal(updates,1);
  assert.equal(notifications,1);
  assert.equal((await call(senderId)).code,404);
});
