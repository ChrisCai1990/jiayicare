const test = require('node:test');
const assert = require('node:assert/strict');
const Message = require('../src/models/Message');
const router = require('../src/routes/staff');

test('one-to-one message recall is limited to its staff sender and two minutes', async t => {
  const handler = router.stack.find(layer => layer.route?.path === '/user-messages/:messageId/recall').route.stack.at(-1).handle;
  const original = Message.findById;
  t.after(() => { Message.findById = original; });
  const owner = '000000000000000000000001';
  const message = {_id:'000000000000000000000002',type:'manager',senderStaffId:owner,
    createdAt:new Date(Date.now()-1000),recalled:false,save:async () => { message.saved=true; }};
  Message.findById = async () => message;
  const call = async staffId => {
    const res={code:200,status(code) {this.code=code;return this},json(body) {this.body=body;return this}};
    await handler({params:{messageId:message._id},staff:{_id:staffId,role:'healthManager'}},res);
    return res;
  };
  assert.equal((await call('000000000000000000000003')).code,403);
  assert.equal(message.saved,undefined);
  message.createdAt=new Date(Date.now()-121000);
  assert.equal((await call(owner)).code,400);
  message.createdAt=new Date(Date.now()-1000);
  assert.equal((await call(owner)).code,200);
  assert.equal(message.saved,true);
  assert.equal(message.recalled,true);
});
