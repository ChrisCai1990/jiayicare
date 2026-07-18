/**
 * 历史修数据：给"联系地址""紧急联系人""紧急联系电话""快递配送地址"这4道问卷题目
 * 补上正确的 archiveField，让今后新提交的答卷能自动同步写入档案。
 *
 * 背景：与"月经史"bug同一类原因——admin后台问卷编辑器有archiveField绑定入口，
 * 但运营建这4道题时没有勾选对应档案字段，导致题目本身存在、客户能填写提交，
 * 但答案只留在QuestionnaireResponse里，从未同步进User档案（影响全部客户，非个例）。
 *
 * 匹配规则：按题目文本精确关键词匹配（不用简单includes，避免"紧急联系电话"里的
 * "紧急联系"子串误撞到"紧急联系人"）。只处理 archiveField 为空的题目，已配置过的不覆盖。
 *
 * 幂等：只处理 archiveField 为空的题目。
 * 用法：
 *   node src/scripts/backfillQuestionArchiveField.js            # 预演（dry-run，只打印不写库）
 *   node src/scripts/backfillQuestionArchiveField.js --apply    # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');

const APPLY = process.argv.includes('--apply');

// 顺序敏感：更具体/更长的关键词放前面，避免短关键词提前命中导致误判
// （如"紧急联系电话"必须在"紧急联系人"之前判断，否则"紧急联系"这个子串会先被联系人的规则截胡）
const FIELD_RULES = [
  { keyword: '快递配送地址', archiveField: 'deliveryAddress' },
  { keyword: '快递地址',     archiveField: 'deliveryAddress' },
  { keyword: '紧急联系电话', archiveField: 'contactPhone2' },
  { keyword: '紧急联系人电话', archiveField: 'contactPhone2' },
  { keyword: '紧急联系人',   archiveField: 'contactName' },
  { keyword: '联系地址',     archiveField: 'address' },
];

function matchArchiveField(text) {
  if (!text) return null;
  for (const rule of FIELD_RULES) {
    if (text.includes(rule.keyword)) return rule.archiveField;
  }
  return null;
}

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
      if (q.archiveField) continue; // 已配置过的不覆盖
      const field = matchArchiveField(q.text);
      if (!field) continue;

      matchedQuestions++;
      console.log(`  [命中] 问卷"${qn.title}"(${qn._id}) 题目"${q.text}" → archiveField: '${field}'`);
      if (APPLY) {
        q.archiveField = field;
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
