// Commercial-only revision. Keeps the previous published version immutable.
// The clinical reviewer named on the prior version is retained as the reviewer
// of unchanged clinical content; sourceNote states this revision's scope.
require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../src/models/Tenant');
const SpecialtyLibrary = require('../src/models/SpecialtyLibrary');
const standard = require('../src/data/ibdStandardTemplate.json');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  const tenant = await Tenant.findOne({ code: 'jiayihui' }).lean();
  if (!tenant) throw new Error('未找到嘉医汇机构');
  const source = await SpecialtyLibrary.findOne({ tenantId: tenant._id, status: 'published', title: /IBD/ }).sort({ version: -1 }).lean();
  if (!source) throw new Error('未找到已发布 IBD 标准路径');
  if (source.serviceBoundary === standard.serviceBoundary) {
    console.log(JSON.stringify({ status: 'already-current', version: source.version, id: String(source._id) }));
    return;
  }
  if (await SpecialtyLibrary.exists({ tenantId: tenant._id, programKey: source.programKey, status: 'draft' }))
    throw new Error('已有 IBD 修订草稿，请先由管理员核对，未自动覆盖');
  const latest = await SpecialtyLibrary.findOne({ tenantId: tenant._id, programKey: source.programKey }).sort({ version: -1 }).lean();
  const nextVersion = latest.version + 1;
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ status: 'preview', sourceVersion: source.version, nextVersion,
      previousBoundary: source.serviceBoundary, newBoundary: standard.serviceBoundary }));
    return;
  }
  const fields = ['title', 'diseases', 'overview', 'roles', 'diaryGuide', 'exceptionGuide',
    'visitGuide', 'recordGuide', 'educationGuide', 'stages', 'variantGuides'];
  const copy = Object.fromEntries(fields.map(field => [field, source[field]]));
  const note = `本版仅同步业主于 2026-10-09 确认的商品商业条款：2980 元、支付后第 7 天起 12 个月、长三角和珠三角、含 2 次陪诊。临床内容沿用 v${source.version}，本次未重新进行临床审核；旧版可追溯。`;
  const item = await SpecialtyLibrary.create({ ...copy, tenantId: tenant._id, programKey: source.programKey,
    version: nextVersion, status: 'published', serviceBoundary: standard.serviceBoundary,
    sourceNote: note, clinicalReviewer: source.clinicalReviewer, clinicalReviewerId: source.clinicalReviewerId,
    publishedAt: new Date(), publishedBy: null, createdBy: null });
  console.log(JSON.stringify({ status: item.status, version: item.version, id: String(item._id), sourceVersion: source.version }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
