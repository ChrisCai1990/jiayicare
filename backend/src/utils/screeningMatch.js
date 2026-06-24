// ── OCR 提取项 → 专项筛查树 自动匹配引擎 ──────────────────────────────
// 输入项目名（可含 itemType），输出命中的筛查树节点 + 置信度；命中不到返回 null（→ 待归类）。
// 匹配策略：归一化精确/别名(1.0) > 归一化包含/被包含(0.7-0.85) > 不命中(null)。
// 拼音首字母匹配留待后续（需真实样本与 pinyin 词典）。

const { NODES } = require('../config/screeningTree');

// 归一化：转小写、全角转半角、去标点空格、去常见检查后缀词
function norm(s) {
  let t = String(s || '').trim().toLowerCase();
  // 全角转半角
  t = t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, '');
  // 去括号及其中内容（如「葡萄糖(空腹)」→「葡萄糖」前会先尝试完整匹配，这里作为兜底归一化）
  t = t.replace(/[（(【\[].*?[）)】\]]/g, '');
  // 去标点空格
  t = t.replace(/[\s,，。.、:：;；\/\\\-_]+/g, '');
  // 去常见无意义后缀（仅当去掉后仍≥2字时）
  const strip = t.replace(/(测定|检测|定量|半定量|分析|测量|检查|报告|结果|项目)$/g, '');
  if (strip.length >= 2) t = strip;
  return t;
}

// 预构建候选索引：每个节点的所有候选名（label + aliases）归一化
const INDEX = NODES.map(n => ({
  node: n,
  cands: [n.label, ...(n.aliases || [])].map(c => ({ raw: c, n: norm(c) })).filter(c => c.n),
}));

// 单项匹配，返回 { node, confidence } 或 null
function matchOne(rawName, itemType) {
  const q = norm(rawName);
  if (!q || q.length < 2) return null;

  let best = null; // { node, conf, candLen }
  for (const { node, cands } of INDEX) {
    for (const c of cands) {
      let conf = 0;
      if (c.n === q) {
        conf = 1.0;
      } else if (q.includes(c.n) && c.n.length >= 2) {
        // 候选名是查询的子串（如查询「肝胆胰脾彩超B超」含「肝胆胰脾超声」别名核心）→ 越长越可信
        conf = 0.78 + Math.min(0.12, c.n.length * 0.01);
      } else if (c.n.includes(q) && q.length >= 3) {
        // 查询是候选名的子串（如查询「糖化」匹配「糖化血红蛋白」）→ 需查询足够长，避免误配
        conf = 0.7 + Math.min(0.1, q.length * 0.01);
      }
      if (conf > 0) {
        // itemType 一致加分（imaging↔imaging / lab↔lab）
        if (itemType && node.itemType === itemType) conf += 0.03;
        if (!best || conf > best.conf || (conf === best.conf && c.n.length > best.candLen)) {
          best = { node, conf: Math.min(conf, 1), candLen: c.n.length };
        }
      }
    }
  }
  if (!best || best.conf < 0.6) return null;
  return { node: best.node, confidence: Math.round(best.conf * 100) / 100 };
}

// 给一条 reportItem 填充归类字段（原地返回新对象）
function classifyItem(item) {
  const m = matchOne(item.name, item.itemType);
  if (!m) {
    return { ...item, screeningKey: '', screeningCategory: '', screeningParent: '', matchStatus: 'unclassified', matchConfidence: 0 };
  }
  return {
    ...item,
    screeningKey: m.node.id,
    screeningCategory: m.node.category,
    screeningParent: m.node.parent,
    matchStatus: 'matched',
    matchConfidence: m.confidence,
  };
}

// 批量归类
function classifyItems(items) {
  return (items || []).map(classifyItem);
}

module.exports = { matchOne, classifyItem, classifyItems, norm };
