const id = value => String(value?._id || value || '')
export function consultationReadStatus(member, referral) {
  const current = member.viewedAt && id(member.viewedReferralId) === id(referral) && member.viewedVersion === (referral?.contentVersion || 0)
  if (member.viewedAt && !current) return '资料已更新，待再次查看'
  if (member.repliedAt) return '已回复'
  if (current) return '已查看'
  return member.dispatchedAt ? '已推送 · 未查看' : '暂无查看记录'
}
