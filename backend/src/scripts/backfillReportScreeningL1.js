/**
 * 一次性回填：历史报告按 type 反查同步 screeningL1，避免患者详情页分组展示分裂。
 *
 * 背景：staff.js PATCH /medical-reports/:id 已修复"编辑归类时同步 screeningL1"，但这只对
 * 之后被人工重新编辑过的报告生效。存量报告（type 已设置、screeningL1 从未被同步过）不受影响，
 * 导致同一大类下"走 screeningL1 路径"和"只有 type 字段"的报告在患者详情页分裂成两个独立分组
 * （2026-07-18 反馈：石道蓉编辑后归类合并正常，郭学清等未被编辑过的报告仍分裂）。
 *
 * 只处理满足以下条件的报告（精确定位，不动其他数据）：
 *   1. type 在 REPORT_TYPE_TO_L1_NAME 映射表内（与 staff.js 保持一致）
 *   2. screeningL1 当前为空（已有值的说明已同步过或是人工手动录入的专项筛查记录，不覆盖）
 *
 * 用法：
 *   node src/scripts/backfillReportScreeningL1.js           # 预演（dry-run，只打印不写库）
 *   node src/scripts/backfillReportScreeningL1.js --apply    # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');
const ProjectCategory = require('../models/ProjectCategory');

const APPLY = process.argv.includes('--apply');

// 与 backend/src/routes/staff.js 里的 REPORT_TYPE_TO_L1_NAME 保持一致
const REPORT_TYPE_TO_L1_NAME = {
  general_exam:   '一般检查',
  tumor:          '肿瘤筛查',
  cardiovascular: '心脑血管病筛查',
  chronic:        '慢性病筛查',
  functional:     '功能医学检测',
  gender_health:  '男性/女性健康筛查',
  home_monitor:   '居家监测+其他专项检查',
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (写库)' : 'DRY-RUN (仅预演)'}`);

  const types = Object.keys(REPORT_TYPE_TO_L1_NAME);
  const filter = {
    type: { $in: types },
    $or: [{ screeningL1: null }, { screeningL1: '' }, { screeningL1: { $exists: false } }],
  };

  const targets = await MedicalReport.find(filter).select('_id user type checkDate title').lean();
  console.log(`[backfill] 待回填报告: ${targets.length} 条`);

  // 提前查好所有需要的 L1 节点，避免循环里重复查询
  const l1NodeByName = {};
  for (const name of new Set(Object.values(REPORT_TYPE_TO_L1_NAME))) {
    const node = await ProjectCategory.findOne({ parent: null, name, status: 'active' }).select('_id').lean();
    l1NodeByName[name] = node ? String(node._id) : null;
  }
  console.log('[backfill] L1 节点映射:', JSON.stringify(l1NodeByName, null, 1));

  let updated = 0, skippedNoNode = 0;
  const byType = {};

  for (const r of targets) {
    const l1Name = REPORT_TYPE_TO_L1_NAME[r.type];
    const l1Id = l1NodeByName[l1Name];
    if (!l1Id) { skippedNoNode++; continue; }

    byType[r.type] = (byType[r.type] || 0) + 1;
    updated++;
    if (APPLY) {
      await MedicalReport.updateOne({ _id: r._id }, { $set: { screeningL1: l1Id } });
    }
  }

  console.log(`\n[backfill] 按类型统计:`, JSON.stringify(byType, null, 1));
  console.log(`[backfill] 完成：待更新 ${updated} / 找不到对应节点跳过 ${skippedNoNode} / 总 ${targets.length}`);
  if (!APPLY && updated > 0) console.log('[backfill] 这是预演，未写库。确认无误后加 --apply 实际执行。');

  await mongoose.disconnect();
}

main().catch(err => { console.error('[backfill] 失败:', err); process.exit(1); });
