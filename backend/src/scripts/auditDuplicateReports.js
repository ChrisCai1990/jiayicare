// Read-only historical audit. Outputs report IDs only; no medical content or patient names.
// Run with MONGODB_URI and OSS credentials from the deployment environment.
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');
const { getObjectStream, urlToKey } = require('../utils/oss');
const { sha256, reportDigest } = require('../utils/reportUploadIdentity');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

async function digestStoredPage(key) {
  const object = await getObjectStream(key);
  const chunks = [];
  let size = 0;
  for await (const chunk of object.stream) {
    size += chunk.length;
    if (size > 110 * 1024 * 1024) throw new Error('原件超过审计读取上限');
    chunks.push(chunk);
  }
  return sha256(Buffer.concat(chunks));
}

async function digestReport(report) {
  const keys = report.ossKeys?.length ? report.ossKeys : report.ossKey ? [report.ossKey] : [];
  const urls = report.fileUrls?.length ? report.fileUrls : report.fileUrl ? [report.fileUrl] : [];
  const resolved = urls.map((url, index) => keys[index] || urlToKey(url));
  if (resolved.length && resolved.every(Boolean)) return reportDigest(await Promise.all(resolved.map(async key => ({ sha256: await digestStoredPage(key) }))));
  if (report.content) return reportDigest([{ sha256: sha256(Buffer.from(String(report.content).split(',').pop(), 'base64')) }]);
  return report.sourceSha256 || '';
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const rows = await MedicalReport.find({ archiveOnly: { $ne: true } })
    .select('_id user sourceSha256 fileSize fileUrl fileUrls ossKey ossKeys createdAt audit_status')
    .sort({ user: 1, createdAt: 1 }).lean();
  const bySize = new Map();
  for (const report of rows) {
    const size = Number(report.fileSize);
    if (!Number.isFinite(size) || size <= 0) continue;
    const key = `${report.user}:${size}:${report.fileUrls?.length || (report.fileUrl ? 1 : 0)}`;
    if (!bySize.has(key)) bySize.set(key, []);
    bySize.get(key).push(report);
  }
  const exactGroups = [];
  let unreadable = 0;
  for (const candidates of bySize.values()) {
    if (candidates.length < 2) continue;
    const byDigest = new Map();
    for (const candidate of candidates) {
      try {
        const digest = await digestReport(candidate);
        if (!digest) { unreadable++; continue; }
        if (!byDigest.has(digest)) byDigest.set(digest, []);
        byDigest.get(digest).push(candidate);
      } catch { unreadable++; }
    }
    for (const group of byDigest.values()) if (group.length > 1) exactGroups.push(group.map(r => ({ reportId: String(r._id), auditStatus: r.audit_status, uploadedAt: r.createdAt })));
  }
  process.stdout.write(JSON.stringify({ scanned: rows.length, exactGroups, unreadable, note: '仅读取候选；同字节之外的重拍和压缩报告仍需人工核对。' }) + '\n');
  await mongoose.disconnect();
}

main().catch(error => { process.stderr.write(`审计失败：${error.message}\n`); process.exitCode = 1; mongoose.disconnect().catch(() => {}); });
