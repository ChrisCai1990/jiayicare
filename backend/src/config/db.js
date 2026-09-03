const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB 连接成功: ${conn.connection.host}`);
    // 报告 OCR 的 processing 状态由 reportParseJobs 在启动后续跑。这里不能清空，
    // 否则 PM2 发布/重启会丢掉几十页扫描 PDF 的解析任务。
    // 索引迁移：年度方案从「每人每年一份」改为「每人每年每类型一份」，需删除旧唯一索引
    try {
      const AnnualPlan = require('../models/AnnualPlan');
      const idxs = await AnnualPlan.collection.indexes();
      if (idxs.some(i => i.name === 'patientId_1_year_1')) {
        await AnnualPlan.collection.dropIndex('patientId_1_year_1');
        console.log('🔧 已删除 AnnualPlan 旧唯一索引 patientId_1_year_1');
      }
      await AnnualPlan.syncIndexes();
    } catch (e) { console.error('AnnualPlan 索引迁移失败:', e.message); }
    // 索引迁移：UserScreeningItem 从 {user,itemId} 唯一 改为 {user,itemId,reportId} 唯一，允许多年数据并存
    try {
      const UserScreeningItem = require('../models/UserScreeningItem');
      const idxs = await UserScreeningItem.collection.indexes();
      if (idxs.some(i => i.name === 'user_1_itemId_1')) {
        await UserScreeningItem.collection.dropIndex('user_1_itemId_1');
        console.log('🔧 已删除 UserScreeningItem 旧唯一索引 user_1_itemId_1');
      }
      await UserScreeningItem.syncIndexes();
    } catch (e) { console.error('UserScreeningItem 索引迁移失败:', e.message); }
  } catch (error) {
    console.error('❌ MongoDB 连接失败:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
