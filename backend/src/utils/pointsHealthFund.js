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

/**
 * Add points and immediately convert every complete 100 points to one yuan of
 * personal health fund. The aggregation-pipeline update makes the two balances
 * change in one atomic MongoDB operation, including concurrent check-ins.
 */
async function awardPointsAndConvert({ userId, amount = 0, source, refType = '', refId = null, remark = '' }) {
  const points = Math.max(0, Math.floor(Number(amount) || 0));
  const pointsPolicy = await getPointsPolicy();
  const totalExpression = { $add: [{ $ifNull: ['$pointsBalance', 0] }, { $ifNull: ['$points', 0] }, points] };
  const balanceFields = pointsPolicy.enabled ? {
    pointsBalance: { $mod: [totalExpression, pointsPolicy.pointsPerYuan] },
    healthFundBalance: {
      $add: [
        { $ifNull: ['$healthFundBalance', 0] },
        { $floor: { $divide: [totalExpression, pointsPolicy.pointsPerYuan] } },
      ],
    },
  } : { pointsBalance: totalExpression };
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
      refType: 'HealthFund', remark: conversionRemark,
    }));
    writes.push(HealthFundTransaction.create({
      userId, type: 'grant', source: 'promotion', amount: conversion.fundAmount,
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

module.exports = { POINTS_PER_YUAN, getPointsPolicy, conversionFor, awardPointsAndConvert, convertExistingPoints };
