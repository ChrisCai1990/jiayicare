const User = require('../models/User');
const Message = require('../models/Message');
const SystemConfig = require('../models/SystemConfig');
const HealthFundTransaction = require('../models/HealthFundTransaction');

async function grant(userId, amount, remark) {
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return;
  const updated = await User.findByIdAndUpdate(userId, { $inc: { healthFundBalance: value } }, { new: true });
  await HealthFundTransaction.create({ userId, type: 'grant', source: 'enterprise', amount: value, balanceAfter: updated?.healthFundBalance || 0, remark });
}

// 邀请关系在建档时已固定；健康基金必须等受邀客户完成一份问卷后才允许领取。
// referralRewardGrantedAt 是领取幂等锁，重复提交或并发提交都只会赠送一次。
async function grantReferralQuestionnaireReward(userId) {
  const cfg = (await SystemConfig.findOne({ key: 'healthFundPolicy' }).lean())?.value || {};
  if (cfg.inviteEnabled !== true) return false;

  const candidate = await User.findOne({
    _id: userId,
    onboardingCompleted: true,
    invitedBy: { $ne: null },
    referralRewardGrantedAt: null,
  }).select('invitedBy');
  if (!candidate) return false;

  const inviter = await User.findOne({ _id: candidate.invitedBy, isDeleted: { $ne: true } }).select('_id');
  if (!inviter) return false;

  const now = new Date();
  const claimed = await User.findOneAndUpdate(
    { _id: candidate._id, referralRewardGrantedAt: null },
    { $set: { referralRewardGrantedAt: now } },
    { new: true },
  );
  if (!claimed) return false;

  await Promise.all([
    grant(inviter._id, cfg.inviterAmount, '邀请好友完成问卷奖励'),
    grant(claimed._id, cfg.inviteeAmount, '通过好友邀请完成问卷奖励'),
  ]);
  const notices = [];
  if (Number(cfg.inviterAmount) > 0) notices.push(Message.create({
    user: inviter._id, type: 'system', sender: '嘉医汇', title: '健康基金已到账', unread: true,
    content: `好友已完成健康问卷，¥${Number(cfg.inviterAmount)} 健康基金已到账。感谢你的分享。`,
  }));
  if (Number(cfg.inviteeAmount) > 0) notices.push(Message.create({
    user: claimed._id, type: 'system', sender: '嘉医汇', title: '健康基金已到账', unread: true,
    content: `您已完成健康问卷，¥${Number(cfg.inviteeAmount)} 邀请健康基金已到账。`,
  }));
  await Promise.all(notices);
  return true;
}

module.exports = { grantReferralQuestionnaireReward };
