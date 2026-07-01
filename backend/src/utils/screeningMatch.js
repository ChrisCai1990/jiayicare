// ── OCR 提取项 → 专项筛查树 自动匹配引擎 ──────────────────────────────
// 输入项目名（可含 itemType），输出命中的所有筛查树节点；命中不到返回空数组。
// 匹配策略：归一化精确/别名(1.0) > 归一化包含/被包含(0.7-0.85)，阈值 0.6。
// 一条检查项可同时归属多个类目（如「腹部超声」→ 肝癌早筛 + 胰腺-胆囊癌早筛）。

const { NODES } = require('../config/screeningTree');

// 归一化：转小写、全角转半角、去标点空格、去常见检查后缀词
function norm(s) {
  let t = String(s || '').trim().toLowerCase();
  // 全角转半角
  t = t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, '');
  // 去括号及其中内容（如「葡萄糖(空腹)」→「葡萄糖」）
  t = t.replace(/[（(【\[].*?[）)】\]]/g, '');
  // 去「·数值单位」模式（OCR有时把数值拼入名称，如「癌胚抗原·1.6ng/ml」→「癌胚抗原」）
  t = t.replace(/[·•]\s*[\d.]+\s*[a-z%μ\/℃°]+[\w\/]*\s*$/i, '');
  // 去标点空格（含中点·）
  t = t.replace(/[\s,，。.、:：;；\/\\\-_·•]+/g, '');
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

// 单节点匹配，返回该节点的最高置信度（0=不命中）
function scoreNode(q, itemType, cands, node) {
  // 呼气试验类项目常因OCR把"碳13/碳14"识别丢字符（如"碳尿素呼气试验"），
  // 但仍必须只匹配"呼气"类节点，禁止被"尿素"等通用别名误配到肾功能等无关节点
  if (q.includes('呼气') && !cands.some(c => c.n.includes('呼气'))) return 0;
  let best = 0;
  for (const c of cands) {
    let conf = 0;
    if (c.n === q) {
      conf = 1.0;
    } else if (q.includes(c.n) && c.n.length >= 2) {
      conf = 0.78 + Math.min(0.12, c.n.length * 0.01);
    } else if (c.n.includes(q) && q.length >= 3) {
      // 候选词比查询词长很多（含独立修饰词）时降低置信度，防止"葡萄糖"误命中"葡萄糖耐量试验"
      const surplus = c.n.replace(q, '');
      const hasQualifier = /耐量|试验|负荷|载量|综合|全套|联合|系列|组合/.test(surplus);
      conf = hasQualifier ? 0.45 : 0.7 + Math.min(0.1, q.length * 0.01);
    }
    if (conf > 0) {
      if (itemType && node.itemType === itemType) conf += 0.03;
      conf = Math.min(conf, 1);
      if (conf > best) best = conf;
    }
  }
  return best;
}

// 多节点匹配：返回所有置信度 >= 阈值的节点，按置信度降序排列
// excludeCategories: 排除某些分类（如 hp 功能医学检测不从普通体检报告自动归类）
function matchAll(rawName, itemType, threshold = 0.6, excludeCategories = ['hp']) {
  const q = norm(rawName);
  if (!q || q.length < 2) return [];

  const results = [];
  for (const { node, cands } of INDEX) {
    if (excludeCategories.includes(node.category)) continue;
    const conf = scoreNode(q, itemType, cands, node);
    if (conf >= threshold) {
      results.push({ node, confidence: Math.round(conf * 100) / 100 });
    }
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// 给一条 reportItem 填充归类字段（支持多类目，screeningKeys 为数组）
function classifyItem(item) {
  const matches = matchAll(item.name, item.itemType);
  if (!matches.length) {
    return {
      ...item,
      screeningKeys: [],
      screeningKey: '',        // 向后兼容：保留最佳单值
      screeningCategory: '',
      screeningParent: '',
      matchStatus: 'unclassified',
      matchConfidence: 0,
    };
  }
  const best = matches[0];
  return {
    ...item,
    screeningKeys: matches.map(m => m.node.id),  // 所有命中节点 id 数组
    screeningKey: best.node.id,                   // 向后兼容：最佳命中
    screeningCategory: best.node.category,
    screeningParent: best.node.parent,
    matchStatus: 'matched',
    matchConfidence: best.confidence,
  };
}

// 批量归类
function classifyItems(items) {
  return (items || []).map(classifyItem);
}

module.exports = { matchAll, matchOne: (n, t) => { const r = matchAll(n, t); return r[0] || null; }, classifyItem, classifyItems, norm };
