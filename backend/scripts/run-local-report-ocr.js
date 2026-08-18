#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function fail(message) {
  console.error(`[local-ocr] ${message}`);
  process.exitCode = 2;
}

function assertLocalMongo(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('MONGODB_URI 无效');
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error(`拒绝连接非本地 MongoDB：${parsed.hostname}`);
  }
  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('MONGODB_URI 必须指定本地数据库名');
  }
}

async function main() {
  const reportId = process.argv[2];
  if (!reportId || !mongoose.isValidObjectId(reportId)) {
    throw new Error('用法：node scripts/run-local-report-ocr.js <本地报告ID>');
  }

  const mongoUri = String(process.env.MONGODB_URI || '');
  assertLocalMongo(mongoUri);
  if (!String(process.env.QWEN_API_KEY || '').trim()) {
    throw new Error('backend/.env 中的 QWEN_API_KEY 尚未配置，未启动 OCR，也未修改报告');
  }

  await mongoose.connect(mongoUri);
  const MedicalReport = require('../src/models/MedicalReport');
  const report = await MedicalReport.findById(reportId).lean();
  if (!report) throw new Error('本地报告不存在');
  if (!String(report.fileUrl || '').startsWith('/uploads/')) {
    throw new Error('拒绝解析非本地 uploads 报告');
  }

  const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
  const relativeFile = String(report.fileUrl).replace(/^\/uploads\//, '');
  const localFile = path.resolve(uploadsDir, relativeFile);
  if (!localFile.startsWith(`${uploadsDir}${path.sep}`) || !fs.existsSync(localFile)) {
    throw new Error('报告原件不在项目本地 uploads 目录');
  }

  const staffRouter = require('../src/routes/staff');
  console.log(`[local-ocr] 开始：${report.title} (${reportId})`);
  await staffRouter.runReportParse(reportId);

  const parsed = await MedicalReport.findById(reportId)
    .select('aiStatus ocrVersion ocrTemplateId ocrQualitySummary reportItems')
    .lean();
  console.log(JSON.stringify({
    reportId,
    aiStatus: parsed.aiStatus,
    ocrVersion: parsed.ocrVersion,
    templateId: parsed.ocrTemplateId,
    quality: parsed.ocrQualitySummary,
    itemCount: parsed.reportItems?.length || 0,
  }, null, 2));
}

main()
  .catch(error => fail(error.message))
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
