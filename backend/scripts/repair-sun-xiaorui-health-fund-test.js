require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const GiftRecord = require('../src/models/GiftRecord');
const HealthFundTransaction = require('../src/models/HealthFundTransaction');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ phone: '18196750032', name: '孙筱蕊' });
  if (!user) throw new Error('未找到孙筱蕊');
  const gift = await GiftRecord.findOne({ _id: '6a6c5b1c4a912ecb9dd55462', patientId:user._id, giftType:'fund', fundType:'enterprise', fundAmount:400 });
  if (!gift) throw new Error('未找到预期的400元测试赠送记录');
  if (gift.status !== 'active') { console.log('测试赠送已清理，无需重复执行'); return; }
  if ((user.healthFundBalance || 0) < 400) throw new Error(`当前余额${user.healthFundBalance}不足400，停止清理`);
  await mongoose.connection.collection('maintenance_backups').insertOne({
    type:'sun_xiaorui_health_fund_test_cleanup', createdAt:new Date(), user:user.toObject(), gift:gift.toObject(),
  });
  gift.status = 'expired';
  gift.remark = `${gift.remark || ''}｜测试数据清理（原始记录保留）`;
  await gift.save();
  user.healthFundBalance = Math.round(((user.healthFundBalance || 0) - 400) * 100) / 100;
  await user.save();
  await HealthFundTransaction.create({
    userId:user._id, enterpriseId:user.enterpriseId || null, type:'adjustment', source:'enterprise', amount:-400,
    balanceAfter:user.healthFundBalance, remark:'清理2026-07-31企业健康基金测试赠送及测试扣减；原始赠送记录转为已失效',
  });
  console.log(JSON.stringify({ userId:user._id, balanceAfter:user.healthFundBalance, giftStatus:gift.status }));
}
main().then(()=>mongoose.disconnect()).catch(async e=>{console.error(e.message);await mongoose.disconnect();process.exit(1)});
