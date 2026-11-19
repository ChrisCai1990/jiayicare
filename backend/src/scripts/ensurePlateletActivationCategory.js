/**
 * Add the Admin classification path for the platelet activation panel.
 * Preview by default. Run with --apply after checking the selected tenant.
 * Existing report items and manually confirmed classifications are untouched.
 */
const ROOT = '其他常规筛查';
const GROUP = '血小板功能';
const LEAF = '血小板活化四项';
const ALIASES = ['血小板活化4项', '血小板活化检测', '血小板活化功能检测'];

function selectPath(roots, scopedNodes) {
  if (roots.length !== 1) throw new Error(`需要唯一的“${ROOT}”一级分类，当前找到 ${roots.length} 个；请用 --tenant-id 指定机构或先核对分类库`);
  const root = roots[0];
  if (root.status !== 'active') throw new Error(`“${ROOT}”未启用`);
  const find = (name, parent) => {
    const candidates = scopedNodes.filter(node => node.name === name);
    if (candidates.some(node => String(node.parent || '') !== String(parent || ''))) {
      throw new Error(`“${name}”已存在于其他父分类，需人工核对，未创建重复节点`);
    }
    if (candidates.length > 1) throw new Error(`“${name}”存在重复节点，需先人工核对`);
    if (candidates[0]?.status === 'inactive') throw new Error(`“${name}”已存在但未启用，需先人工核对`);
    return candidates[0] || null;
  };
  const group = find(GROUP, root._id);
  const leaf = group ? find(LEAF, group._id) : null;
  if (!group && scopedNodes.some(node => node.name === LEAF)) throw new Error(`“${LEAF}”已存在但父级不是“${GROUP}”`);
  return { root, group, leaf, missingAliases: leaf ? ALIASES.filter(alias => !(leaf.aliases || []).includes(alias)) : ALIASES };
}

async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');
  const ProjectCategory = require('../models/ProjectCategory');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI 未配置');
  const tenantFlag = process.argv.find(arg => arg.startsWith('--tenant-id='));
  const tenantId = tenantFlag?.slice('--tenant-id='.length) || '';
  if (tenantId && !mongoose.isValidObjectId(tenantId)) throw new Error('--tenant-id 格式无效');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(uri);
  try {
    const rootFilter = { name: ROOT, parent: null, ...(tenantId ? { tenantId: new mongoose.Types.ObjectId(tenantId) } : {}) };
    const roots = await ProjectCategory.find(rootFilter).lean();
    if (roots.length !== 1) throw new Error(`需要唯一的“${ROOT}”一级分类，当前找到 ${roots.length} 个；请用 --tenant-id 指定机构或先核对分类库`);
    const owner = roots[0].tenantId || null;
    const scopedNodes = await ProjectCategory.find({ tenantId: owner, name: { $in: [GROUP, LEAF] } }).lean();
    let path = selectPath(roots, scopedNodes);
    const planned = [!path.group && GROUP, !path.leaf && LEAF].filter(Boolean);
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', tenantId: String(owner || ''), rootId: String(path.root._id), create: planned, addAliases: path.leaf ? path.missingAliases : [], path: `${ROOT} → ${GROUP} → ${LEAF}` }));
    if (!apply) return;

    if (!path.group) {
      const siblings = await ProjectCategory.find({ tenantId: owner, parent: path.root._id }).select('sortOrder').lean();
      path.group = await ProjectCategory.create({ tenantId: owner, name: GROUP, parent: path.root._id, sortOrder: Math.max(0, ...siblings.map(node => Number(node.sortOrder) || 0)) + 1 });
    }
    if (!path.leaf) {
      const siblings = await ProjectCategory.find({ tenantId: owner, parent: path.group._id }).select('sortOrder').lean();
      path.leaf = await ProjectCategory.create({ tenantId: owner, name: LEAF, parent: path.group._id, sortOrder: Math.max(0, ...siblings.map(node => Number(node.sortOrder) || 0)) + 1, aliases: ALIASES });
    } else if (path.missingAliases.length) {
      await ProjectCategory.updateOne({ _id: path.leaf._id, tenantId: owner, parent: path.group._id }, { $addToSet: { aliases: { $each: path.missingAliases } } });
    }
    const saved = await ProjectCategory.findOne({ _id: path.leaf._id, tenantId: owner, parent: path.group._id, status: 'active' }).lean();
    if (!saved || !ALIASES.every(alias => (saved.aliases || []).includes(alias))) throw new Error('分类写入后核验失败');
    console.log(JSON.stringify({ verified: true, groupId: String(path.group._id), leafId: String(saved._id), aliases: saved.aliases }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { ROOT, GROUP, LEAF, ALIASES, selectPath, main };
