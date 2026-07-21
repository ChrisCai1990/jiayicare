/**
 * 一次性修数据：把历史上"aiStatus已确认(reviewed)但audit_status还没跟进"的报告批量补齐，
 * 与2026-07-21新逻辑（确认AI结果即视为健管专员审核通过）保持一致。
 *
 * 背景：audit_status（健管审核）和aiStatus（AI结果确认）是两套先后独立引入、从未真正整合
 * 的字段。此前健管专员要分别在两个弹窗各点一次才能都完成，很多历史报告只走完了"确认AI结果"
 * 这一步，audit_status还停留在unaudited，导致这些报告一直没有真正进入家庭医生双审队列。
 *
 * 处理范围：aiStatus='reviewed' 且 audit_status!='audited'（不含rejected——被明确驳回过的
 * 报告仍需人工重新走一遍审核，不能自动判定通过）。
 *
 * 用法：
 *   node src/scripts/backfillMergedAudit.js            # 预演（dry-run，只打印不写库）
 *   node src/scripts/backfillMergedAudit.js --apply     # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare';
  await mongoose.connect(uri);
  console.log(`[backfill] connected: ${uri}`);
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (写库)' : 'DRY-RUN (仅预演)'}`);

  const reports = await MedicalReport.find({
    aiStatus: 'reviewed',
    audit_status: { $ne: 'audited' },
  }).populate('user', 'name');

  console.log(`[backfill] 待补齐报告: ${reports.length} 份`);

  let fixed = 0;
  for (const report of reports) {
    console.log(`  [补齐] ${report.user?.name || '未知'} 《${report.title}》 audit_status: ${report.audit_status} → audited`);
    fixed++;
    if (APPLY) {
      report.audit_status = 'audited';
      report.audited_by = report.audited_by || '系统批量补齐(历史数据迁移)';
      report.audited_at = report.audited_at || new Date();
      report.staffAuditSnapshot = report.staffAuditSnapshot?.snapshotAt
        ? report.staffAuditSnapshot
        : { reportItems: report.reportItems, snapshotAt: new Date() };
      // 已有 familyDoctorAudit 字段（哪怕是pending默认值）就不覆盖，避免误清空可能已存在的医生审核进度
      if (!report.familyDoctorAudit || !report.familyDoctorAudit.status) {
        report.familyDoctorAudit = { status: 'pending', by: null, byName: '', at: null, editLog: [] };
      }
      await report.save();
    }
  }

  console.log(`\n[backfill] 完成：${fixed} 份报告${APPLY ? '已更新' : '待更新（预演）'}`);
  if (!APPLY && fixed > 0) console.log('[backfill] 这是预演，未写库。确认无误后加 --apply 实际执行。');

  await mongoose.disconnect();
}

main().catch(err => { console.error('[backfill] 失败:', err); process.exit(1); });
