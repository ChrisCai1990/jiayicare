// ── OCR 提取项 → 专项筛查分类 自动匹配引擎 ──────────────────────────────
// 输入项目名（可含 itemType），输出命中的所有分类节点；命中不到返回空数组。
// 匹配策略：归一化精确/别名(1.0) > 归一化包含/被包含(0.7-0.85)，阈值 0.6。
// 一条检查项可同时归属多个类目（如「腹部超声」→ 肝癌早筛 + 胰腺-胆囊癌早筛）。
//
// 2026-07-01起：分类源改为 admin 后台「分类管理」（ProjectCategory 自引用树），
// 不再用写死的 backend/src/config/screeningTree.js（该文件仅作 admin 数据异常时的兜底）。
// key 格式统一为 `<L1的_id>|<L2名字>|<叶子节点名字>`，与医护端"录入筛查结果"手工录入时
// screeningL1 用的 _id 格式一致，两条入口（AI自动 / 人工录入）产出的 key 可以互认、去重。

const { NODES } = require('../config/screeningTree');
const ProjectCategory = require('../models/ProjectCategory');

// 归一化：转小写、全角转半角、去标点空格、去常见检查后缀词
function norm(s) {
  let t = String(s || '').trim().toLowerCase();
  // 全角转半角
  t = t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, '');
  // 去括号，但括号内是1-3位字母/数字代码（如「脂蛋白(a)」「维生素D(25-羟)」的"a"/"25"）时，
  // 只去括号本身、保留内容——这类代码往往是区分不同检验项目的关键标识，整体删掉会导致
  // 「脂蛋白(a)」退化成「脂蛋白」这种过短的通用词，进而被其他所有含"脂蛋白"的血脂项目误配。
  // 括号内是较长说明文字（如「葡萄糖(空腹)」的"空腹"）时仍整体删除，不影响原有效果。
  t = t.replace(/[（(【\[]([^）)】\]]*?)[）)】\]]/g, (m, inner) => /^[a-z0-9]{1,3}$/i.test(inner) ? inner : '');
  // 去「·数值单位」模式（OCR有时把数值拼入名称，如「癌胚抗原·1.6ng/ml」→「癌胚抗原」）
  t = t.replace(/[·•]\s*[\d.]+\s*[a-z%μ\/℃°]+[\w\/]*\s*$/i, '');
  // 去标点空格（含中点·）
  t = t.replace(/[\s,，。.、:：;；\/\\\-_·•]+/g, '');
  // 去常见无意义后缀（仅当去掉后仍≥2字时）
  const strip = t.replace(/(测定|检测|定量|半定量|分析|测量|检查|报告|结果|项目)$/g, '');
  if (strip.length >= 2) t = strip;
  return t;
}

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
      // 候选词"脂蛋白a"是"载脂蛋白A1"的子串，但"载脂蛋白"是完全不同的检验项目——"载"这个前缀降权；
      // 2026-07-02补充："糖化血红蛋白测定"包含候选词"血红蛋白"，剩余"糖化测定"里的"糖化"同样是
      // 独立限定词，说明整个词是完全不同的检验项目(糖化血红蛋白≠血红蛋白)，复用跟branch2一致的
      // 限定词判断标准，而不是只针对"载"这一个前缀，避免同类误配的其他变体继续漏网。
      const qSurplus = q.replace(c.n, '');
      const qHasQualifier = /^载|糖化|耐量|尿微量|微量|肌酐/.test(qSurplus);
      conf = qHasQualifier ? 0.45 : 0.78 + Math.min(0.12, c.n.length * 0.01);
    } else if (c.n.includes(q) && q.length >= 3) {
      // 候选词比查询词长很多（含独立修饰词）时降低置信度，防止"葡萄糖"误命中"葡萄糖耐量试验"，
      // 也防止"球蛋白"误命中"甲状腺球蛋白"、"血红蛋白"误命中"糖化血红蛋白(组套)"、
      // "白蛋白"误命中"尿微量白蛋白/肌酐"这类短词是长词子串、但实际是完全不同检验项目的情况
      const surplus = c.n.replace(q, '');
      const hasQualifier = /耐量|试验|负荷|载量|综合|全套|联合|系列|组合|组套|甲状腺|糖化|尿微量|微量|肌酐/.test(surplus);
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

// 把 {node, aliases} 列表编译成可匹配的 INDEX（node 需含 label/aliases/category/parent/id/itemType）
function buildIndex(nodes) {
  return nodes.map(n => ({
    node: n,
    cands: [n.label, ...(n.aliases || [])].map(c => ({ raw: c, n: norm(c) })).filter(c => c.n),
  }));
}

// 通用匹配：给定任意 index，返回所有置信度 >= 阈值的节点，按置信度降序排列
function matchAllWithIndex(rawName, itemType, index, threshold = 0.6, excludeCategories = []) {
  const q = norm(rawName);
  if (!q || q.length < 2) return [];
  const results = [];
  for (const { node, cands } of index) {
    if (excludeCategories.includes(node.category)) continue;
    const conf = scoreNode(q, itemType, cands, node);
    if (conf >= threshold) results.push({ node, confidence: Math.round(conf * 100) / 100 });
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// ── 旧版：静态 screeningTree.js 索引（仅在 admin 分类管理数据异常/为空时兜底用）──
const STATIC_INDEX = buildIndex(NODES);
function matchAll(rawName, itemType, threshold = 0.6, excludeCategories = ['hp']) {
  return matchAllWithIndex(rawName, itemType, STATIC_INDEX, threshold, excludeCategories);
}

// ── 新版：admin「分类管理」(ProjectCategory) 索引 ──────────────────────
// 叶子节点（没有子分类的节点）才是可匹配的"项目"，非叶子节点是纯分类分组，不参与匹配。
// 名称含"功能检测"/"功能医学"的 L1 分类，跟旧版 hp 类一样不自动归类，只能人工在OCR审核弹窗手动选。
let adminIndexCache = null;
let adminIndexCacheAt = 0;
const ADMIN_INDEX_TTL_MS = 30 * 1000; // 30秒缓存，避免每条item都查一次库，同时保证admin改分类后很快生效

async function buildAdminIndex() {
  const now = Date.now();
  if (adminIndexCache && (now - adminIndexCacheAt) < ADMIN_INDEX_TTL_MS) return adminIndexCache;

  const cats = await ProjectCategory.find({ status: 'active' }).lean();
  const byId = new Map(cats.map(c => [String(c._id), c]));
  const childCount = new Map();
  cats.forEach(c => {
    if (c.parent) childCount.set(String(c.parent), (childCount.get(String(c.parent)) || 0) + 1);
  });

  // 找每个节点的 L1 祖先 + 直接父级名字（供 key 格式 <L1id>|<L2name>|<叶子name> 使用）
  // 2026-07-02：加入断链检测——若 cat.parent 存在但指向的节点不在 byId 里(通常是父级被误停用/删除)，
  // while 循环会直接跳过、把这个节点自己误判成 L1，导致它被当成顶层分类、脱离原本的分组结构。
  // 曾经发生过真实事故：拆分"身高/体重/BMI/脉搏"节点时误把新节点挂到了被停用的旧节点下，
  // 这几个节点因此从"一般检查"分组里"消失"，AI归类和人工搜索都找不到。
  // 现在遇到断链一律标记 brokenChain=true，调用方应将其视为 excluded（不参与归类，需人工修复父级）。
  function resolveAncestry(cat) {
    let l1 = cat, parentLabel = '';
    const chain = [];
    let cur = cat;
    let brokenChain = false;
    while (cur.parent) {
      if (!byId.has(String(cur.parent))) { brokenChain = true; break; }
      const p = byId.get(String(cur.parent));
      chain.unshift(p);
      cur = p;
    }
    l1 = chain.length ? chain[0] : cat;
    parentLabel = chain.length ? (chain[chain.length - 1].name) : (cat.parent ? '' : '');
    // 如果该节点自己就是 L1（没有父级），parentLabel 用自己名字兜底
    if (cat._id === l1._id) parentLabel = cat.name;
    else if (!parentLabel) parentLabel = cat.name;
    return { l1, parentLabel, brokenChain };
  }

  const excludeL1Names = new Set();
  cats.filter(c => !c.parent).forEach(l1 => {
    if (/功能检测|功能医学/.test(l1.name)) excludeL1Names.add(String(l1._id));
  });

  const nodes = cats
    .filter(c => !(childCount.get(String(c._id)) > 0)) // 叶子节点
    .map(c => {
      const { l1, parentLabel, brokenChain } = resolveAncestry(c);
      if (brokenChain) {
        console.error(`[screeningMatch] 分类"${c.name}"(${c._id})的父级链路断裂(父级被停用或删除)，已排除出归类索引，需要在admin后台把它重新挂到正确的分类下`);
      }
      return {
        id: `${String(l1._id)}|${parentLabel}|${c.name}`,
        label: c.name,
        aliases: c.aliases || [],
        category: String(l1._id),
        categoryKey: String(l1._id),
        parent: parentLabel,
        itemType: null,
        gender: null,
        excluded: brokenChain || excludeL1Names.has(String(l1._id)),
      };
    });

  adminIndexCache = buildIndex(nodes.filter(n => !n.excluded));
  adminIndexCacheAt = now;
  return adminIndexCache;
}

// admin分类管理增删改后调用，立即让下一次归类生效，不用等30秒缓存过期
function invalidateAdminIndexCache() {
  adminIndexCache = null;
}

async function matchAllAdmin(rawName, itemType, threshold = 0.6) {
  const index = await buildAdminIndex();
  if (!index.length) return matchAll(rawName, itemType); // admin分类为空时兜底用旧静态库
  return matchAllWithIndex(rawName, itemType, index, threshold, []);
}

// 给一条 reportItem 填充归类字段（支持多类目，screeningKeys 为数组）
function classifyItemWithMatches(item, matches) {
  if (!matches.length) {
    return {
      ...item,
      screeningKeys: [],
      screeningKey: '',
      screeningCategory: '',
      screeningParent: '',
      matchStatus: 'unclassified',
      matchConfidence: 0,
    };
  }
  const best = matches[0];
  return {
    ...item,
    screeningKeys: matches.map(m => m.node.id),
    screeningKey: best.node.id,
    screeningCategory: best.node.category,
    screeningParent: best.node.parent,
    matchStatus: 'matched',
    matchConfidence: best.confidence,
  };
}

async function classifyItemAsync(item) {
  const matches = await matchAllAdmin(item.name, item.itemType);
  return classifyItemWithMatches(item, matches);
}

async function classifyItemsAsync(items) {
  const index = await buildAdminIndex();
  const useIndex = index.length ? index : STATIC_INDEX;
  const excludeCategories = index.length ? [] : ['hp'];
  return (items || []).map(item => {
    const matches = matchAllWithIndex(item.name, item.itemType, useIndex, 0.6, excludeCategories);
    return classifyItemWithMatches(item, matches);
  });
}

// 旧版同步接口，保留给尚未迁移的调用方；内部仍用静态库
function classifyItem(item) {
  return classifyItemWithMatches(item, matchAll(item.name, item.itemType));
}
function classifyItems(items) {
  return (items || []).map(classifyItem);
}

module.exports = {
  matchAll, matchOne: (n, t) => { const r = matchAll(n, t); return r[0] || null; },
  classifyItem, classifyItems, norm,
  classifyItemAsync, classifyItemsAsync, matchAllAdmin, buildAdminIndex, invalidateAdminIndexCache,
  matchAllWithIndex,
};
