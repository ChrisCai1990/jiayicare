/**
 * 历史修数据：给已创建的"月经史""生育史"等女性专属问卷题目补上 genderOnly='女'。
 *
 * 背景：admin 后台问卷编辑器此前没有"性别限定"这个配置入口（已于本次一并补上），
 * 导致运营创建"月经史""生育史"这类题目时 genderOnly 始终是默认空值（对所有性别可见且必填），
 * 造成男性用户在健康问卷里也被要求填写月经史。
 *
 * 匹配规则：题目文本命中关键词（月经、生育、孕产、痛经、绝经、避孕、宫、卵巢、妊娠）且当前
 * genderOnly 为空，才会被标记为 genderOnly='女'。命中"其他/备注"类模糊题目宁可漏改，不误改。
 *
 * 幂等：只处理 genderOnly 为空的题目，已手动设置过的不会被覆盖。
 * 用法：
 *   node src/scripts/backfillQuestionGenderOnly.js            # 预演（dry-run，只打印不写库）
 *   node src/scripts/backfillQuestionGenderOnly.js --apply    # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');

const APPLY = process.argv.includes('--apply');
const FEMALE_KEYWORDS = ['月经', '生育史', '孕产', '痛经', '绝经', '避孕', '妊娠', '产后', '宫颈', '卵巢', '子宫'];

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare';
  await mongoose.connect(uri);
  console.log(`[backfill] connected: ${uri}`);
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (写库)' : 'DRY-RUN (仅预演)'}`);

  const questionnaires = await DynamicQuestionnaire.find({ deletedAt: null });
  console.log(`[backfill] 待检查问卷: ${questionnaires.length} 份`);

  let matchedQuestionnaires = 0, matchedQuestions = 0;

  for (const qn of questionnaires) {
    let touched = false;
    for (const q of qn.questions) {
      if (q.genderOnly) continue; // 已手动设置过的不覆盖
      const hit = FEMALE_KEYWORDS.some(kw => q.text && q.text.includes(kw));
      if (!hit) continue;

      matchedQuestions++;
      console.log(`  [命中] 问卷"${qn.title}"(${qn._id}) 题目"${q.text}" → genderOnly: '女'`);
      if (APPLY) {
        q.genderOnly = '女';
        touched = true;
      }
    }
    if (touched) {
      await qn.save();
      matchedQuestionnaires++;
    }
  }

  console.log(`\n[backfill] 完成：命中题目 ${matchedQuestions} 条，涉及问卷 ${matchedQuestionnaires} 份`);
  if (!APPLY && matchedQuestions > 0) console.log('[backfill] 这是预演，未写库。确认无误后加 --apply 实际执行。');

  await mongoose.disconnect();
}

main().catch(err => { console.error('[backfill] 失败:', err); process.exit(1); });
