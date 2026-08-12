/**
 * 把真实报告中已确认的项目写法加入 Admin 分类别名。默认仅预演；--apply 才写库。
 * 归类引擎仍只读取 Admin 分类目录并做精确匹配，不在代码中推断医学归属。
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ProjectCategory = require('../models/ProjectCategory');
const { REPORT_CLASSIFICATION_ALIASES, CATEGORY_NAME_PATTERNS } = require('../utils/reportClassificationAliases');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');
  console.log(`[classification-aliases] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  let changed = 0;
  for (const [name, aliases] of Object.entries(REPORT_CLASSIFICATION_ALIASES)) {
    let categories = await ProjectCategory.find({ name, status: 'active' });
    if (!categories.length && CATEGORY_NAME_PATTERNS[name]) {
      categories = await ProjectCategory.find({ name: CATEGORY_NAME_PATTERNS[name], status: 'active' });
    }
    if (categories.length !== 1) throw new Error(`分类“${name}”匹配到${categories.length}项：${categories.map(item => item.name).join('、') || '无'}`);
    const [category] = categories;
    const current = new Set((category.aliases || []).map(value => String(value).trim()).filter(Boolean));
    const missing = aliases.filter(alias => !current.has(alias));
    console.log(`${name}: ${missing.length ? `新增 ${missing.join('、')}` : '无需更新'}`);
    if (missing.length && APPLY) {
      await ProjectCategory.updateOne({ _id: category._id }, { $addToSet: { aliases: { $each: missing } } });
    }
    changed += missing.length;
  }
  console.log(`[classification-aliases] ${APPLY ? '已写入' : '待写入'} ${changed} 个别名`);
  await mongoose.disconnect();
}

main().catch(error => { console.error('[classification-aliases] failed:', error); process.exit(1); });
