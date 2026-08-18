/**
 * 清理超过保留期、且未被 MedicalReport 引用的医护端临时报告原件。
 *
 * 默认仅预演。实际删除同时要求 --apply、显式 --limit 和确认环境变量：
 *   node src/scripts/cleanup-temporary-report-uploads.js --limit=100
 *   $env:REPORT_UPLOAD_CLEANUP_CONFIRM='temporary-report-upload-cleanup-v1'
 *   node src/scripts/cleanup-temporary-report-uploads.js --apply --limit=100
 *
 * 登记记录不会物理删除：已引用对象改为 attached，已回收对象改为 deleted，失败留痕后可重试。
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');
const TemporaryReportUpload = require('../models/TemporaryReportUpload');
const { deleteFileStrict } = require('../utils/oss');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(1000, Number(limitArg?.split('=')[1] || 100)));
const CONFIRMATION = 'temporary-report-upload-cleanup-v1';
const reclaimableStatuses = ['temporary', 'attaching', 'deleting', 'cleanup_failed'];

async function main() {
  if (APPLY && !limitArg) throw new Error('实际清理必须显式提供 --limit=N（最大 1000）');
  if (APPLY && process.env.REPORT_UPLOAD_CLEANUP_CONFIRM !== CONFIRMATION) {
    throw new Error(`实际清理需设置 REPORT_UPLOAD_CLEANUP_CONFIRM=${CONFIRMATION}`);
  }
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');
  console.log(`[cleanup-temporary-report-uploads] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} limit=${limit}`);

  const candidates = await TemporaryReportUpload.find({
    status: { $in: reclaimableStatuses },
    expiresAt: { $lte: new Date() },
  }).sort({ expiresAt: 1 }).limit(limit).lean();

  let referenced = 0;
  let removable = 0;
  let removed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const report = await MedicalReport.findOne({
      $or: [{ ossKey: candidate.ossKey }, { ossKeys: candidate.ossKey }],
    }).select('_id').lean();
    if (report) {
      referenced++;
      if (APPLY) {
        await TemporaryReportUpload.updateOne(
          { _id: candidate._id, status: { $in: reclaimableStatuses } },
          { $set: { status: 'attached', attachAttemptId: '', reportId: report._id, attachedAt: new Date(), cleanupError: '' } },
        );
      }
      continue;
    }

    removable++;
    if (!APPLY) continue;
    const claimed = await TemporaryReportUpload.findOneAndUpdate(
      { _id: candidate._id, status: { $in: reclaimableStatuses }, expiresAt: { $lte: new Date() } },
      { $set: { status: 'deleting', attachAttemptId: '', cleanupError: '' } },
      { new: true },
    );
    if (!claimed) continue;
    // 抢占后再查一次，覆盖建档与清理脚本并发的极窄窗口。
    const lateReference = await MedicalReport.findOne({
      $or: [{ ossKey: claimed.ossKey }, { ossKeys: claimed.ossKey }],
    }).select('_id').lean();
    if (lateReference) {
      referenced++;
      removable--;
      await TemporaryReportUpload.updateOne(
        { _id: claimed._id, status: 'deleting' },
        { $set: { status: 'attached', attachAttemptId: '', reportId: lateReference._id, attachedAt: new Date(), cleanupError: '' } },
      );
      continue;
    }
    try {
      await deleteFileStrict(claimed.ossKey);
      await TemporaryReportUpload.updateOne(
        { _id: claimed._id, status: 'deleting' },
        { $set: { status: 'deleted', deletedAt: new Date(), cleanupError: '' } },
      );
      removed++;
    } catch (error) {
      failed++;
      await TemporaryReportUpload.updateOne(
        { _id: claimed._id, status: 'deleting' },
        { $set: { status: 'cleanup_failed', cleanupError: String(error.message || 'OSS delete failed').slice(0, 500) } },
      );
    }
  }

  console.log(JSON.stringify({ scanned: candidates.length, referenced, removable, removed, failed }, null, 2));
  if (!APPLY && candidates.length) console.log('[cleanup-temporary-report-uploads] 仅预演，未修改数据库或 OSS。');
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
