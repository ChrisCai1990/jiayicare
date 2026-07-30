/**
 * 为旧会员类型补齐客户归属，并移除旧的 name 全局唯一索引。
 * 默认只预览；部署窗口确认后使用：node scripts/migrate-member-settings-brand.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MemberType = require('../src/models/MemberType');

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);

  const missingFilter = {
    $or: [
      { clientBrand: { $exists: false } },
      { clientBrand: null },
      { clientBrand: '' },
    ],
  };
  const missingCount = await MemberType.countDocuments(missingFilter);
  const indexes = await MemberType.collection.indexes();
  const legacyNameIndex = indexes.find(index => index.name === 'name_1' && index.unique);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    memberTypesToAssignJiayiGuanjia: missingCount,
    legacyNameUniqueIndex: legacyNameIndex?.name || null,
  }, null, 2));

  if (apply) {
    await MemberType.updateMany(missingFilter, { $set: { clientBrand: 'jiayiguanjia' } });
    if (legacyNameIndex) await MemberType.collection.dropIndex(legacyNameIndex.name);
    await MemberType.syncIndexes();
    console.log('迁移完成');
  }
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
