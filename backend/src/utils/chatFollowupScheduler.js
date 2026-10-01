const { randomUUID } = require('crypto');
const Message = require('../models/Message');
const User = require('../models/User');
const Admin = require('../models/Admin');
const SystemConfig = require('../models/SystemConfig');
const Schedule = require('../models/ChatFollowupSchedule');
const { generateChatFollowupDraft } = require('./chatFollowupDraft');
const { runWithoutTenantScope } = require('./tenantScope');
const { withAiContext } = require('./aiBudget');
const PERIOD = 15 * 86400000, HOUR = 3600000, LIMIT = 5;
const ID = 'nutrition-chat-v1';

async function scanAndGenerateChatFollowupDrafts() {
  return runWithoutTenantScope(async () => {
    // Configuration read failures fail closed; explicit administrator opt-out is preserved.
    const cfg = await SystemConfig.findOne({ key: 'chatFollowupAutoDraft' }).lean();
    if (cfg?.value?.enabled === false) return;
    const now = new Date();
    try {
      await Schedule.updateOne({ _id: ID }, { $setOnInsert: {
        activatedAt: now, cycleStart: now, nextRunAt: new Date(+now + PERIOD), cursor: '',
      } }, { upsert: true });
    } catch (e) { if (e.code !== 11000) throw e; }
    const token = randomUUID();
    const state = await Schedule.findOneAndUpdate({ _id: ID, nextRunAt: { $lte: now },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    }, { $set: { token, leaseUntil: new Date(+now + HOUR), nextRunAt: new Date(+now + HOUR) } }, { new: true });
    if (!state) return;
    const end = state.cycleEnd || now;
    await Schedule.updateOne({ _id: ID, token }, { $set: { cycleEnd: end } });
    const conversations = await Message.aggregate([
      { $match: { conversationId: { $regex: '^[a-fA-F0-9]{24}_nutritionist$', $gt: state.cursor || '' },
        createdAt: { $gt: state.cycleStart, $lte: end } } },
      { $group: { _id: '$conversationId' } }, { $sort: { _id: 1 } }, { $limit: LIMIT + 1 },
    ]);
    let processed = 0;
    for (const conversation of conversations.slice(0, LIMIT)) {
      // Recheck the lease and switch before every potential paid call.
      if (!await Schedule.exists({ _id: ID, token, leaseUntil: { $gt: new Date() } })) return;
      const current = await SystemConfig.findOne({ key: 'chatFollowupAutoDraft' }).lean();
      if (current?.value?.enabled === false) break;
      const patientId = conversation._id.split('_')[0];
      const user = await User.findOne({ _id: patientId, isDeleted: { $ne: true } }).select('tenantId assignedNutritionist');
      // Only generate where an active, same-tenant nutritionist can actually review.
      const reviewer = user?.assignedNutritionist && await Admin.exists({ _id: user.assignedNutritionist,
        role: 'nutritionist', staffStatus: { $ne: 'inactive' }, tenantId: user.tenantId || null });
      if (user && !reviewer) {
        await require('./chatFollowupGuard').withDraftGuard({ patientId, tenantId: user.tenantId,
          automaticCycle: new Date(end).toISOString(), minimumRangeStart: state.activatedAt, maximumRangeEnd: end },
          async () => ({ status: 'failed', message: '缺少同机构在岗营养师，请先核对会员归属，再重试或人工整理' }));
      }
      if (reviewer) {
        try {
          await withAiContext({ tenantId: String(user.tenantId || ''), actorId: String(user.assignedNutritionist) },
            () => generateChatFollowupDraft({ patientId, role: 'nutritionist', range: 'week',
              automaticCycle: new Date(end).toISOString(), minimumRangeStart: state.activatedAt, maximumRangeEnd: end }));
        } catch (e) { console.error('[chat-followup] 调度保留当前位置', patientId, e.message); throw e; }
      }
      const moved = await Schedule.updateOne({ _id: ID, token, leaseUntil: { $gt: new Date() } }, { $set: { cursor: conversation._id } });
      if (!moved.matchedCount) return;
      processed++;
    }
    // A switch change must not advance the unprocessed cursor or complete the cycle.
    const finalCfg = await SystemConfig.findOne({ key: 'chatFollowupAutoDraft' }).lean();
    const finished = finalCfg?.value?.enabled !== false && conversations.length <= LIMIT && processed === conversations.length;
    await Schedule.updateOne({ _id: ID, token }, { $set: finished ? {
      cycleStart: end, cycleEnd: null, cursor: '', leaseUntil: null,
      nextRunAt: new Date(Math.max(+new Date(end) + PERIOD, Date.now() + HOUR)),
    } : { leaseUntil: null } });
  });
}
let timer;
function startChatFollowupScheduler() {
  if (timer) return timer;
  const tick = () => scanAndGenerateChatFollowupDrafts().catch(e => console.error('[chat-followup] 调度暂停', e.message));
  tick(); // Initializes a future deadline only; never backfills on first deployment.
  timer = setInterval(tick, 5 * 60000);
  timer.unref?.();
  return timer;
}
module.exports = { scanAndGenerateChatFollowupDrafts, startChatFollowupScheduler, PERIOD, HOUR, LIMIT };
