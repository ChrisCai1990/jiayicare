const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const net = require('node:net');
const mongoose = require('mongoose');
for (const file of readdirSync(path.join(__dirname, '../src/models')).filter(f => f.endsWith('.js'))) require(path.join(__dirname, '../src/models', file));
const { erasePersonalData, inspectPersonalData } = require('../src/utils/accountDeletionPersonalData');
const { createService } = require('../src/utils/accountDeletionRequest');
const { issueReceipt, readReceipt } = require('../src/utils/accountDeletionReceipt');
const { financialSnapshot, sealArchive, persistVerifiedArchive, makeArchiveRepository, openArchive } = require('../src/utils/accountDeletionFinancialArchive');
const oid = () => new mongoose.Types.ObjectId();

test('isolated MongoDB deletion and retention integration', { skip: !process.env.TEST_MONGOD, timeout: 90000 }, async t => {
  const dbName = 'account_deletion_test_' + randomUUID().replaceAll('-', '');
  const directory = mkdtempSync(path.join(tmpdir(), 'account-deletion-test-'));
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const n = s.address().port; s.close(() => resolve(n)); }); });
  const server = spawn(process.env.TEST_MONGOD, ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  // There is no application/worker using this private random database. That is the
  // test's real quiescence boundary; it is NOT a production write-freeze implementation.
  let isolated = false;
  t.after(async () => { isolated = false; await mongoose.disconnect(); server.kill(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated Mongo startup timeout')), 30000);
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Mongo exited ' + code)); });
    server.stdout.on('data', data => { if (String(data).includes('Waiting for connections')) { clearTimeout(timer); resolve(); } });
    server.stderr.resume();
  });
  await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, { autoIndex: false });
  isolated = true;
  const M = mongoose.models;
  const subject = { userId: oid(), tenantId: oid() }, other = oid(), child = oid(), foreignTenant = oid();
  const ready = async () => isolated && mongoose.connection.name === dbName && mongoose.connection.host === '127.0.0.1';
  const col = name => M[name].collection;
  await col('User').insertMany([
    { _id: subject.userId, tenantId: subject.tenantId, name: 'Synthetic deleting account' },
    { _id: other, tenantId: subject.tenantId, familyLinks: [{ linkedUser: subject.userId }, { linkedUser: child }], familyInvites: [{ fromUser: subject.userId, fromName: 'Synthetic' }] },
    { _id: child, tenantId: subject.tenantId, name: 'Synthetic child' },
  ]);
  const ownReport = oid(), childReport = oid(), foreignReport = oid(), ownHealthRecord = oid();
  await col('MedicalReport').insertMany([
    { _id: ownReport, user: subject.userId, tenantId: subject.tenantId, isDeleted: true, content: 'Synthetic soft-deleted report' },
    { _id: childReport, user: child, tenantId: subject.tenantId, submittedByUser: subject.userId, uploadConsent: { accountId: subject.userId }, content: 'Child-owned synthetic report' },
    { _id: foreignReport, user: subject.userId, tenantId: foreignTenant, content: 'Foreign tenant sentinel' },
  ]);
  await col('HealthRecord').insertOne({ _id: ownHealthRecord, user: subject.userId, tenantId: subject.tenantId, type: 'weight', isDeleted: true });
  await col('ChildGuardianLink').insertMany([{ child, guardian: subject.userId }, { child, guardian: other }]);
  const group = oid();
  await col('ServiceGroup').insertOne({ _id: group, tenantId: subject.tenantId, members: [{ patientId: subject.userId }, { patientId: child }], senderBindings: [{ patientId: subject.userId, sender: 'synthetic' }, { patientId: child, sender: 'child' }] });
  await col('LoginSession').insertMany([{ user: subject.userId, sessionId: 'synthetic-deleting' }, { user: child, sessionId: 'synthetic-child' }]);
  const order = { _id: oid(), tenantId: subject.tenantId, user: child, payerUser: subject.userId, serviceName: 'Synthetic physical service', paidAmount: 12.34, status: 'completed', createdAt: new Date(), unrelatedHealth: 'Never archive this' };
  await col('Order').insertOne(order);
  await t.test('missing preflight does not mutate any records', async () => {
    await assert.rejects(erasePersonalData({ models: M, subject, assertReady: async () => false }), /prerequisites/);
    assert.ok(await col('MedicalReport').findOne({ _id: ownReport }));
  });
  const Request = M.AccountDeletionRequest;
  await col('AccountDeletionRequest').createIndex({ tenantId: 1, user: 1 }, { unique: true });
  const env = { ACCOUNT_DELETION_ENABLED: 'true', ACCOUNT_DELETION_POLICY_VERSION: 'synthetic-v1', ACCOUNT_DELETION_NOTICE: 'Synthetic integration test only', ACCOUNT_DELETION_COMPLETION_DAYS: '7', JWT_SECRET: randomBytes(32).toString('hex'), ACCOUNT_DELETION_RECEIPT_SECRET: randomBytes(32).toString('hex') };
  const service = createService({ requests: Request, env, isExecutionReady: ready });
  const actor = { _id: subject.userId, tenantId: subject.tenantId };
  const initial = await service.get(actor);
  let request;
  await t.test('database unique index makes concurrent requests idempotent', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => service.submit(actor, { confirmation: 'DELETE_MY_ACCOUNT', confirmationToken: initial.confirmationToken })));
    request = results[0];
    assert.ok(results.every(r => r.id === request.id && r.receipt.token === request.receipt.token));
    assert.equal(await col('AccountDeletionRequest').countDocuments({ user: subject.userId }), 1);
  });
  await t.test('financial snapshot persists encrypted, reads back and keeps family beneficiary/order intact', async () => {
    const key = randomBytes(32).toString('base64');
    const snapshot = financialSnapshot({ sourceType: 'Order', source: order, order, subject,
      classification: { category: 'tax_supporting_record', legalBasis: 'Synthetic retention classification only', reviewedBy: oid(), reviewedAt: new Date(), fieldsVerified: true, originalsVerified: true, retainUntil: new Date(Date.now() + 86400000) } });
    const entry = sealArchive({ snapshot, subject, requestId: new mongoose.Types.ObjectId(request.id), keyId: 'synthetic-key', encryptionKey: key });
    const Archive = M.AccountDeletionFinancialArchive;
    await col('AccountDeletionFinancialArchive').createIndex({ tenantId: 1, requestId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
    await persistVerifiedArchive({ repository: makeArchiveRepository(Archive), entry, encryptionKey: key });
    const stored = await Archive.findOne({ requestId: request.id }).select('+iv +tag +ciphertext').lean();
    assert.ok(stored.verifiedAt);
    assert.equal(openArchive(stored, key).paidAmount, 12.34);
    assert.equal(openArchive(stored, key).unrelatedHealth, undefined);
    assert.equal(String((await col('Order').findOne({ _id: order._id })).user), String(child));
    const payment = { _id: oid(), order: order._id, user: subject.userId, amount: 12.34, currency: 'CNY', status: 'paid', transactionId: 'synthetic-transaction' };
    const refund = { _id: oid(), order: order._id, payment: payment._id, user: subject.userId, amount: 2.34, totalAmount: 12.34, status: 'succeeded', refundId: 'synthetic-refund' };
    for (const [sourceType, source] of [['Payment', payment], ['Refund', refund]]) {
      await col(sourceType).insertOne(source);
      const snapshot = financialSnapshot({ sourceType, source, order, subject,
        classification: { category: 'tax_supporting_record', legalBasis: 'Synthetic classification', reviewedBy: oid(), reviewedAt: new Date(), fieldsVerified: true, originalsVerified: true, retainUntil: new Date(Date.now() + 86400000) } });
      const entry = sealArchive({ snapshot, subject, requestId: new mongoose.Types.ObjectId(request.id), keyId: 'synthetic-key', encryptionKey: key });
      await persistVerifiedArchive({ repository: makeArchiveRepository(Archive), entry, encryptionKey: key });
      const saved = await Archive.findOne({ requestId: request.id, sourceType }).select('+iv +tag +ciphertext').lean();
      assert.equal(openArchive(saved, key).amount, source.amount);
      assert.equal(openArchive(saved, key).user, undefined);
    }
    assert.equal(await Archive.countDocuments({ requestId: request.id, verifiedAt: { $ne: null } }), 3);
  });
  await t.test('actual report HTTP endpoint returns recorded numbers without automated medical assessment', async () => {
    const express = require('express'), jwt = require('jsonwebtoken');
    const priorSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = env.JWT_SECRET;
    await col('Tenant').insertOne({ _id: subject.tenantId, status: 'active', name: 'Synthetic institution' });
    await col('HealthRecord').insertMany([
      { user: subject.userId, tenantId: subject.tenantId, type: 'heartRate', value: '45', recordedAt: new Date(), isDeleted: false },
      { user: child, tenantId: subject.tenantId, type: 'heartRate', value: '99', recordedAt: new Date(), isDeleted: false },
    ]);
    const app = express(); app.use(express.json()); app.use('/api/user', require('../src/routes/user'));
    const http = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    try {
      const token = jwt.sign({ id: String(subject.userId) }, env.JWT_SECRET, { expiresIn: '5m' });
      const response = await fetch(`http://127.0.0.1:${http.address().port}/api/user/report?period=week`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      const body = await response.json(); assert.equal(body.success, true);
      assert.equal(body.data.metrics[0].value, '45'); assert.equal(body.data.recordCount, 1);
      for (const field of ['healthScore','scoreDelta','highlights','scoreBreakdown']) assert.equal(body.data[field], undefined);
      assert.equal(body.data.metrics[0].status, undefined);
    } finally {
      await new Promise(resolve => http.close(resolve));
      if (priorSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = priorSecret;
    }
  });
  await t.test('interrupted cleanup can be retried and does not claim full account completion', async () => {
    let checks = 0;
    await assert.rejects(erasePersonalData({ models: M, subject, assertReady: async () => ++checks < 12 && await ready() }), /prerequisites/);
    const result = await erasePersonalData({ models: M, subject, assertReady: ready });
    assert.equal(result.stage, 'personal-database');
    assert.ok((await inspectPersonalData({ models: M, subject })).every(r => r.count === 0));
    assert.equal((await Request.findById(request.id)).status, 'requested');
    // This stage cannot delete the account before files, residual references and backups are verified.
    assert.ok(await col('User').findOne({ _id: subject.userId }));
    assert.equal(await col('MedicalReport').findOne({ _id: ownReport }), null);
    assert.equal(await col('HealthRecord').findOne({ _id: ownHealthRecord }), null);
    assert.ok(await col('MedicalReport').findOne({ _id: foreignReport }));
    const kept = await col('MedicalReport').findOne({ _id: childReport });
    assert.equal(kept.content, 'Child-owned synthetic report');
    assert.equal(kept.submittedByUser, undefined); assert.equal(kept.uploadConsent.accountId, undefined);
    assert.equal(await col('ChildGuardianLink').countDocuments({ child }), 1);
    assert.equal((await col('User').findOne({ _id: other })).familyLinks.length, 1);
    assert.equal((await col('ServiceGroup').findOne({ _id: group })).members.length, 1);
    assert.equal(await col('LoginSession').countDocuments({ user: subject.userId }), 0);
    assert.equal(await col('LoginSession').countDocuments({ user: child }), 1);
    assert.ok(await col('Order').findOne({ _id: order._id }));
    assert.ok(await col('User').findOne({ _id: child }));
  });
  await t.test('residual audit detects retained finance and foreign references instead of declaring completion', async () => {
    const { auditResidualReferences, userReferencePaths } = require('../src/utils/accountDeletionResidualAudit');
    assert.ok(userReferencePaths(M.User.schema).includes('familyLinks.linkedUser'));
    assert.ok(userReferencePaths(M.ServiceGroup.schema).includes('members.patientId'));
    const result = await auditResidualReferences({ models: M, subject });
    assert.equal(result.clear, false);
    for (const name of ['Order', 'Payment', 'Refund', 'MedicalReport']) assert.ok(result.findings.some(r => r.model === name));
    assert.equal(result.findings.some(r => r.model === 'AccountDeletionRequest'), false);
    assert.equal(result.findings.some(r => r.model === 'ChildGuardianLink'), false);
  });
  await t.test('HTTP receipt lookup needs no account token and is never cached', async () => {
    const express = require('express');
    const previous = process.env.ACCOUNT_DELETION_RECEIPT_SECRET;
    process.env.ACCOUNT_DELETION_RECEIPT_SECRET = env.ACCOUNT_DELETION_RECEIPT_SECRET;
    const app = express(); app.use(express.json({ limit: '8kb' }));
    app.use('/api/account-deletion', require('../src/routes/accountDeletion'));
    const http = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${http.address().port}/api/account-deletion`;
      const result = await fetch(base + '/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiptToken: request.receipt.token }) });
      assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal((await result.json()).data.completedAt, null);
      assert.equal((await fetch(base)).status, 401);
      const invalid = await fetch(base + '/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiptToken: 'forged' }) });
      assert.equal(invalid.status, 404);
    } finally {
      await new Promise(resolve => http.close(resolve));
      if (previous === undefined) delete process.env.ACCOUNT_DELETION_RECEIPT_SECRET;
      else process.env.ACCOUNT_DELETION_RECEIPT_SECRET = previous;
    }
  });
  await t.test('receipt remains readable when login session is gone and remains truthful', async () => {
    const result = await readReceipt({ token: request.receipt.token, secret: env.ACCOUNT_DELETION_RECEIPT_SECRET,
      requests: { objectId: id => new mongoose.Types.ObjectId(id), findOne: q => col('AccountDeletionRequest').findOne(q) } });
    assert.equal(result.status, 'requested');
    assert.equal(result.completedAt, null);
    const stored = await Request.findById(request.id).lean();
    assert.equal(issueReceipt(stored, env.ACCOUNT_DELETION_RECEIPT_SECRET).token, request.receipt.token);
  });
});
