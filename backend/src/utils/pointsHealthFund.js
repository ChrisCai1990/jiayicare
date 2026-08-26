const User = require('../models/User');
const PointsLog = require('../models/PointsLog');
const HealthFundTransaction = require('../models/HealthFundTransaction');

const POINTS_PER_YUAN = 100;

function conversionFor(balance, awarded = 0, legacyBalance = 0) {
  const total = Math.max(0, Number(balance || 0) + Number(legacyBalance || 0) + Number(awarded || 0));
  const fundAmount = Math.floor(total / POINTS_PER_YUAN);
  return {
    pointsBalance: total % POINTS_PER_YUAN,
    redeemedPoints: fundAmount * POINTS_PER_YUAN,
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
  const before = await User.findOneAndUpdate(
    { _id: userId },
    [{
      $set: {
        pointsBalance: {
          $mod: [{ $add: [{ $ifNull: ['$pointsBalance', 0] }, { $ifNull: ['$points', 0] }, points] }, POINTS_PER_YUAN],
        },
        points: 0,
        healthFundBalance: {
          $add: [
            { $ifNull: ['$healthFundBalance', 0] },
            { $floor: { $divide: [{ $add: [{ $ifNull: ['$pointsBalance', 0] }, { $ifNull: ['$points', 0] }, points] }, POINTS_PER_YUAN] } },
          ],
        },
      },
    }],
    { new: false },
  );
  if (!before) return null;

  const conversion = conversionFor(before.pointsBalance, points, before.points);
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

module.exports = { POINTS_PER_YUAN, conversionFor, awardPointsAndConvert, convertExistingPoints };
