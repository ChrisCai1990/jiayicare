const crypto = require('node:crypto');
const { publicRequest } = require('./accountDeletionRequest');
const fail = () => { throw Object.assign(new Error('注销查询凭证无效或已过期'), { status: 404 }); };
function mac(record, secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw Object.assign(new Error('注销回执服务尚未配置'), { status: 503 });
  return crypto.createHmac('sha256', secret).update(JSON.stringify([
    'account-deletion-receipt-v1', String(record._id), String(record.tenantId), String(record.user),
    record.receiptNonce, new Date(record.receiptExpiresAt).toISOString(),
  ])).digest('base64url');
}
function issueReceipt(record, secret) {
  if (!record?.receiptNonce || !record.receiptExpiresAt) return null;
  return { token: `${record._id}.${mac(record, secret)}`, expiresAt: record.receiptExpiresAt };
}
async function readReceipt({ token, requests, secret, now = Date.now() }) {
  if (typeof token !== 'string' || !/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(token)) fail();
  const [id, supplied] = token.split('.');
  // Raw collection avoids implicit authenticated tenant scope; the capability is bound to
  // the stored institution and account. Return no name, contact data or financial details.
  const record = await requests.findOne({ _id: requests.objectId(id) });
  if (!record?.receiptNonce || !(new Date(record.receiptExpiresAt).getTime() > now)) fail();
  const expected = mac(record, secret);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) fail();
  const result = publicRequest(record);
  return { id: result.id, status: result.status, requestedAt: result.requestedAt,
    completedAt: result.completedAt, completionDays: result.completionDays, expiresAt: record.receiptExpiresAt,
    notice: result.notice, completionScope: result.completionScope, secondaryCleanup: result.secondaryCleanup };
}
module.exports = { issueReceipt, readReceipt };
