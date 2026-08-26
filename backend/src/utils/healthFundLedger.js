function normalizeSource(source) {
  return source === 'enterprise' ? 'enterprise' : (source || 'other');
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
    _id:item._id, type:item.type, source:item.source, amount:Number(item.amount)||0,
    remark:item.remark||'', orderName:item.orderId?.serviceName||'',
    orderNo:item.orderId?.orderNo||'', createdAt:item.createdAt,
  }));
  const legacyGiftRows = grants
    .filter(gift => !transactions.some(transaction => transactionMatchesGift(transaction, gift)))
    .map(item => ({
      _id:item._id, type:'grant', source:item.fundType||'other', amount:Number(item.fundAmount)||0,
      remark:item.remark||(item.fundType==='enterprise'?'企业赠送健康基金':'自有健康基金入账'),
      orderName:'', orderNo:'', createdAt:item.createdAt,
    }));
  return [...transactionRows, ...legacyGiftRows]
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
    .slice(0,100);
}

module.exports = { mergeHealthFundLedger, transactionMatchesGift };
