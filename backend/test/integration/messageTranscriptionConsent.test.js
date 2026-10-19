const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { Readable } = require('stream');

test('manual transcription enforces message ownership, speech consent and revocation before send', { timeout: 30000 }, async t => {
  const uri = process.env.AI_CONSENT_TEST_MONGO;
  assert.match(uri || '', /^mongodb:\/\/127\.0\.0\.1:27993\/?$/);
  const dbName = `ai_consent_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(uri, { dbName, autoIndex: false });
  t.after(async () => { assert.equal(mongoose.connection.name, dbName); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const Message = require('../../src/models/Message');
  const Consent = require('../../src/models/AiDataConsent');
  const c = require('../../src/utils/aiDataConsent');
  const { createHandler, CONSENT_VERSION } = require('../../src/utils/messageTranscription');
  const owner = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId(), id = new mongoose.Types.ObjectId();
  await Message.collection.insertOne({ _id: id, user: owner, type: 'user', audioUrl: 'private:messages/audio/synthetic.wav', audioMimeType: 'audio/wav', audioTranscript: '', conversationId: 'synthetic' });
  let reads = 0, sends = 0, published = 0, revokeDuringRead = false;
  const handler = createHandler({ Message, visibleQuery: () => ({}), isReview: () => false,
    storage: { urlToKey: url => url.replace('private:', ''), getObjectStream: async () => {
      reads++;
      if (revokeDuringRead) await Consent.updateOne({ user: owner }, { $set: { granted: false } });
      return { stream: Readable.from([Buffer.from('synthetic-test-audio')]) };
    } },
    asr: { asrEnabled: () => true, transcribeBase64: async () => {
      sends++; assert.deepEqual(c.currentPersonalData(), { subjectId: String(owner), purpose: 'speech' });
      return 'synthetic transcript';
    } },
    publish: (_, event) => { published++; assert.equal(event.data.audioTranscriptDisplayOnly, true); assert.equal(event.data.audioUrl, undefined); },
  });
  async function call(actor, version = CONSENT_VERSION) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: String(id) }, body: { consentVersion: version }, user: { _id: actor } }, res);
    return res;
  }
  assert.equal((await call(owner, 'stale')).statusCode, 400);
  assert.equal((await call(other)).statusCode, 404);
  assert.equal((await call(owner)).statusCode, 403);
  assert.equal(reads, 0); assert.equal(sends, 0);
  await Consent.collection.insertOne({ user: owner, purpose: 'speech', provider: 'aliyun-nls', version: c.VERSION, granted: true });
  revokeDuringRead = true;
  assert.equal((await call(owner)).statusCode, 403);
  assert.equal(reads, 1); assert.equal(sends, 0);
  assert.equal((await Message.findById(id).lean()).audioTranscriptionLockToken, undefined);
  revokeDuringRead = false;
  await Consent.updateOne({ user: owner }, { $set: { granted: true } });
  const success = await call(owner);
  assert.equal(success.statusCode, 200); assert.equal(success.body.data.audioTranscriptDisplayOnly, true);
  assert.equal(sends, 1); assert.equal(published, 1);
  await Consent.updateOne({ user: owner }, { $set: { granted: false } });
  assert.equal((await call(owner)).body.data.audioTranscript, 'synthetic transcript');
  assert.equal(sends, 1, 'reading a stored transcript never sends the audio again');
  assert.equal((await call(other)).statusCode, 404);
});
