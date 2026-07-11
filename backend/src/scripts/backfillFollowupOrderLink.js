/**
 * 历史补关联：给 sourceType='order' 但 sourceOrderId=null 的随访补回对应 Order。
 *
 * 背景：早期 services.js 下单生成随访时未写 sourceOrderId，导致医护端随访详情弹窗
 * 无法展示订单号/金额/支付方式。本脚本按 patientId + serviceName + 创建时间就近匹配补齐。
 *
 * 匹配规则（保守，只补高置信度的）：
 *   1. 同一患者（followUp.patientId === order.user）
 *   2. 服务名一致：followUp.theme 去掉「预约：」「服务包开通：」前缀后 === order.serviceName
 *   3. 时间就近：两者 createdAt 相差 ≤ SAME_ORDER_WINDOW_MS（同一次下单是 Promise.all 并发创建，通常毫秒级）
 *   4. 一个 order 只被一条随访认领一次（防止一对多误配）
 * 命中多个候选时取时间最接近的那个。无候选或有歧义则跳过（宁缺毋滥，留给人工）。
 *
 * 幂等：只处理 sourceOrderId=null 的，已补过的不会重复动。
 * 用法：
 *   node src/scripts/backfillFollowupOrderLink.js           # 预演（dry-run，只打印不写库）
 *   node src/scripts/backfillFollowupOrderLink.js --apply    # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');

const APPLY = process.argv.includes('--apply');
const SAME_ORDER_WINDOW_MS = 10 * 60 * 1000; // 10分钟窗口，覆盖并发创建的微小时间差

function stripThemePrefix(theme = '') {
  return theme.replace(/^预约：/, '').replace(/^服务包开通：/, '').trim();
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare';
  await mongoose.connect(uri);
  console.log(`[backfill] connected: ${uri}`);
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (写库)' : 'DRY-RUN (仅预演)'}`);

  const targets = await FollowUp.find({
    sourceType: 'order',
    $or: [{ sourceOrderId: null }, { sourceOrderId: { $exists: false } }],
  }).select('_id patientId theme createdAt').lean();

  console.log(`[backfill] 待补关联随访: ${targets.length} 条`);

  let matched = 0, skipped = 0, ambiguous = 0;
  const claimedOrderIds = new Set(); // 已被认领的 order，避免一对多

  for (const fu of targets) {
    const serviceName = stripThemePrefix(fu.theme);
    if (!serviceName) { skipped++; continue; }

    const candidates = await Order.find({
      user: fu.patientId,
      serviceName,
    }).select('_id createdAt serviceName').lean();

    const usable = candidates
      .filter(o => !claimedOrderIds.has(String(o._id)))
      .map(o => ({ o, diff: Math.abs(new Date(o.createdAt) - new Date(fu.createdAt)) }))
      .filter(x => x.diff <= SAME_ORDER_WINDOW_MS)
      .sort((a, b) => a.diff - b.diff);

    if (usable.length === 0) { skipped++; continue; }

    // 若最近两个候选时间差极小（都在窗口内且彼此接近1秒内），无法区分 → 判歧义，跳过留人工
    if (usable.length > 1 && Math.abs(usable[0].diff - usable[1].diff) < 1000) {
      ambiguous++;
      console.log(`  [歧义跳过] fu=${fu._id} service="${serviceName}" 有${usable.length}个时间接近候选`);
      continue;
    }

    const best = usable[0].o;
    claimedOrderIds.add(String(best._id));
    matched++;
    console.log(`  [匹配] fu=${fu._id} "${serviceName}" → order=${best._id} (相差${Math.round(usable[0].diff / 1000)}s)`);

    if (APPLY) {
      await FollowUp.updateOne({ _id: fu._id }, { $set: { sourceOrderId: best._id } });
    }
  }

  console.log(`\n[backfill] 完成：匹配 ${matched} / 跳过(无候选) ${skipped} / 歧义跳过 ${ambiguous} / 总 ${targets.length}`);
  if (!APPLY && matched > 0) console.log('[backfill] 这是预演，未写库。确认无误后加 --apply 实际执行。');

  await mongoose.disconnect();
}

main().catch(err => { console.error('[backfill] 失败:', err); process.exit(1); });
