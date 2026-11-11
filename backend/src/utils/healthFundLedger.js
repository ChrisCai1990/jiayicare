function normalizeSource(source) {
  return source === 'enterprise' ? 'enterprise' : (source || 'other');
}

function displaySource(transaction) {
  if (transaction.source === 'vitality') return 'vitality';
  const platformRewards = new Set([
    '首次使用小程序健康基金奖励', '邀请好友首次使用小程序奖励', '通过好友邀请首次使用小程序奖励',
    '邀请好友完成问卷奖励', '通过好友邀请完成问卷奖励',
    '客户激活奖励基金', '首次完成健康问卷奖励基金',
  ]);
  return transaction.type === 'grant' && (/积分自动兑换.*元(健康基金|奖励基金)/.test(transaction.remark || '') || /^(分享产品成交奖励|通过好友分享购买奖励)/.test(transaction.remark || '') || platformRewards.has(transaction.remark))
    ? 'enterprise'
    : transaction.source;
}

function transactionMatchesGift(transaction, gift) {
  if (transaction.type !== 'grant') return false;
  if (normalizeSource(transaction.source) !== normalizeSource(gift.fundType)) return false;
  if ((Number(transaction.amount) || 0) !== (Number(gift.fundAmount) || 0)) return false;
  const transactionAt = new Date(transaction.createdAt).getTime();
  const giftAt = new Date(gift.createdAt).getTime();
  return Number.isFinite(transactionAt) && Number.isFinite(giftAt) && Math.abs(transactionAt - giftAt) <= 10000;
}

function mergeHealthFundLedger(transactions = [], grants = []) {
  const transactionRows = transactions.map(item => ({
    _id:item._id, type:item.type, source:displaySource(item), amount:Number(item.amount)||0,
    remark:item.remark||'', orderName:item.orderId?.serviceName||'',
    orderNo:item.orderId?.orderNo||'', operatorName:item.operatorId?.name||'', createdAt:item.createdAt,
  }));
  const legacyGiftRows = grants
    .filter(gift => !transactions.some(transaction => transactionMatchesGift(transaction, gift)))
    .map(item => ({
      _id:item._id, type:'grant', source:'enterprise', amount:Number(item.fundAmount)||0,
      remark:item.remark||'奖励基金入账',
      orderName:'', orderNo:'', operatorName:item.staffId?.name||'', createdAt:item.createdAt,
    }));
  return [...transactionRows, ...legacyGiftRows]
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
    .slice(0,100);
}

module.exports = { mergeHealthFundLedger, transactionMatchesGift };
