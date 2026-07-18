/**
 * 历史修数据：把已提交问卷里"联系地址/紧急联系人/紧急联系电话/快递配送地址"的
 * 原始答案，补写回 User 档案对应字段。
 *
 * 背景：这4道题此前未绑定archiveField（见 backfillQuestionArchiveField.js），
 * 导致所有历史客户提交问卷时这4项答案只留在 QuestionnaireResponse.answers 里，
 * 从未同步进档案。先跑 backfillQuestionArchiveField.js --apply 补好题目配置后，
 * 再跑本脚本把已提交的历史答卷"补一次账"。
 *
 * 处理逻辑（复用 archiveImport.js 的归一化/冲突判断，保证口径与实时写入逻辑一致）：
 *   1. 按 (patient, questionnaire) 只取该客户提交时间最新的一份答卷（避免用旧答卷覆盖新数据）
 *   2. 按题目文本关键词定位这4道题在各问卷模板里的 question.id
 *   3. 取出答案，归一化成文本
 *   4. 仅当 User 对应字段当前为空时才写入——不覆盖客户后续手动改过的最新值
 *
 * 幂等：只处理档案字段当前为空的用户，重复运行不会覆盖已有值。
 * 用法：
 *   node src/scripts/backfillArchiveContactFields.js            # 预演（dry-run，只打印不写库）
 *   node src/scripts/backfillArchiveContactFields.js --apply    # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const { normalizeValue, answerToText, getByPath } = require('../utils/archiveImport');
const { FIELD_MAP } = require('../config/archiveFields');

const APPLY = process.argv.includes('--apply');

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

  const questionnaires = await DynamicQuestionnaire.find({ deletedAt: null }).lean();
  // 问卷id → { questionId: archiveField } 映射，只保留这4类题目命中的
  const qnFieldMap = new Map();
  for (const qn of questionnaires) {
    const map = {};
    for (const q of (qn.questions || [])) {
      const field = matchArchiveField(q.text);
      if (field) map[q.id] = field;
    }
    if (Object.keys(map).length) qnFieldMap.set(String(qn._id), map);
  }
  console.log(`[backfill] 命中相关题目的问卷: ${qnFieldMap.size} 份`);

  if (qnFieldMap.size === 0) {
    console.log('[backfill] 没有问卷命中这4类题目，可能需要先跑 backfillQuestionArchiveField.js --apply');
    await mongoose.disconnect();
    return;
  }

  // 按患者+问卷分组，只取最新一份答卷
  const responses = await QuestionnaireResponse.find({
    questionnaire: { $in: [...qnFieldMap.keys()].map(id => new mongoose.Types.ObjectId(id)) },
  }).sort({ submittedAt: -1 }).lean();

  const latestByPatientQn = new Map(); // `${userId}_${qnId}` → response
  for (const r of responses) {
    const key = `${r.user}_${r.questionnaire}`;
    if (!latestByPatientQn.has(key)) latestByPatientQn.set(key, r);
  }
  console.log(`[backfill] 待检查答卷（患者+问卷去重后）: ${latestByPatientQn.size} 份`);

  let checkedUsers = 0, updatedUsers = 0, updatedFields = 0;
  const touchedUserIds = new Set();

  for (const response of latestByPatientQn.values()) {
    const fieldMap = qnFieldMap.get(String(response.questionnaire));
    if (!fieldMap) continue;
    const userId = String(response.user);
    if (touchedUserIds.has(userId)) continue; // 一个用户只处理一次（多份问卷时以第一次命中为准）

    const user = await User.findById(userId);
    if (!user) continue;
    checkedUsers++;

    const updates = {};
    for (const [questionId, archiveField] of Object.entries(fieldMap)) {
      const ans = response.answers?.[questionId];
      if (ans === undefined || ans === '') continue;
      const def = FIELD_MAP[archiveField];
      if (!def) continue;
      const value = normalizeValue(def, ans);
      if (value === '' || (Array.isArray(value) && value.length === 0)) continue;

      const existing = getByPath(user, def.path);
      const existingStr = existing == null ? '' : String(existing);
      if (existingStr) continue; // 档案已有值，不覆盖

      updates[def.path] = value;
    }

    if (Object.keys(updates).length === 0) continue;

    touchedUserIds.add(userId);
    updatedUsers++;
    updatedFields += Object.keys(updates).length;
    console.log(`  [补录] 用户 ${user.name || userId}(${userId})：${JSON.stringify(updates)}`);

    if (APPLY) {
      await User.collection.updateOne({ _id: user._id }, { $set: updates });
    }
  }

  console.log(`\n[backfill] 完成：检查用户 ${checkedUsers} 个，补录 ${updatedUsers} 个用户共 ${updatedFields} 个字段`);
  if (!APPLY && updatedUsers > 0) console.log('[backfill] 这是预演，未写库。确认无误后加 --apply 实际执行。');

  await mongoose.disconnect();
}

main().catch(err => { console.error('[backfill] 失败:', err); process.exit(1); });
