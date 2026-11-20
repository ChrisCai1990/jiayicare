module.exports = async function publishedAnnualRecommendations(patientId, plans) {
  const AnnualServiceRecommendation = require('../models/AnnualServiceRecommendation');
  const suggestions = await AnnualServiceRecommendation.find({ patientId: patientId, planId: { $in: plans.map(plan => plan._id) }, status: 'published' })
    .select('planId finding evidence recommendation timeframe appointmentDate nextStep selectedOptions response publishedAt').sort({ publishedAt: 1 }).lean();
  const giftService = require('./dentalGift');
  const giftContext = await giftService.context(patientId);
  const gift = giftContext ? giftService.view(giftContext.row) : null;
  const byPlan = new Map();
  suggestions.forEach(row => {
    const key = String(row.planId);
    const display = require('./annualServiceRecommendation').customerRecommendation(row);
    if (gift && plans.some(plan => String(plan._id)===key && Number(plan.year)===2026) && /洁牙|洗牙/.test(row.recommendation || '')) {
      display.nextStep = [`企业会员赠送单次洁牙1次，有效期至${gift.expiresAt}。${gift.expired ? '权益已过期；历史使用记录以核对为准。' : '由工作人员协助预约，无需自行购买年卡。'}`,
        ({unknown:'使用情况由工作人员核对。',available:'已核对未使用，工作人员将与您商定时间。',booked:`已登记预约：${gift.institution}，${gift.appointmentDate}。`,used:`已完成并登记使用：${gift.completedDate}。`})[gift.status], row.nextStep].filter(Boolean).join('\n');
    }
    byPlan.set(key, [...(byPlan.get(key) || []), display]);
  });
  return byPlan;
};
