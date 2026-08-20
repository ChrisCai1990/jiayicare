/**
 * 将 MedicalReport 指向 /api/uploads 的历史原件复制到私有 OSS。
 * 默认仅预览；实际写入必须显式提供 --apply、--limit 和确认环境变量。
 * 不删除/移动 uploads 中的任何源文件，可重复执行：已有 ossKey 的报告会跳过。
 */
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MedicalReport = require('../src/models/MedicalReport');
const { uploadBuffer, deleteFile } = require('../src/utils/oss');

const apply = process.argv.includes('--apply');
const limitIndex = process.argv.indexOf('--limit');
const requestedLimit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : NaN;
const limit = Number.isFinite(requestedLimit) && requestedLimit >= 1
  ? Math.min(Math.floor(requestedLimit), 100)
  : 0;
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : '';
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

if (apply && process.env.MIGRATION_CONFIRM !== 'health-file-copy-v1') {
  throw new Error('实际迁移需设置 MIGRATION_CONFIRM=health-file-copy-v1');
}
if (apply && !limit) throw new Error('实际迁移必须指定 1-100 的 --limit');

function localRelative(url) {
  if (typeof url !== 'string') return '';
  const marker = '/uploads/';
  const index = url.indexOf(marker);
  if (index < 0) return '';
  const relative = url.slice(index + marker.length).replaceAll('\\', '/');
  return relative && !relative.split('/').includes('..') ? relative : '';
}

function mimeFromPath(filePath, fallback = '') {
  if (fallback) return fallback;
  const ext = path.extname(filePath).toLowerCase();
  return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf' })[ext] || 'application/octet-stream';
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const candidates = await MedicalReport.find({
    $or: [{ fileUrl: /\/uploads\// }, { fileUrls: /\/uploads\// }],
  }).sort({ _id: 1 }).limit(limit || 20).lean();

  const result = { mode: apply ? 'apply' : 'preview', selected: candidates.length, migrated: [], skipped: [], failed: [] };
  for (const report of candidates) {
    const urls = report.fileUrls?.length ? report.fileUrls : (report.fileUrl ? [report.fileUrl] : []);
    const localIndexes = urls.map((url, index) => ({ url, index, relative: localRelative(url) })).filter(item => item.relative);
    if (!localIndexes.length) { result.skipped.push({ reportId: String(report._id), reason: 'no_local_url' }); continue; }
    const missing = localIndexes.find(item => !fs.existsSync(path.join(uploadsDir, item.relative)));
    if (missing) { result.failed.push({ reportId: String(report._id), reason: 'source_missing', relative: missing.relative }); continue; }
    if (!apply) { result.migrated.push({ reportId: String(report._id), files: localIndexes.map(item => item.relative), preview: true }); continue; }

    const uploaded = [];
    try {
      const nextUrls = [...urls];
      const nextKeys = report.ossKeys?.length ? [...report.ossKeys] : (report.ossKey ? [report.ossKey] : []);
      for (const item of localIndexes) {
        const sourcePath = path.join(uploadsDir, item.relative);
        const stored = await uploadBuffer(fs.readFileSync(sourcePath), mimeFromPath(sourcePath, report.mimeType), 'reports/legacy');
        uploaded.push(stored);
        nextUrls[item.index] = stored.url;
        nextKeys[item.index] = stored.key;
      }
      const update = { fileUrls: nextUrls, fileUrl: nextUrls[0] || '', ossKeys: nextKeys.filter(Boolean), ossKey: nextKeys[0] || '' };
      const write = await MedicalReport.updateOne({ _id: report._id, fileUrl: report.fileUrl }, { $set: update });
      if (write.modifiedCount !== 1) throw new Error('record_changed_or_not_updated');
      result.migrated.push({ reportId: String(report._id), files: localIndexes.map(item => item.relative), keys: uploaded.map(item => item.key) });
    } catch (error) {
      await Promise.all(uploaded.map(item => deleteFile(item.key)));
      result.failed.push({ reportId: String(report._id), reason: error.message });
    }
  }
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ mode: result.mode, selected: result.selected, migrated: result.migrated.length, skipped: result.skipped.length, failed: result.failed.length, outputPath: outputPath || null }));
  await mongoose.disconnect();
  if (result.failed.length) process.exitCode = 2;
}

main().catch(error => { console.error(error.message); process.exit(1); });
