const mongoose = require('mongoose');
const { auditMarketPartnerIndexes } = require('../utils/marketPartnerIndexes');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(process.env.MONGODB_URI);
  const missing = await auditMarketPartnerIndexes();
  if (!missing.length) { console.log('市场合伙人索引已齐备'); return; }
  console.log(`待建索引（${missing.length}）：\n${missing.join('\n')}`);
  if (process.env.MARKET_PARTNER_INDEX_APPLY !== 'true') return;
  await auditMarketPartnerIndexes({ apply: true });
  const after = await auditMarketPartnerIndexes();
  if (after.length) throw new Error(`索引创建后仍缺失：${after.join(', ')}`);
  console.log('市场合伙人索引创建并复核完成');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
