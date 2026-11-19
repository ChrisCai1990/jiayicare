const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const router = require('../src/routes/staff');
const User = require('../src/models/User');
const Message = require('../src/models/Message');
const storage = require('../src/utils/oss');
const audio = require('../src/utils/messageTranscription');
const recognition = require('../src/utils/groupAudio');

const route = router.stack.find(layer => layer.route?.path === '/user-messages/:userId/messages/:messageId/transcribe');
const handler = route.route.stack.at(-1).handle;
const id = () => String(new mongoose.Types.ObjectId());
const response = () => ({ code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });

test('one-to-one transcription checks channel and customer scope before reading audio', async t => {
  const saved = { findPatient: User.findOne, findMessage: Message.findOne, exists: Message.exists,
    update: Message.findOneAndUpdate, read: audio.readAudio, transcribe: recognition.transcribe };
  t.after(() => { User.findOne = saved.findPatient; Message.findOne = saved.findMessage;
    Message.exists = saved.exists; Message.findOneAndUpdate = saved.update;
    audio.readAudio = saved.read; recognition.transcribe = saved.transcribe; });
  const userId = id(), messageId = id(), tenantId = id();
  const request = (staff, role = 'doctor') => ({ staff, params: { userId, messageId }, body: { role } });
  const call = async req => { const res = response(); await handler(req, res); return res; };
  let reads = 0, recognitions = 0;
  audio.readAudio = async () => { reads++; return 'synthetic-audio'; };
  recognition.transcribe = async () => { recognitions++; return '测试转写'; };

  let res = await call(request({ _id: id(), tenantId, role: 'nutritionist' }));
  assert.equal(res.code, 403);
  assert.equal(reads, 0);

  User.findOne = () => ({ select: () => ({ lean: async () => null }) });
  res = await call(request({ _id: id(), tenantId, role: 'superadmin' }));
  assert.equal(res.code, 403);
  assert.equal(reads, 0);

  User.findOne = query => {
    assert.equal(String(query.tenantId), tenantId);
    return { select: () => ({ lean: async () => ({ _id: userId }) }) };
  };
  Message.findOne = query => {
    assert.equal(query.$or[0].conversationId, `${userId}_doctor`);
    return { select: () => ({ lean: async () => ({ audioUrl: 'https://synthetic.invalid/messages/audio/test.wav', audioMimeType: 'audio/wav', audioTranscript: '' }) }) };
  };
  Message.exists = async () => false;
  res = await call(request({ _id: id(), tenantId, role: 'superadmin' }));
  assert.equal(res.code, 404);
  assert.equal(reads, 1);
  assert.equal(recognitions, 0);

  Message.exists = async () => true;
  Message.findOneAndUpdate = () => ({ select: async () => ({ audioTranscript: '测试转写' }) });
  recognition.transcribe = async () => { throw Object.assign(new Error('客户未授权语音处理'), { status: 403 }); };
  res = await call(request({ _id: id(), tenantId, role: 'superadmin' }));
  assert.equal(res.code, 403);
  assert.equal(res.body.message, '客户未授权语音处理');

  recognition.transcribe = async () => { recognitions++; return '测试转写'; };
  res = await call(request({ _id: id(), tenantId, role: 'superadmin' }));
  assert.equal(res.code, 200);
  assert.equal(res.body.data.text, '测试转写');
  assert.equal(recognitions, 1);
});
