const test = require('node:test');
const assert = require('node:assert/strict');
const consent = require('../src/utils/aiDataConsent');
const { createConsentCheckedCall } = require('../src/utils/aiBudget');
const replies = require('../src/utils/sourcedAssistantReply');

test('missing, stale, different-purpose and different-provider consent cannot send', async () => {
  const valid = { granted: true, version: consent.VERSION, purpose: 'assistant', provider: 'qwen' };
  for (const row of [null, { ...valid, granted: false }, { ...valid, version: 'old' }, { ...valid, purpose: 'health' }, { ...valid, provider: 'deepseek' }]) {
    await assert.rejects(consent.assertPermission('patient-a', 'assistant', 'qwen', async () => row), { code: 'AI_DATA_CONSENT_REQUIRED' });
  }
  await consent.assertPermission('patient-a', 'assistant', 'qwen', async query => { assert.equal(query.user, 'patient-a'); return valid; });
  await assert.rejects(consent.assertPermission('patient-a', 'assistant', 'deepseek', async () => valid), { code: 'AI_DATA_CONSENT_REQUIRED' });
});

test('consent is checked before reserving budget and again immediately before send', async () => {
  let permitted = false, reservations = 0, sent = 0;
  const check = async () => { if (!permitted) throw consent.consentError(); };
  const call = createConsentCheckedCall(async (_, send) => { reservations++; permitted = false; return send(); }, check);
  await assert.rejects(call({ provider: 'qwen' }, () => sent++));
  assert.equal(reservations, 0); assert.equal(sent, 0);
  permitted = true;
  await assert.rejects(call({ provider: 'qwen' }, () => sent++));
  assert.equal(reservations, 1); assert.equal(sent, 0);
});

test('concurrent patient contexts remain isolated and do not persist outside a call', async () => {
  await Promise.all(['patient-a', 'patient-b'].map(id => consent.withPersonalData(id, 'health', async () => {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(consent.currentPersonalData(), { subjectId: id, purpose: 'health' });
  })));
  assert.deepEqual(consent.currentPersonalData(), {});
});

test('medical citation cannot be attached to invented model claims or external URLs', () => {
  const answer = replies.formatReply(JSON.stringify({ kind: 'education', content: '服药即可治愈', sourceIds: ['who-bmi'], references: [{ url: 'https://evil.example' }] }));
  assert.ok(answer.content.includes('身高（米）的平方'));
  assert.ok(!answer.content.includes('治愈'));
  assert.equal(answer.references.length, 1);
  assert.equal(answer.references[0].url, replies.SOURCES['who-bmi'].url);
  for (const value of [{ kind: 'education', sourceIds: ['fabricated'] }, { kind: 'medical', content: '自行加药' }, { kind: 'service', content: '建议每日服用10毫克' }, { kind: 'unknown' }]) {
    assert.deepEqual(replies.formatReply(JSON.stringify(value)), { content: replies.REFER, references: [] });
  }
  assert.equal(replies.formatReply('not JSON').content, replies.REFER);
});

test('generation pins the disclosed provider and retains source applicability', async () => {
  const answer = await replies.generate([{ role: 'user', content: '成年人每周运动量建议是多少？' }], 'test', async (messages, options) => {
    assert.equal(options.provider, 'qwen'); assert.equal(options.jsonMode, true);
    assert.equal(messages[0].content, '成年人每周运动量建议是多少？');
    return JSON.stringify({ kind: 'education', sourceIds: ['who-activity'] });
  });
  assert.equal(answer.references.length, 1);
  assert.ok(answer.references.every(row => row.applicability));
});

test('personal health questions cannot be mislabeled as social or cite an unrelated source', async () => {
  let calls = 0;
  const personal = await replies.generate([{ role: 'user', content: '我的血压最近偏高，怎么办？' }], 'test', async () => {
    calls++;
    return JSON.stringify({ kind: 'social', content: '建议多运动。' });
  });
  assert.equal(calls, 0, 'personal health question is routed without a free-form model response');
  assert.equal(personal.content, replies.REFER);
  assert.deepEqual(personal.references, []);

  const bmi = await replies.generate([{ role: 'user', content: 'BMI怎么算？' }], 'test', async (_messages, options) => {
    assert.match(options.systemPrompt, /who-bmi/);
    return JSON.stringify({ kind: 'education', sourceIds: ['who-activity'] });
  });
  assert.equal(bmi.content, replies.REFER, 'a known but unrelated source is rejected');
  assert.deepEqual(bmi.references, []);
});
