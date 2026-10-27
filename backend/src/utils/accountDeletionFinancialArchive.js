const crypto = require('node:crypto');
// No model/database is imported here; callers must supply a scoped archive repository.
// This helper never deletes or changes the source order/payment/refund.
const FIELDS = Object.freeze({
  Order: ['_id', 'serviceId', 'serviceName', 'servicePrice', 'specificationLabel', 'unitPrice', 'totalUnits',
    'paymentMethod', 'paymentStatus', 'paidAmount', 'healthFundAmount', 'healthFundBreakdown', 'couponDiscount',
    'paymentOutTradeNo', 'transactionId', 'paidAt', 'refundedAmount', 'refundStatus', 'status', 'completedAt', 'createdAt'],
  Payment: ['_id', 'order', 'channel', 'status', 'amount', 'allocations', 'currency', 'outTradeNo', 'transactionId', 'paidAt', 'closedAt', 'createdAt'],
  Refund: ['_id', 'order', 'payment', 'outRefundNo', 'refundId', 'amount', 'totalAmount', 'status', 'succeededAt', 'createdAt'],
});
function fail(message) { throw Object.assign(new Error(message), { code: 'FINANCIAL_ARCHIVE_UNVERIFIED' }); }
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  if (typeof value === 'number' && !Number.isFinite(value)) fail('Invalid financial number');
  return value;
}
const serialize = value => JSON.stringify(canonical(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function keyBytes(base64) {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(base64)) fail('A separate 32-byte archive encryption key is required');
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32 || key.toString('base64') !== base64) fail('Invalid archive key');
  return key;
}
function identity(entry) {
  return { tenantId: String(entry.tenantId), requestId: String(entry.requestId), sourceType: entry.sourceType,
    sourceId: String(entry.sourceId), category: entry.category, legalBasis: entry.legalBasis,
    retainUntil: entry.retainUntil, reviewedBy: String(entry.reviewedBy), reviewedAt: entry.reviewedAt, keyId: entry.keyId };
}
function financialSnapshot({ sourceType, source, order, subject, classification, now = new Date() }) {
  if (!FIELDS[sourceType] || !source?._id || !order?._id || !subject?.userId || !subject.tenantId) fail('Missing source or subject');
  if (String(order.tenantId) !== String(subject.tenantId)) fail('Financial record belongs to another institution');
  if (String(order.user) !== String(subject.userId) && String(order.payerUser) !== String(subject.userId)) fail('Financial record belongs to another customer');
  if (sourceType === 'Order' ? String(source._id) !== String(order._id) : String(source.order) !== String(order._id)) fail('Source does not belong to the verified order');
  if (!classification || !['tax_supporting_record', 'accounting_voucher', 'accounting_ledger', 'accounting_auxiliary'].includes(classification.category)
      || !classification.legalBasis?.trim() || !classification.reviewedBy || !classification.reviewedAt
      || !classification.fieldsVerified || !classification.originalsVerified) fail('Financial classification and original completeness must be reviewed');
  const until = new Date(classification.retainUntil);
  const reviewedAt = new Date(classification.reviewedAt);
  if (!Number.isFinite(until.getTime()) || until <= now || !Number.isFinite(reviewedAt.getTime()) || reviewedAt > now) fail('Invalid retention or review date');
  if (source.currency && source.currency !== 'CNY') fail('Unsupported financial currency');
  const fields = { archiveFormatVersion: 1, moneyUnit: 'CNY_yuan' };
  for (const name of FIELDS[sourceType]) {
    if (source[name] === undefined) continue;
    // Do not let untyped/nested records smuggle unrelated health or account data into the archive.
    if (name === 'allocations') fields[name] = (source[name] || []).map(row => ({ order: row.order, amount: row.amount }));
    else if (name === 'healthFundBreakdown') fields[name] = Object.fromEntries(['personal', 'vitality', 'corporate'].filter(k => source[name]?.[k] !== undefined).map(k => [k, source[name][k]]));
    else {
      const value = source[name];
      if (value !== null && typeof value === 'object' && !(value instanceof Date) && typeof value.toHexString !== 'function') fail('Unexpected structured value in a financial field');
      fields[name] = value;
    }
  }
  return { sourceType, sourceId: String(source._id), fields: canonical(fields),
    classification: { category: classification.category, legalBasis: classification.legalBasis.trim(),
      retainUntil: until, reviewedBy: classification.reviewedBy, reviewedAt } };
}
function sealArchive({ snapshot, subject, requestId, keyId, encryptionKey }) {
  if (!requestId || !keyId || !subject?.tenantId) fail('Missing archive identity');
  const entry = { tenantId: subject.tenantId, requestId, sourceType: snapshot.sourceType, sourceId: snapshot.sourceId,
    ...snapshot.classification, keyId };
  const aad = Buffer.from(serialize(identity(entry)));
  const plaintext = Buffer.from(serialize(snapshot.fields));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(encryptionKey), iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ...entry, payloadHash: hash(plaintext), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') };
}
function openArchive(entry, encryptionKey) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(encryptionKey), Buffer.from(entry.iv, 'base64'));
  decipher.setAAD(Buffer.from(serialize(identity(entry))));
  decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(entry.ciphertext, 'base64')), decipher.final()]);
  if (hash(plaintext) !== entry.payloadHash) fail('Financial archive checksum mismatch');
  return JSON.parse(plaintext.toString('utf8'));
}
async function persistVerifiedArchive({ repository, entry, encryptionKey, now = new Date() }) {
  const scope = { tenantId: entry.tenantId, requestId: entry.requestId, sourceType: entry.sourceType, sourceId: entry.sourceId };
  openArchive(entry, encryptionKey);
  try { await repository.insertOnce(scope, entry); }
  catch (error) { if (error.code !== 11000) throw error; }
  // Read back from durable storage; a successful write return alone is insufficient.
  const stored = await repository.read(scope);
  if (!stored || serialize(identity(stored)) !== serialize(identity(entry)) || stored.payloadHash !== entry.payloadHash) fail('Stored archive differs from the reviewed snapshot');
  openArchive(stored, encryptionKey);
  if (await repository.markVerified(scope, stored.payloadHash, now) !== true) fail('Archive verification could not be recorded');
  return { sourceId: entry.sourceId, sourceType: entry.sourceType, payloadHash: entry.payloadHash, verifiedAt: now };
}
function makeArchiveRepository(Model) {
  return {
    insertOnce: (scope, entry) => Model.findOneAndUpdate(scope, { $setOnInsert: entry }, { upsert: true, new: true, runValidators: true }),
    read: scope => Model.findOne(scope).select('+iv +tag +ciphertext').lean(),
    async markVerified(scope, payloadHash, verifiedAt) {
      const result = await Model.updateOne({ ...scope, payloadHash }, { $set: { verifiedAt } });
      return result.matchedCount === 1;
    },
  };
}
module.exports = { financialSnapshot, sealArchive, openArchive, persistVerifiedArchive, makeArchiveRepository };
