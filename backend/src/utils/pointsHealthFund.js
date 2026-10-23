const User = require('../models/User');
const PointsLog = require('../models/PointsLog');
const HealthFundTransaction = require('../models/HealthFundTransaction');
const SystemConfig = require('../models/SystemConfig');

const POINTS_PER_YUAN = 100;

async function getPointsPolicy() {
  const config = await SystemConfig.findOne({ key:'healthFundPolicy' }).select('value').lean();
  return {
    enabled: config?.value?.pointsExchangeEnabled !== false,
    pointsPerYuan: POINTS_PER_YUAN,
    healthCheckinPoints: Math.min(5, Math.max(0, Math.floor(Number(config?.value?.healthCheckinPoints ?? 5)))),
  };
}

function conversionFor(balance, awarded = 0, legacyBalance = 0, pointsPerYuan = POINTS_PER_YUAN) {
  const total = Math.max(0, Number(balance || 0) + Number(legacyBalance || 0) + Number(awarded || 0));
  const rate = Math.max(1, Math.floor(Number(pointsPerYuan) || POINTS_PER_YUAN));
  const fundAmount = Math.floor(total / rate);
  return {
    pointsBalance: total % rate,
    redeemedPoints: fundAmount * rate,
    fundAmount,
  };
}

function pointsBalanceFields(points, pointsPolicy, pool = 'legacy') {
  const field = pool === 'vitality' ? 'vitalityPointsBalance' : pool === 'reward' ? 'rewardPointsBalance' : 'pointsBalance';
  const rawTotal = { $add: [{ $ifNull: [`$${field}`, 0] }, ...(pool === 'legacy' ? [{ $ifNull: ['$points', 0] }] : []), points] };
  // 历史数据可能存在负积分。若直接对负数执行 $floor/$mod，每次打开权益页
  // 都会兑换出负健康基金并持续扣减余额；先归零再做兑换。
  const total = { $max: [0, rawTotal] };
  if (!pointsPolicy.enabled) return { [field]: total };
  return {
    [field]: { $mod: [total, pointsPolicy.pointsPerYuan] },
    healthFundBalance: {
      $add: [
        { $ifNull: ['$healthFundBalance', 0] },
        { $floor: { $divide: [total, pointsPolicy.pointsPerYuan] } },
      ],
    },
  };
}

/**
 * Add points and immediately convert every complete 100 points to one yuan of
 * source-specific health fund. The aggregation-pipeline update makes the two balances
 * change in one atomic MongoDB operation, including concurrent check-ins.
 */
async function awardPointsAndConvert({ userId, amount = 0, source, refType = '', refId = null, remark = '' }) {
  const points = Math.max(0, Math.floor(Number(amount) || 0));
  const pointsPolicy = await getPointsPolicy();
  const pool = source === 'checkin' ? 'vitality' : source === 'consumption' ? 'reward' : 'legacy';
  const field = pool === 'vitality' ? 'vitalityPointsBalance' : pool === 'reward' ? 'rewardPointsBalance' : 'pointsBalance';
  const balanceFields = pointsBalanceFields(points, pointsPolicy, pool);
  const before = await User.findOneAndUpdate(
    { _id: userId },
    [{
      $set: {
        ...balanceFields,
        ...(pool === 'legacy' ? { points: 0 } : {}),
      },
    }],
    { new: false },
  );
  if (!before) return null;

  const conversion = pointsPolicy.enabled
    ? conversionFor(before[field], points, pool === 'legacy' ? before.points : 0, pointsPolicy.pointsPerYuan)
    : { pointsBalance:Number(before[field]||0)+(pool === 'legacy' ? Number(before.points||0) : 0)+points, redeemedPoints:0, fundAmount:0 };
  const writes = [];
  if (points > 0) {
    writes.push(PointsLog.create({ user: userId, amount: points, source, pool, refType, refId, remark }));
  }
  if (conversion.redeemedPoints > 0) {
    const fundName = pool === 'vitality' ? '活力基金' : '奖励基金';
    const conversionRemark = `${conversion.redeemedPoints}积分自动兑换${conversion.fundAmount}元${fundName}`;
    writes.push(PointsLog.create({
      user: userId, amount: -conversion.redeemedPoints, source: 'redeem', pool,
      refType: refType === 'Order' ? 'Order' : 'HealthFund',
      refId: refType === 'Order' ? refId : null, remark: conversionRemark,
    }));
    writes.push(HealthFundTransaction.create({
      userId, orderId: refType === 'Order' ? refId : null,
      type: 'grant', source: pool === 'vitality' ? 'vitality' : 'enterprise', amount: conversion.fundAmount,
      balanceAfter: Number(before.healthFundBalance || 0) + conversion.fundAmount,
      remark: conversionRemark,
    }));
  }
  await Promise.all(writes);
  return conversion;
}

async function convertExistingPoints(userId) {
  return awardPointsAndConvert({ userId, amount: 0, source: 'adjust' });
}

module.exports = { POINTS_PER_YUAN, getPointsPolicy, conversionFor, pointsBalanceFields, awardPointsAndConvert, convertExistingPoints };
