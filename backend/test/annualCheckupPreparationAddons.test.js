const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAddonInput, parseAddonSuggestion, suggestPreparationAddons } = require('../src/utils/checkupPreparationAddons');
const now = '2026-09-19T10:00:00.000Z';
function fixture() {
  return {
    now,
    patient: { _id: 'p', clientBrand: 'brand', name: 'not-for-prompt', phone: 'private', age: 40, healthProfile: { familyHistory: ['example'], privateNote: 'secret' } },
    plan: { _id: 'plan', preparationTaskId: 'task', patientId: 'p', type: 'annual_checkup', status: 'draft', updatedAt: now,
      items: [{ name: 'base' }], content: { aiStatus: 'pending', clientBrand: 'brand', templateId: 'tpl', checkItems: [{ name: 'base' }],
        addons: [{ name: 'base' }, { id: 'a', name: 'optional', type: 'lab' }] } },
    assessments: [{ _id: 'a', patientId: 'p', purpose: 'annual_input', status: 'approved', advisorReviewedBy: 'advisor', advisorReviewedAt: now, facts: ['reviewed fact'], recommendations: { examinations: ['example'] } }],
    reports: [{ _id: 'r', user: 'p', audit_status: 'audited', reviewRevision: 2, reportItems: [{ name: 'result', value: '1', findings: 'full finding' }] }],
  };
}
const response = (chosen = [{ index: 1, reason: 'reviewed fact', sourceKeys: ['assessment:a'] }]) => JSON.stringify({ chosen, note: 'review required' });

test('input isolates base items, copies sources and excludes contact/private data', () => {
  const data = fixture();
  const input = buildAddonInput(data);
  assert.deepEqual(input.candidates.map(row => row.index), [1]);
  assert.equal(input.sources[1].items[0].findings, 'full finding');
  assert.equal(JSON.stringify(input).includes('secret'), false);
  assert.equal(JSON.stringify(input).includes('private'), false);
  assert.equal(JSON.stringify(input).includes('not-for-prompt'), false);
  input.sources[0].facts.push('changed');
  assert.deepEqual(data.assessments[0].facts, ['reviewed fact']);
});

test('rejects invalid, published, reviewed or cross-client drafts', () => {
  for (const patch of [{ preparationTaskId: null }, { status: 'active' }, { pushedAt: now }, { patientId: 'other' }, { updatedAt: 'bad' }]) {
    const data = fixture(); Object.assign(data.plan, patch);
    assert.throws(() => buildAddonInput(data));
  }
  const data = fixture(); data.plan.content.aiStatus = 'approved';
  assert.throws(() => buildAddonInput(data));
  data.plan.content.aiStatus = 'pending'; data.patient.clientBrand = 'other';
  assert.throws(() => buildAddonInput(data));
});

test('excludes invalid assessment review, ownership, purpose and validity', () => {
  for (const patch of [{ status: 'advisor_review' }, { patientId: 'other' }, { purpose: 'unknown' }, { advisorReviewedBy: null },
    { advisorReviewedAt: 'bad' }, { advisorReviewedAt: '2027-01-01' }, { validUntil: '2026-01-01' },
    { validUntil: 'bad' }, { validFrom: '2027-01-01' }, { supersededByAssessmentId: 'next' }]) {
    const data = fixture(); Object.assign(data.assessments[0], patch);
    assert.deepEqual(buildAddonInput(data).sources.map(row => row.key), ['report:r']);
  }
});

test('does not accept unaudited or another customer report', () => {
  for (const patch of [{ audit_status: 'pending' }, { user: 'other' }]) {
    const data = fixture(); Object.assign(data.reports[0], patch);
    assert.deepEqual(buildAddonInput(data).sources.map(row => row.key), ['assessment:a']);
  }
});

test('rejects duplicate sources and oversize inputs rather than truncating evidence', () => {
  const data = fixture(); data.assessments.push(data.assessments[0]);
  assert.throws(() => buildAddonInput(data), /来源重复/);
  data.assessments.pop(); data.reports[0].reportItems[0].findings = 'x'.repeat(40001);
  assert.throws(() => buildAddonInput(data), /资料过多/);
});

test('fingerprint is deterministic and changes with evidence or plan version', () => {
  const data = fixture(); const first = buildAddonInput(data).fingerprint;
  assert.equal(buildAddonInput(data).fingerprint, first);
  data.reports[0].reviewRevision++;
  assert.notEqual(buildAddonInput(data).fingerprint, first);
  data.reports[0].reviewRevision--; data.plan.updatedAt = '2026-09-19T10:01:00Z';
  assert.notEqual(buildAddonInput(data).fingerprint, first);
});

test('only projects allowlisted item identity into a pending-review suggestion', () => {
  const input = buildAddonInput(fixture());
  const result = parseAddonSuggestion(response(), input);
  assert.equal(result.status, 'pending_review');
  assert.equal(result.chosen[0].id, 'a');
  assert.equal(result.inputFingerprint, input.fingerprint);
  assert.deepEqual(parseAddonSuggestion(response([]), input).chosen, []);
});

test('rejects out-of-range, base, noninteger, duplicate and unsupported source selections', () => {
  const input = buildAddonInput(fixture());
  const good = JSON.parse(response()).chosen[0];
  for (const patch of [{ index: 0 }, { index: 2 }, { index: '1' }, { index: 1.5 }, { reason: '' },
    { sourceKeys: [] }, { sourceKeys: ['invented'] }, { sourceKeys: ['report:r', 'report:r'] }, { name: 'injected' }]) {
    assert.throws(() => parseAddonSuggestion(response([{ ...good, ...patch }]), input));
  }
  assert.throws(() => parseAddonSuggestion(response([good, good]), input));
});

test('rejects malformed JSON, extra actions and incomplete output, never salvages fragments', () => {
  const input = buildAddonInput(fixture());
  for (const raw of ['```json\n' + response() + '\n```', response().slice(0, -1), 'null', '[]', '{"chosen":[]}',
    '{"chosen":[],"note":"","approve":true}', 'x'.repeat(16001)]) {
    assert.throws(() => parseAddonSuggestion(raw, input));
  }
});

test('skips provider call when candidates or reviewed sources are missing', async () => {
  const chat = () => { throw new Error('must not call'); };
  const data = fixture(); data.assessments = []; data.reports = [];
  assert.equal((await suggestPreparationAddons(buildAddonInput(data), chat)).status, 'skipped');
  data.plan.content.addons = [];
  assert.equal((await suggestPreparationAddons(buildAddonInput(data), chat)).status, 'skipped');
});

test('provider failures propagate without retry or invented fallback', async () => {
  let calls = 0; const error = new Error('budget blocked');
  await assert.rejects(suggestPreparationAddons(buildAddonInput(fixture()), async () => { calls++; throw error; }), error);
  assert.equal(calls, 1);
});

test('one bounded provider call returns suggestions without mutating plan', async () => {
  const data = fixture(); const before = JSON.stringify(data); let calls = 0;
  const result = await suggestPreparationAddons(buildAddonInput(data), async (messages, options) => {
    calls++; assert.equal(messages.length, 1); assert.equal(options.jsonMode, true);
    assert.equal(options.maxTokens, 2000); assert.equal(options.timeoutMs, 45000);
    assert.match(options.systemPrompt, /不得诊断/);
    return response();
  });
  assert.equal(calls, 1); assert.equal(result.status, 'pending_review');
  assert.equal(JSON.stringify(data), before);
});
