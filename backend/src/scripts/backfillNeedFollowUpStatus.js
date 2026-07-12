/**
 * 一次性回填：修复"用户端标记仍需跟进"误写入 status=in_progress 导致的随访任务隐身。
 *
 * 背景：PATCH /api/user/followup-tasks/:id/done 里，用户选择"仍需健管专员跟进"时，
 * 代码把 status 改成了 'in_progress'，注释写的是"转入医护端待跟进队列"——但医护端
 * 工作台"待随访任务"面板（FollowUpsPanel.jsx）只查询 status='planned'，'in_progress'
 * 不在范围内，导致这些用户明确要求人工跟进的记录，反而从健管专员视野里消失
 * （2026-07-13 反馈：健管专员完全不知道该客户需要跟进）。
 *
 * 已修复代码逻辑（user.js），本脚本回填历史数据：把因这个 bug 产生的 in_progress
 * 记录改回 planned。只处理满足以下条件的（精确定位到 bug 触发场景，不动其他 in_progress
 * 用法，比如医护端手动标记"电话未接通"的场景）：
 *   1. status === 'in_progress'
 *   2. completedByUser === true（这是用户点击"完成"时才会写入的字段，医护端手动改状态不会带这个）
 *
 * 用法：
 *   node src/scripts/backfillNeedFollowUpStatus.js           # 预演（dry-run，只打印不写库）
 *   node src/scripts/backfillNeedFollowUpStatus.js --apply    # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');

  const filter = { status: 'in_progress', completedByUser: true };
  const count = await FollowUp.countDocuments(filter);
  console.log(`匹配到 ${count} 条"用户标记仍需跟进"但被误标为 in_progress 的记录`);

  if (count > 0) {
    const sample = await FollowUp.find(filter).select('patientId theme date completedByUserAt').sort({ completedByUserAt: -1 }).limit(5).lean();
    console.log('样例（最新5条）：', JSON.stringify(sample, null, 1));
  }

  if (APPLY) {
    const res = await FollowUp.updateMany(filter, { $set: { status: 'planned' } });
    console.log(`✅ 已回填 ${res.modifiedCount} 条为 planned`);
  } else {
    console.log('（预演模式，未实际写库。加 --apply 参数执行真正回填）');
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
