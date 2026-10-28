const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { financialSnapshot, sealArchive, openArchive, persistVerifiedArchive } = require('../src/utils/accountDeletionFinancialArchive');
const now = new Date('2026-10-27T08:00:00Z');
const subject = { userId: 'u1', tenantId: 't1' };
const order = { _id: 'order1', user: 'u1', tenantId: 't1' };
const classification = { category: 'accounting_voucher', accountingYear: 2026, legalBasis: 'Test fixture only', reviewedBy: 'admin1',
  reviewedAt: new Date('2026-10-27T07:00:00Z'), retainUntil: new Date('2057-01-01T00:00:00Z'), fieldsVerified: true, originalsVerified: true };
const source = { _id: 'pay1', order: 'order1', user: 'u1', amount: 100, channel: 'wechat_pay', status: 'succeeded',
  outTradeNo: 'synthetic-trade', payerOpenid: 'private-login-link', prepayId: 'temporary-credential',
  notifySnapshot: { secret: 'raw-private-notification' }, allocations: [{ order: 'order1', amount: 100, healthProfile: { secret: true } }],
  healthProfile: { diagnosis: 'must-not-be-copied' } };
function fixture(change = {}) {
  const snapshot = financialSnapshot({ sourceType: 'Payment', source, order, subject, classification, now, ...change });
  const encryptionKey = crypto.randomBytes(32).toString('base64');
  const entry = sealArchive({ snapshot, subject, requestId: 'request1', keyId: 'test-key', encryptionKey });
  return { snapshot, encryptionKey, entry };
}
test('archive contains only reviewed transaction fields, not unrelated medical or authentication data', () => {
  const f = fixture(); const payload = openArchive(f.entry, f.encryptionKey);
  assert.equal(payload.amount, 100);
  for (const name of ['payerOpenid', 'prepayId', 'notifySnapshot', 'healthProfile', 'user']) assert.equal(payload[name], undefined);
  assert.deepEqual(payload.allocations, [{ amount: 100, order: 'order1' }]);
  assert.equal(f.entry.ciphertext.includes('synthetic-trade'), false);
});
test('same plaintext produces different ciphertext with independently generated IVs', () => {
  const a = fixture(); const b = sealArchive({ snapshot: a.snapshot, subject, requestId: 'request1', keyId: 'test-key', encryptionKey: a.encryptionKey });
  assert.notEqual(a.entry.iv, b.iv); assert.notEqual(a.entry.ciphertext, b.ciphertext); assert.equal(a.entry.payloadHash, b.payloadHash);
});
test('another institution or unrelated user cannot archive the record', () => {
  for (const o of [{ ...order, tenantId: 't2' }, { ...order, user: 'u2' }]) assert.throws(() => fixture({ order: o }));
});
test('payer can archive their verified order without pretending to be its beneficiary', () => {
  assert.doesNotThrow(() => fixture({ order: { ...order, user: 'child1', payerUser: 'u1' } }));
});
test('unreviewed originals, unsupported classification and missing expiry fail closed', () => {
  for (const change of [{ originalsVerified: false }, { fieldsVerified: false }, { legalBasis: '' }, { retainUntil: null },
    { reviewedAt: 'not-a-date' }, { category: 'retain_everything' }]) assert.throws(() => fixture({ classification: { ...classification, ...change } }));
});
test('source association and structured field injection are rejected', () => {
  assert.throws(() => fixture({ source: { ...source, order: 'wrong-order' } }));
  assert.throws(() => fixture({ source: { ...source, amount: { healthInfo: 'private' } } }));
});
test('metadata tampering, wrong key, ciphertext tampering and checksum tampering cannot be read as valid', () => {
  const f = fixture();
  for (const change of [{ tenantId: 'other' }, { retainUntil: new Date('2099-01-01') }, { payloadHash: 'bad' }, { ciphertext: Buffer.from('broken').toString('base64') }])
    assert.throws(() => openArchive({ ...f.entry, ...change }, f.encryptionKey));
  assert.throws(() => openArchive(f.entry, crypto.randomBytes(32).toString('base64')));
});
test('missing separate encryption key fails instead of falling back to plaintext', () => {
  const f = fixture(); assert.throws(() => sealArchive({ snapshot: f.snapshot, subject, requestId: 'r', keyId: 'k', encryptionKey: '' }));
});
function storage() {
  let saved, marked = false;
  return { repository: {
    async insertOnce(scope, entry) { if (!saved) saved = structuredClone(entry); },
    async read() { return saved; },
    async markVerified() { marked = true; return true; },
  }, marked: () => marked, corrupt() { saved.ciphertext = 'broken'; } };
}
test('durable readback and checksum verification are required before marking archived', async () => {
  const f = fixture(); const db = storage();
  await persistVerifiedArchive({ ...f, repository: db.repository, now });
  assert.equal(db.marked(), true);
  await persistVerifiedArchive({ ...f, repository: db.repository, now });
});
test('missing or corrupt stored archive cannot be acknowledged as saved', async () => {
  const f = fixture();
  for (const broken of [null, { ...f.entry, ciphertext: 'broken' }, { ...f.entry, payloadHash: 'stale' }]) {
    let marked = false;
    const repository = { insertOnce: async () => {}, read: async () => broken, markVerified: async () => { marked = true; return true; } };
    await assert.rejects(persistVerifiedArchive({ ...f, repository, now })); assert.equal(marked, false);
  }
});
test('changed snapshot cannot silently overwrite an earlier archived financial record', async () => {
  const f = fixture(); const db = storage(); await persistVerifiedArchive({ ...f, repository: db.repository, now });
  const changedSnapshot = financialSnapshot({ sourceType: 'Payment', source: { ...source, amount: 200 }, order, subject, classification, now });
  const changedEntry = sealArchive({ snapshot: changedSnapshot, subject, requestId: 'request1', keyId: 'test-key', encryptionKey: f.encryptionKey });
  await assert.rejects(persistVerifiedArchive({ entry: changedEntry, encryptionKey: f.encryptionKey, repository: db.repository, now }));
});

