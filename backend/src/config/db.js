const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB 连接成功: ${conn.connection.host}`);
    // 启动自愈：进程重启会杀死正在跑的后台AI识别任务，残留的「识别中」状态需重置，避免永久卡死
    try {
      const MedicalReport = require('../models/MedicalReport');
      const r = await MedicalReport.updateMany({ aiStatus: 'processing' }, { $set: { aiStatus: 'none' } });
      if (r.modifiedCount > 0) console.log(`🔧 已重置 ${r.modifiedCount} 条残留「识别中」报告`);
    } catch (e) { console.error('重置残留识别中报告失败:', e.message); }
  } catch (error) {
    console.error('❌ MongoDB 连接失败:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
