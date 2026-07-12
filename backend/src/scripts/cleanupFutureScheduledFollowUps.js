/**
 * 一次性清理：删除超出滚动窗口、尚未经医护审核的自动生成随访占位。
 *
 * 背景：annualPlanFollowUps.js 此前会一次性预生成未来365天的"日常监测/季度评估"占位，
 * 单个客户能堆到几百条，把真实/已完成的随访记录挤到分页后面（2026-07-13 反馈）。
 * 已把生成逻辑改为滚动窗口（HORIZON_DAYS=30，见 annualPlanFollowUps.js），
 * 但历史已生成的存量占位数据不会自动清理，需要本脚本一次性处理。
 *
 * 只删除同时满足以下条件的记录（宁缺毋滥，不动任何有人工介入痕迹的数据）：
 *   1. sourceType === 'scheduled'（系统自动生成的占位，非人工创建）
 *   2. aiStatus === 'pending'（医护还未审核过；一旦审核/编辑过 aiStatus 会变，不再命中）
 *   3. date > 今天 + HORIZON_DAYS 天（超出新的滚动窗口范围）
 *
 * 用法：
 *   node src/scripts/cleanupFutureScheduledFollowUps.js           # 预演（dry-run，只打印不写库）
 *   node src/scripts/cleanupFutureScheduledFollowUps.js --apply    # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

const APPLY = process.argv.includes('--apply');
const HORIZON_DAYS = 30;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');

  const horizonEnd = new Date(Date.now() + HORIZON_DAYS * 86400000);
  const filter = {
    sourceType: 'scheduled',
    aiStatus: 'pending',
    date: { $gt: horizonEnd },
  };

  const count = await FollowUp.countDocuments(filter);
  console.log(`匹配到 ${count} 条超出未来${HORIZON_DAYS}天窗口、未审核的自动占位记录`);

  if (count > 0) {
    const sample = await FollowUp.find(filter).select('patientId theme date').sort({ date: -1 }).limit(5).lean();
    console.log('样例（最新5条）：', JSON.stringify(sample, null, 1));
  }

  if (APPLY) {
    const res = await FollowUp.deleteMany(filter);
    console.log(`✅ 已删除 ${res.deletedCount} 条`);
  } else {
    console.log('（预演模式，未实际删除。加 --apply 参数执行真正删除）');
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
