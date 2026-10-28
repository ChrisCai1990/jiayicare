// Internal finance stage. Only closed, solely owned transactions are eligible here.
// Shared/unfinished transactions require an explicit operational resolution, never forfeiture.
const { financialSnapshot, sealArchive, openArchive, persistVerifiedArchive, makeArchiveRepository } = require('./accountDeletionFinancialArchive');
const { authorize } = require('./accountDeletionArchiveAccess');
const { digest } = require('./accountDeletionExecutor');
function fail(code) { throw Object.assign(new Error(code), { code }); }
const keyOf = row => row.sourceType + ':' + String(row.sourceId);
async function readSources(models, subject) {
  const orders = await models.Order.collection.find({ $or: [{ user: subject.userId }, { payerUser: subject.userId }] }).toArray();
  const ids = orders.map(row => row._id);
  const payments = await models.Payment.collection.find({ $or: [{ user: subject.userId }, { order: { $in: ids } }, { 'allocations.order': { $in: ids } }] }).toArray();
  const refunds = await models.Refund.collection.find({ $or: [{ user: subject.userId }, { order: { $in: ids } }, { payment: { $in: payments.map(row => row._id) } }] }).toArray();
  return { orders, payments, refunds };
}
function assertEligible({ orders, payments, refunds }, subject) {
  const orderIds = new Set(orders.map(row => String(row._id)));
  const paymentIds = new Set(payments.map(row => String(row._id)));
  for (const row of orders) {
    if (String(row.tenantId) !== String(subject.tenantId)) fail('FINANCE_INSTITUTION_MISMATCH');
    if (String(row.user) !== String(subject.userId) || (row.payerUser && String(row.payerUser) !== String(subject.userId))) fail('SHARED_TRANSACTION_REQUIRES_RESOLUTION');
    if (!['completed', 'cancelled'].includes(row.status) || !['completed', 'closed', 'refunded'].includes(row.tradeStatus)
      || ['pending'].includes(row.paymentStatus) || ['requested', 'processing', 'failed'].includes(row.refundStatus)
      || row.checkoutActionLockToken || (row.inventoryReserved && !row.inventoryReleased)) fail('UNFINISHED_TRANSACTION_REQUIRES_RESOLUTION');
  }
  for (const row of [...payments, ...refunds]) {
    if (String(row.user) !== String(subject.userId) || !orderIds.has(String(row.order))) fail('SHARED_TRANSACTION_REQUIRES_RESOLUTION');
    if (!['succeeded', 'closed'].includes(row.status) || row.settlementLockToken) fail('UNFINISHED_TRANSACTION_REQUIRES_RESOLUTION');
  }
  for (const row of payments) for (const allocation of row.allocations || []) {
    if (!orderIds.has(String(allocation.order))) fail('SHARED_TRANSACTION_REQUIRES_RESOLUTION');
  }
  for (const row of refunds) if (row.payment && !paymentIds.has(String(row.payment))) fail('FINANCIAL_ASSOCIATION_UNVERIFIED');
}
function flatten(sources) {
  return [['Order', sources.orders], ['Payment', sources.payments], ['Refund', sources.refunds]]
    .flatMap(([sourceType, rows]) => rows.map(source => ({ sourceType, sourceId: source._id, source })));
}
async function prepareFinancePlan({ models, subject, requestId, classificationFor, keyId, encryptionKey, env = process.env, now }) {
  if (!subject?.userId?.toHexString || !subject?.tenantId?.toHexString || !requestId) fail('FINANCE_IDENTITY_REQUIRED');
  const sources = await readSources(models, subject);
  assertEligible(sources, subject);
  const entries = [];
  for (const row of flatten(sources)) {
    const order = sources.orders.find(o => String(o._id) === String(row.sourceType === 'Order' ? row.sourceId : row.source.order));
    const classification = await classificationFor(row.sourceType, row.source);
    // Operator confirmed all three transaction sources are accounting vouchers.
    if (classification?.category !== 'accounting_voucher') fail('FINANCE_CATEGORY_MISMATCH');
    // Review identity must be a real authorized institutional administrator, not a placeholder.
    const admin = await models.Admin.collection.findOne({ _id: classification?.reviewedBy, tenantId: subject.tenantId, role: 'superadmin' });
    if (!admin) fail('FINANCE_REVIEWER_UNVERIFIED');
    authorize(admin, env);
    const snapshot = financialSnapshot({ ...row, order, subject, classification, now: now || new Date() });
    entries.push(sealArchive({ snapshot, subject, requestId, keyId, encryptionKey }));
  }
  return { version: 1, subject: { userId: String(subject.userId), tenantId: String(subject.tenantId) }, requestId: String(requestId), entries };
}
async function executeFinancePlan({ models, subject, requestId, plan, encryptionKeys, assertFrozen, objectId, now = new Date() }) {
  if (!plan || plan.version !== 1 || plan.requestId !== String(requestId) || plan.subject?.userId !== String(subject.userId)
    || plan.subject?.tenantId !== String(subject.tenantId) || !Array.isArray(plan.entries)) fail('FINANCE_PLAN_IDENTITY_MISMATCH');
  async function fence() { if (typeof assertFrozen !== 'function' || await assertFrozen(subject) !== true) fail('WRITER_FENCE_NOT_HELD'); }
  await fence();
  const repository = makeArchiveRepository(models.AccountDeletionFinancialArchive);
  const entries = new Map();
  for (const entry of plan.entries) {
    if (entry.category !== 'accounting_voucher') fail('FINANCE_CATEGORY_MISMATCH');
    require('./accountDeletionRetentionPolicy').validateVoucherRetention(entry, now);
    if (!['Order', 'Payment', 'Refund'].includes(entry.sourceType) || !/^[a-f0-9]{64}$/.test(entry.sourceHash || '')
      || String(entry.tenantId) !== String(subject.tenantId) || String(entry.requestId) !== String(requestId) || entries.has(keyOf(entry))) fail('FINANCE_PLAN_INVALID');
    const fields = openArchive(entry, encryptionKeys[entry.keyId]);
    if (String(fields._id) !== String(entry.sourceId)) fail('FINANCE_PLAN_INVALID');
    entries.set(keyOf(entry), entry);
  }
  // A changed/new source invalidates the entire pass BEFORE any original is removed.
  const current = flatten(await readSources(models, subject));
  for (const row of current) {
    const entry = entries.get(keyOf(row));
    if (!entry || digest(row.source) !== entry.sourceHash) fail('FINANCIAL_SOURCE_CHANGED');
  }
  for (const entry of entries.values()) {
    await fence();
    const source = await models[entry.sourceType].collection.findOne({ _id: objectId(entry.sourceId) });
    if (source && digest(source) !== entry.sourceHash) fail('FINANCIAL_SOURCE_CHANGED');
    const scope = { tenantId: subject.tenantId, requestId, sourceType: entry.sourceType, sourceId: objectId(entry.sourceId) };
    if (!source) {
      // Recovery requires an already durable verified archive; never create one after loss of its original.
      const saved = await repository.read(scope);
      if (!saved?.verifiedAt || saved.sourceHash !== entry.sourceHash || saved.payloadHash !== entry.payloadHash) fail('MISSING_ORIGINAL_AND_VERIFIED_ARCHIVE');
      openArchive(saved, encryptionKeys[saved.keyId]);
    }
    await persistVerifiedArchive({ repository, entry, encryptionKey: encryptionKeys[entry.keyId], now });
  }
  // Every original is archived/read back first. Delete dependants before their order.
  const ordered = [...entries.values()].sort((a, b) => ['Refund', 'Payment', 'Order'].indexOf(a.sourceType) - ['Refund', 'Payment', 'Order'].indexOf(b.sourceType));
  for (const entry of ordered) {
    await fence();
    const collection = models[entry.sourceType].collection;
    const source = await collection.findOne({ _id: objectId(entry.sourceId) });
    if (!source) continue;
    if (digest(source) !== entry.sourceHash) fail('FINANCIAL_SOURCE_CHANGED');
    // Atomic full-document comparison also protects against an accidental concurrent writer.
    const result = await collection.deleteOne({ _id: source._id, $expr: { $eq: ['$$ROOT', { $literal: source }] } });
    if (result.deletedCount !== 1 || await collection.findOne({ _id: source._id })) fail('FINANCIAL_SOURCE_CHANGED');
  }
  await fence();
  if (flatten(await readSources(models, subject)).length) fail('FINANCIAL_SOURCE_REMAINS');
  return { verified: true, archives: entries.size, sourceCopiesRemoved: entries.size };
}
module.exports = { prepareFinancePlan, executeFinancePlan, assertEligible };
