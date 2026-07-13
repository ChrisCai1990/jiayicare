// ── 问卷答卷 → 健康档案 自动导入引擎 ──────────────────────────────────
// 依据每题绑定的 archiveField，把答案归一化为档案字段值。
// 归一化是确定性规则（多选拼数组/文本、量表与矩阵转文本、"无"过滤），无需调用大模型，稳定可控。
// 无冲突字段（档案里原本为空，或与新答案一致）自动写入档案；仅当新答案与档案已有值冲突时才生成待审核草稿。

const { FIELD_MAP } = require('../config/archiveFields');

// 读取 user 上指定 path 的现有值（支持一层嵌套 a.b）
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
  return cur;
}

// 把任意答案转成可读文本
function answerToText(ans) {
  if (ans == null) return '';
  if (Array.isArray(ans)) return ans.filter(x => x && x !== '无').join('、');
  if (typeof ans === 'object') {
    // 多选+备注题型：{values:[选中的选项...], inputs:{选项名: 用户填的具体备注文本}}
    // 与用户端问卷汇总页 QuestionnaireScreen.js 的 fmtAns 保持同一套解析规则，
    // 此前只认单数 {value,input}，真实数据是复数 {values,inputs}，导致命中不到，
    // 掉进下面的"矩阵"兜底分支，把 inputs 对象直接字符串化成了 [object Object]
    // （2026-07-13 反馈：医护端审核过敏史/家族史/既往史时看到 "inputs：[object Object]"）
    if (Array.isArray(ans.values)) {
      const inputsStr = Object.entries(ans.inputs || {}).map(([k, v]) => `${k}：${v}`).join('，');
      return ans.values.filter(x => x && x !== '无').join('、') + (inputsStr ? `（${inputsStr}）` : '');
    }
    if (ans.value !== undefined) {
      // 单选+备注题型：{value:'其他', inputs:{'其他':'具体内容'}} 或旧结构 {value,input}
      const inputsStr = Object.entries(ans.inputs || {}).map(([k, v]) => `${k}：${v}`).join('，');
      return [ans.value, inputsStr ? `（${inputsStr}）` : ans.input].filter(Boolean).join(' ').trim();
    }
    // matrix：{行: 列}
    return Object.entries(ans).map(([k, v]) => `${k}：${Array.isArray(v) ? v.join('/') : v}`).join('；');
  }
  return String(ans).trim();
}

// 依据字段类型归一化答案 → 写入值
function normalizeValue(fieldDef, ans) {
  if (fieldDef.type === 'array') {
    if (Array.isArray(ans)) return ans.filter(x => x && x !== '无');
    const t = answerToText(ans);
    return t ? t.split(/[、,，;；]/).map(s => s.trim()).filter(Boolean) : [];
  }
  if (fieldDef.type === 'number') {
    const n = parseFloat(String(answerToText(ans)).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? '' : n;
  }
  // text / enum / date → 文本
  return answerToText(ans);
}

// 生成档案导入条目（不写库，仅返回结构），并按是否与档案已有值冲突分为 autoItems / conflictItems
function buildArchiveDraft(user, questionnaire, response) {
  const answers = (response && response.answers) || {};
  const items = [];
  for (const q of (questionnaire.questions || [])) {
    if (!q.archiveField) continue;
    const def = FIELD_MAP[q.archiveField];
    if (!def) continue;
    const ans = answers[q.id];
    if (ans === undefined || ans === '' || (Array.isArray(ans) && ans.length === 0)) continue; // 未答跳过
    const value = normalizeValue(def, ans);
    if ((Array.isArray(value) && value.length === 0) || value === '') continue;

    const existing = getByPath(user, def.path);
    const existingStr = Array.isArray(existing) ? existing.join('、') : (existing == null ? '' : String(existing));
    const valueStr = Array.isArray(value) ? value.join('、') : String(value);
    items.push({
      path: def.path, label: def.label, group: def.group, fieldType: def.type,
      questionId: q.id, questionText: q.text, answer: ans,
      value, valueStr, existing: existingStr,
      conflict: !!(existingStr && existingStr !== valueStr),
    });
  }
  const autoItems = items.filter(it => !it.conflict);
  const conflictItems = items.filter(it => it.conflict);
  return {
    generatedAt: new Date(),
    questionnaireId: questionnaire._id,
    questionnaireTitle: questionnaire.title || '',
    responseId: response ? response._id : null,
    status: 'pending',
    items, // 兼容旧字段：全部条目
    autoItems,
    conflictItems,
  };
}

module.exports = { buildArchiveDraft, normalizeValue, answerToText, getByPath };
