const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB 连接成功: ${conn.connection.host}`);
    // 启动自愈：进程重启会终止内存中的识别任务。完整识别必须回到“待解析”，不能把未完成草稿
    // 误放进待审核；单页补提则保留原草稿并明确标记失败，供审核人员重新补提。
    try {
      const MedicalReport = require('../models/MedicalReport');
      const {
        recoverInterruptedOcrRuns,
      } = require('../utils/reportOcrRun');
      const recoveredAt = new Date();
      const recovered = await recoverInterruptedOcrRuns(MedicalReport, recoveredAt);
      if (recovered.fullRunCount > 0 || recovered.pageRunCount > 0) {
        console.log(`🔧 已恢复中断识别任务：完整识别 ${recovered.fullRunCount} 条，单页补提 ${recovered.pageRunCount} 条`);
      }
    } catch (e) { console.error('重置残留识别中报告失败:', e.message); }
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
