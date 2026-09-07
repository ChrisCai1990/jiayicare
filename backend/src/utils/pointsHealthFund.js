const User = require('../models/User');
const PointsLog = require('../models/PointsLog');
const HealthFundTransaction = require('../models/HealthFundTransaction');
const SystemConfig = require('../models/SystemConfig');

const POINTS_PER_YUAN = 100;

async function getPointsPolicy() {
  const config = await SystemConfig.findOne({ key:'healthFundPolicy' }).select('value').lean();
  return {
    enabled: config?.value?.pointsExchangeEnabled !== false,
    pointsPerYuan: Math.max(1, Math.floor(Number(config?.value?.pointsPerYuan) || POINTS_PER_YUAN)),
    healthCheckinPoints: Math.max(0, Math.floor(Number(config?.value?.healthCheckinPoints) || 5)),
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

function pointsBalanceFields(points, pointsPolicy) {
  const rawTotal = { $add: [{ $ifNull: ['$pointsBalance', 0] }, { $ifNull: ['$points', 0] }, points] };
  // 历史数据可能存在负积分。若直接对负数执行 $floor/$mod，每次打开权益页
  // 都会兑换出负健康基金并持续扣减余额；先归零再做兑换。
  const total = { $max: [0, rawTotal] };
  if (!pointsPolicy.enabled) return { pointsBalance: total };
  return {
    pointsBalance: { $mod: [total, pointsPolicy.pointsPerYuan] },
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
 * personal health fund. The aggregation-pipeline update makes the two balances
 * change in one atomic MongoDB operation, including concurrent check-ins.
 */
async function awardPointsAndConvert({ userId, amount = 0, source, refType = '', refId = null, remark = '' }) {
  const points = Math.max(0, Math.floor(Number(amount) || 0));
  const pointsPolicy = await getPointsPolicy();
  const balanceFields = pointsBalanceFields(points, pointsPolicy);
  const before = await User.findOneAndUpdate(
    { _id: userId },
    [{
      $set: {
        ...balanceFields,
        points: 0,
      },
    }],
    { new: false },
  );
  if (!before) return null;

  const conversion = pointsPolicy.enabled
    ? conversionFor(before.pointsBalance, points, before.points, pointsPolicy.pointsPerYuan)
    : { pointsBalance:Number(before.pointsBalance||0)+Number(before.points||0)+points, redeemedPoints:0, fundAmount:0 };
  const writes = [];
  if (points > 0) {
    writes.push(PointsLog.create({ user: userId, amount: points, source, refType, refId, remark }));
  }
  if (conversion.redeemedPoints > 0) {
    const conversionRemark = `${conversion.redeemedPoints}积分自动兑换${conversion.fundAmount}元健康基金`;
    writes.push(PointsLog.create({
      user: userId, amount: -conversion.redeemedPoints, source: 'redeem',
      refType: refType === 'Order' ? 'Order' : 'HealthFund',
      refId: refType === 'Order' ? refId : null, remark: conversionRemark,
    }));
    writes.push(HealthFundTransaction.create({
      userId, orderId: refType === 'Order' ? refId : null,
      type: 'grant', source: 'promotion', amount: conversion.fundAmount,
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
