const crypto = require('node:crypto');

function readPolicy(env = process.env) {
  const days = Number(env.ACCOUNT_DELETION_COMPLETION_DAYS);
  if (env.ACCOUNT_DELETION_ENABLED !== 'true' || !env.ACCOUNT_DELETION_POLICY_VERSION?.trim()
      || Buffer.byteLength(env.ACCOUNT_DELETION_RECEIPT_SECRET || '') < 32
      || !env.ACCOUNT_DELETION_NOTICE?.trim() || !Number.isInteger(days) || days < 1 || days > 30) return null;
  return { version: env.ACCOUNT_DELETION_POLICY_VERSION.trim(), notice: env.ACCOUNT_DELETION_NOTICE.trim(), completionDays: days };
}
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function scope(actor) {
  if (!actor?._id || !actor.tenantId || actor.isDeleted) fail(401, '请重新登录');
  return { user: actor._id, tenantId: actor.tenantId };
}
function sign(payload, secret) {
  if (!secret) fail(503, '注销服务暂不可用');
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
function makeConfirmation(actor, policy, secret, now) {
  const identity = scope(actor);
  const payload = Buffer.from(JSON.stringify({
    purpose: 'account-deletion', user: String(identity.user), tenant: String(identity.tenantId),
    version: policy.version, exp: now + 10 * 60 * 1000,
    // Bind consent to the complete notice, even if an operator forgets to bump its version.
    noticeHash: crypto.createHash('sha256').update(JSON.stringify(policy)).digest('hex'),
  })).toString('base64url');
  return payload + '.' + sign(payload, secret);
}
function verifyConfirmation(token, actor, policy, secret, now) {
  if (typeof token !== 'string' || token.length > 4096) fail(400, '请重新阅读并确认注销说明');
  const parts = token.split('.');
  if (parts.length !== 2) fail(400, '请重新阅读并确认注销说明');
  const expected = Buffer.from(sign(parts[0], secret));
  const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) fail(400, '注销确认已失效，请重试');
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { fail(400, '注销确认已失效，请重试'); }
  const identity = scope(actor);
  const hash = crypto.createHash('sha256').update(JSON.stringify(policy)).digest('hex');
  if (payload.purpose !== 'account-deletion' || payload.user !== String(identity.user)
      || payload.tenant !== String(identity.tenantId) || payload.version !== policy.version
      || payload.noticeHash !== hash || !Number.isFinite(payload.exp) || payload.exp <= now) fail(400, '注销确认已失效，请重试');
}
function publicRequest(record) {
  if (!record) return null;
  // A database status alone is not proof that the account and related data were removed.
  const completed = record.status === 'completed' && record.completedAt && record.completionEvidence;
  return { id: String(record._id), status: record.status === 'completed' && !completed ? 'processing' : record.status,
    requestedAt: record.requestedAt, completedAt: completed ? record.completedAt : null,
    completionDays: record.completionDays, notice: record.notice,
    completionScope: completed ? record.completionScope || 'account-and-active-data' : null,
    secondaryCleanup: completed ? record.secondaryCleanup || [] : [] };
}
function createService({ requests, env = process.env, now = Date.now, isExecutionReady = async () => false }) {
  async function get(actor) {
    const identity = scope(actor);
    const record = await requests.findOne(identity);
    const request = publicRequest(record);
    const receipt = record ? require('./accountDeletionReceipt').issueReceipt(record, env.ACCOUNT_DELETION_RECEIPT_SECRET) : null;
    const policy = await isExecutionReady() === true ? readPolicy(env) : null;
    return { available: !!policy, request, policy, receipt,
      confirmationToken: policy && !request ? makeConfirmation(actor, policy, env.JWT_SECRET, now()) : null };
  }
  async function submit(actor, input = {}) {
    const identity = scope(actor);
    const policy = await isExecutionReady() === true ? readPolicy(env) : null;
    if (!policy) fail(503, '注销服务尚未开放，请稍后重试');
    if (input.confirmation !== 'DELETE_MY_ACCOUNT') fail(400, '请确认注销当前账号');
    verifyConfirmation(input.confirmationToken, actor, policy, env.JWT_SECRET, now());
    const insert = { ...identity, status: 'requested', policyVersion: policy.version,
      notice: policy.notice, completionDays: policy.completionDays, requestedAt: new Date(now()),
      receiptNonce: crypto.randomBytes(32).toString('base64url'),
      receiptExpiresAt: new Date(now() + 180 * 24 * 60 * 60 * 1000) };
    let record;
    try {
      record = await requests.findOneAndUpdate(identity, { $setOnInsert: insert }, { upsert: true, new: true, runValidators: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      record = await requests.findOne(identity);
      if (!record) throw error;
    }
    return { ...publicRequest(record), receipt: require('./accountDeletionReceipt').issueReceipt(record, env.ACCOUNT_DELETION_RECEIPT_SECRET) };
  }
  return { get, submit };
}
module.exports = { readPolicy, createService, publicRequest };
