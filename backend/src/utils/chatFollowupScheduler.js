const Message = require('../models/Message');
const SystemConfig = require('../models/SystemConfig');
const { generateChatFollowupDraft } = require('./chatFollowupDraft');

// 每半月自动为「健管专员」「营养师」两个频道批量生成随访草稿（待专员审核后才正式入档）。
// 家庭医生频道不纳入自动生成——医疗沟通更谨慎，保留人工在消息页手动触发（见 chatFollowupDraft.js）。
// 只处理半月内有新聊天的会话，避免给沉默会话生成空草稿；由 generateChatFollowupDraft 内部的
// "接续上次截止点"逻辑保证不会因为半月才跑一次而漏掉中间的聊天内容。

const AUTO_ROLES = ['manager', 'nutritionist'];
const HALF_MONTH_MS = 15 * 24 * 60 * 60 * 1000;

async function scanAndGenerateChatFollowupDrafts() {
  let enabled = true;
  try {
    const cfg = await SystemConfig.findOne({ key: 'chatFollowupAutoDraft' }).lean();
    if (cfg && cfg.value && cfg.value.enabled === false) enabled = false;
  } catch (e) { /* 无配置表也不阻塞，默认开启 */ }
  if (!enabled) { console.log('[chat-followup] 自动生成已被管理员关闭，跳过'); return; }

  const since = new Date(Date.now() - HALF_MONTH_MS);
  let created = 0, skipped = 0;

  for (const role of AUTO_ROLES) {
    // 近半月内有新聊天的会话（conversationId 形如 `${patientId}_${role}`）
    const activeConvIds = await Message.distinct('conversationId', {
      conversationId: { $regex: `_${role}$` },
      createdAt: { $gte: since },
    });

    for (const convId of activeConvIds) {
      const patientId = convId.slice(0, convId.length - role.length - 1);
      try {
        const result = await generateChatFollowupDraft({ patientId, role, range: 'week', staffId: null });
        if (result.status === 'created') created++;
        else skipped++;
      } catch (e) {
        console.error(`[chat-followup] 患者 ${patientId} 角色 ${role} 自动生成失败`, e.message);
        skipped++;
      }
    }
  }
  if (created > 0) console.log(`[chat-followup] 自动生成 ${created} 条随访草稿待审核（跳过 ${skipped}）`);
}

// 每半月扫描一次。启动时不立即跑（避免每次部署重启都触发），仅按周期执行。
function startChatFollowupScheduler() {
  setInterval(() => {
    scanAndGenerateChatFollowupDrafts().catch(e => console.error('[chat-followup] 定时扫描失败', e.message));
  }, HALF_MONTH_MS);
}

module.exports = { scanAndGenerateChatFollowupDrafts, startChatFollowupScheduler };
