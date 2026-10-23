function normalizeSource(source) {
  return source === 'enterprise' ? 'enterprise' : (source || 'other');
}

function displaySource(transaction) {
  if (transaction.source === 'vitality') return 'vitality';
  return transaction.type === 'grant' && (/积分自动兑换.*元(健康基金|奖励基金)/.test(transaction.remark || '') || /^(分享产品成交奖励|通过好友分享购买奖励)/.test(transaction.remark || ''))
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
