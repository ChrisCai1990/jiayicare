const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const Model = require('../src/models/AiCaseReview');
const { acceptSend, finishSend } = require('../src/utils/aiCaseReviewSend');

test('real Mongo send acceptance, retries and worker fencing', { skip: !process.env.TEST_MONGOD, timeout: 60000 }, async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ai-case-send-test-'));
  const port = Number(process.env.TEST_MONGO_PORT || 27941);
  const server = spawn(process.env.TEST_MONGOD, ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { await mongoose.disconnect(); server.kill(); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mongo startup timed out')), 20000);
    server.on('error', reject);
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Mongo exited ${code}`)); });
    server.stdout.on('data', chunk => { if (chunk.toString().includes('Waiting for connections')) { clearTimeout(timeout); resolve(); } });
  });
  await mongoose.connect(`mongodb://127.0.0.1:${port}/ai_case_send_${randomUUID().replaceAll('-', '')}`);
  const staff = { _id: new mongoose.Types.ObjectId(), name: 'Synthetic', role: 'familyDoctor' };
  const create = async () => {
    const topic = await Model.create({ user: new mongoose.Types.ObjectId(), title: 'Synthetic send test', createdBy: staff._id });
    return { topicId: topic._id, patientId: topic.user, staff, content: 'synthetic question', attachments: [], requestId: randomUUID() };
  };
  const good = async () => ({ result: { content: 'synthetic answer', provider: 'stub', files: [] }, snapshot: { sources: [] } });

  await t.test('simultaneous requests persist exactly one question and claim one worker', async () => {
    const input = await create();
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => acceptSend(Model, input)));
    assert.equal(outcomes.filter(item => item.status === 'fulfilled' && item.value.claimed).length, 1);
    const current = await Model.findById(input.topicId);
    assert.equal(current.messages.length, 1);
    assert.equal(current.generation.status, 'running');
    assert.equal((await acceptSend(Model, input)).claimed, false);
    await assert.rejects(acceptSend(Model, { ...input, requestId: randomUUID() }), error => error.status === 409);
  });
  await t.test('lost acknowledgement and completed replay cannot append a question or reply', async () => {
    const input = await create();
    const { topic } = await acceptSend(Model, input);
    assert.equal((await acceptSend(Model, input)).claimed, false);
    await finishSend(Model, topic, good);
    await finishSend(Model, topic, good);
    assert.equal((await acceptSend(Model, input)).claimed, false);
    const current = await Model.findById(input.topicId);
    assert.equal(current.messages.length, 2);
    assert.equal(current.generation.status, 'completed');
  });
  await t.test('AI failure is persisted; explicit retry reuses the original message', async () => {
    const input = await create();
    const first = await acceptSend(Model, input);
    await finishSend(Model, first.topic, async () => { throw new Error('synthetic timeout'); });
    const failed = await Model.findById(input.topicId);
    assert.equal(failed.generation.status, 'failed');
    assert.equal(failed.generation.error, 'synthetic timeout');
    const retry = await acceptSend(Model, input);
    assert.equal(retry.claimed, true);
    assert.equal(retry.topic.messages.length, 1);
    assert.equal(String(retry.topic.messages[0]._id), String(first.topic.messages[0]._id));
    await finishSend(Model, retry.topic, good);
    assert.equal((await Model.findById(input.topicId)).messages.length, 2);
  });
  await t.test('request identity cannot be reused for different content or sender', async () => {
    const input = await create(); await acceptSend(Model, input);
    await assert.rejects(acceptSend(Model, { ...input, content: 'changed' }), error => error.status === 409);
    await assert.rejects(acceptSend(Model, { ...input, staff: { ...staff, _id: new mongoose.Types.ObjectId() } }), error => error.status === 409);
    await assert.rejects(acceptSend(Model, { ...input, patientId: new mongoose.Types.ObjectId() }), error => error.status === 404);
  });
  await t.test('stalled worker recovery fences old results and preserves the question', async () => {
    const input = await create(); const old = await acceptSend(Model, input);
    await Model.updateOne({ _id: input.topicId }, { $set: { 'generation.startedAt': new Date(Date.now() - 301000) } });
    const retry = await acceptSend(Model, input);
    assert.equal(retry.claimed, true);
    await finishSend(Model, old.topic, good);
    assert.equal((await Model.findById(input.topicId)).messages.length, 1);
    await finishSend(Model, retry.topic, good);
    assert.equal((await Model.findById(input.topicId)).messages.length, 2);
  });
  await t.test('an edit read before acceptance cannot overwrite the new send state', async () => {
    const input = await create(); const stale = await Model.findById(input.topicId);
    await acceptSend(Model, input);
    stale.title = 'stale edit';
    await assert.rejects(stale.save(), error => error.name === 'VersionError');
  });
  await t.test('attachments-only retries normalize mongoose subdocuments', async () => {
    const input = { ...await create(), content: '', attachments: [{ name: 'synthetic.png', url: '/synthetic.png', mimeType: 'image/png' }] };
    const first = await acceptSend(Model, input);
    assert.equal((await acceptSend(Model, input)).claimed, false);
    await finishSend(Model, first.topic, async () => { throw new Error('fail'); });
    const message = first.topic.messages[0];
    const retry = await acceptSend(Model, { ...input, content: message.content, attachments: message.attachments });
    assert.equal(retry.topic.messages.length, 1);
  });
  await t.test('already-open pages without requestId can send and replay without duplicates', async () => {
    const input = await create(); delete input.requestId;
    const first = await acceptSend(Model, input);
    assert.equal(first.claimed, true);
    assert.equal((await acceptSend(Model, input)).claimed, false);
    await finishSend(Model, first.topic, good);
    assert.equal((await acceptSend(Model, input)).claimed, false);
    assert.equal((await Model.findById(input.topicId)).messages.length, 2);
    const different = await acceptSend(Model, { ...input, content: 'another question' });
    assert.equal(different.claimed, true);
    assert.equal(different.topic.messages.length, 3);
  });
  await t.test('legacy failure retry and concurrent clicks reuse the same saved question', async () => {
    const input = await create(); delete input.requestId;
    const first = await acceptSend(Model, input);
    await finishSend(Model, first.topic, async () => { throw new Error('timeout'); });
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => acceptSend(Model, input)));
    const claims = attempts.filter(item => item.status === 'fulfilled' && item.value.claimed);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].value.topic.generation.requestId, first.topic.generation.requestId);
    assert.equal((await Model.findById(input.topicId)).messages.length, 1);
    await finishSend(Model, claims[0].value.topic, good);
    assert.equal((await Model.findById(input.topicId)).messages.length, 2);
  });
});
