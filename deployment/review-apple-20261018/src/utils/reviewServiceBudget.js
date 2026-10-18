const { assertReviewConnection } = require('./reviewEnvironment');

function positiveInteger(value) {
  if (!/^[1-9]\d*$/.test(String(value))) throw new Error('审核调用限额必须为正整数');
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error('审核调用限额无效');
  return n;
}

// Used by the review-only gateway; real provider adapters remain unregistered.
// Callers must supply a verified upper bound, including retries and maximum output.
// Reservations are never refunded automatically, even if a provider times out.
function createReviewServiceBudget({ connection, env = process.env, now = Date.now }) {
  return async function reserve({ service, maximumCostFen }) {
    assertReviewConnection(connection, env);
    if (!['ai', 'asr'].includes(service)
      || env.REVIEW_EXTERNAL_SERVICES_ENABLED !== 'true'
      || env[`REVIEW_${service.toUpperCase()}_ENABLED`] !== 'true') {
      throw new Error('审核外部服务尚未启用');
    }
    const time = now();
    const expiresAt = Date.parse(env.REVIEW_SERVICES_EXPIRES_AT || '');
    if (!Number.isFinite(time) || !Number.isFinite(expiresAt) || expiresAt <= time) {
      throw new Error('审核服务期限无效或已到期');
    }
    const capFen = positiveInteger(env.REVIEW_TOTAL_BUDGET_FEN);
    if (capFen > 1000) throw new Error('审核累计预算不得超过10元');
    const dailyLimit = positiveInteger(env.REVIEW_DAILY_CALL_LIMIT);
    const cost = positiveInteger(maximumCostFen);
    if (cost > capFen) throw new Error('审核调用超出预算');
    const day = new Date(time + 8 * 3600000).toISOString().slice(0, 10);
    // One permanent record shared by AI and ASR. Restarting or changing dates
    // cannot reset the total. Changing configuration requires explicit migration.
    const ledger = connection.collection('reviewservicebudgets');
    try {
      await ledger.updateOne({ _id: 'external-services' }, {
        $setOnInsert: { capFen, dailyLimit, reservedFen: 0, daily: {}, createdAt: new Date(time) },
      }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    const result = await ledger.updateOne({
      _id: 'external-services', capFen, dailyLimit,
      reservedFen: { $lte: capFen - cost },
      $or: [{ [`daily.${day}`]: { $exists: false } }, { [`daily.${day}`]: { $lt: dailyLimit } }],
    }, {
      $inc: { reservedFen: cost, [`daily.${day}`]: 1 },
      $set: { updatedAt: new Date(time) },
    });
    if (result.modifiedCount !== 1) throw new Error('审核调用额度已用完或配置已变更');
    return { service, reservedFen: cost, day };
  };
}

module.exports = { createReviewServiceBudget };