test('confirmed transaction records can be classified as tax support without pretending to be invoices', () => {
  const f = fixture({ classification: { ...classification, category: 'tax_supporting_record' } });
  assert.equal(f.entry.category, 'tax_supporting_record');
  assert.equal(openArchive(f.entry, f.encryptionKey).moneyUnit, 'CNY_yuan');
  assert.throws(() => fixture({ source: { ...source, currency: 'USD' } }));
});


test('nested allocation/fund fields cannot hide health data in financial archives', () => {
  for (const allocations of [[{ order: { diagnosis: 'private' }, amount: 2 }], [{ order: 'order1', amount: { private: true } }], [{ order: 'order1', amount: -2 }], {}])
    assert.throws(() => fixture({ source: { ...source, allocations } }));
  assert.throws(() => fixture({ sourceType: 'Order', source: { ...order, healthFundBreakdown: { personal: { diagnosis: 'private' } } } }));
});
test('original-source fingerprint is bound to authenticated archive metadata', () => {
  const f = fixture();
  assert.match(f.entry.sourceHash, /^[a-f0-9]{64}$/);
  assert.throws(() => openArchive({ ...f.entry, sourceHash: '0'.repeat(64) }, f.encryptionKey));
});


test('voucher retention cannot be shortened and the accounting year is authenticated', () => {
  for (const change of [{accountingYear:undefined},{accountingYear:2027},{retainUntil:'2037-01-01'},{retainUntil:'2056-12-31T15:59:59.999Z'}])
    assert.throws(()=>fixture({classification:{...classification,...change}}));
  const f=fixture();assert.equal(f.entry.accountingYear,2026);
  assert.throws(()=>openArchive({...f.entry,accountingYear:2025},f.encryptionKey));
});
