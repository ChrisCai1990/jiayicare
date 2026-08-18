/**
 * 只读盘点历史健康文件。默认不写 Mongo、不上传 OSS、不删除文件。
 * 生产执行：node backend/scripts/audit-health-file-storage.js --output /tmp/health-file-audit.json
 */
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MedicalReport = require('../src/models/MedicalReport');

const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : '';

function localRelative(url) {
  if (typeof url !== 'string') return '';
  const marker = '/uploads/';
  const index = url.indexOf(marker);
  if (index < 0) return '';
  const relative = url.slice(index + marker.length).replaceAll('\\', '/');
  return relative && !relative.split('/').includes('..') ? relative : '';
}

function walk(dir, root, result) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, result);
    else if (entry.isFile()) {
      const stat = fs.statSync(full);
      result.set(path.relative(root, full).replaceAll('\\', '/'), stat.size);
    }
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const files = new Map();
  if (fs.existsSync(uploadsDir)) walk(uploadsDir, uploadsDir, files);

  const references = new Map();
  const cursor = MedicalReport.find({}).select('_id fileUrl fileUrls ossKey ossKeys content').lean().cursor();
  let reportCount = 0;
  for await (const report of cursor) {
    reportCount++;
    const urls = report.fileUrls?.length ? report.fileUrls : (report.fileUrl ? [report.fileUrl] : []);
    urls.forEach((url, index) => {
      const relative = localRelative(url);
      if (!relative) return;
      const list = references.get(relative) || [];
      list.push({ reportId: String(report._id), index });
      references.set(relative, list);
    });
  }

  const missing = [];
  let referencedBytes = 0;
  for (const [relative, refs] of references) {
    const size = files.get(relative);
    if (size === undefined) missing.push({ relative, references: refs });
    else referencedBytes += size;
  }
  const unreferenced = [...files.entries()].filter(([relative]) => !references.has(relative));
  const report = {
    generatedAt: new Date().toISOString(),
    uploadsDir,
    medicalReportsScanned: reportCount,
    localFiles: files.size,
    localBytes: [...files.values()].reduce((sum, size) => sum + size, 0),
    localReferences: references.size,
    referencedBytes,
    missingReferencedFiles: missing,
    unreferencedFiles: unreferenced.map(([relative, size]) => ({ relative, size })),
  };
  const serialized = JSON.stringify(report, null, 2);
  if (outputPath) fs.writeFileSync(outputPath, serialized);
  console.log(JSON.stringify({
    medicalReportsScanned: report.medicalReportsScanned,
    localFiles: report.localFiles,
    localReferences: report.localReferences,
    missingReferencedFiles: missing.length,
    unreferencedFiles: unreferenced.length,
    outputPath: outputPath || null,
  }));
  await mongoose.disconnect();
}

main().catch(error => { console.error(error.message); process.exit(1); });
