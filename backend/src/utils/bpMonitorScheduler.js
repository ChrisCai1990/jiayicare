const FollowUp = require('../models/FollowUp');
const Message = require('../models/Message');

// AI自主随访跟进试点（血压监测场景）：
// 每天扫描当日到期、要求打卡血压但患者尚未打卡的随访计划，AI直接发消息提醒患者，
// 不经过医护审核（参考 system.js 里"系统推送"的免审核先例）。
// 患者一旦打卡，healthRecords.js 会自动把对应随访标记为 completed，
// 因此本轮扫描不会重复提醒同一天的同一条待办；异常值升级走 HealthRecord.aiAlertStatus，
// 由 staff.js /ai-todos 的 bp_alert_review 聚合，本调度器只负责"未测提醒"这一半。
async function scanAndRemindMissingBP() {
  const CST_OFFSET = 8 * 60 * 60 * 1000;
  const nowCST = new Date(Date.now() + CST_OFFSET);
  const dateStr = nowCST.toISOString().split('T')[0];
  const todayStart = new Date(dateStr + 'T00:00:00+08:00');
  const todayEnd = new Date(dateStr + 'T23:59:59.999+08:00');
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const dueFollowUps = await FollowUp.find({
    status: { $in: ['planned', 'in_progress'] },
    date: { $gte: todayStart, $lte: todayEnd },
    checkInItems: 'bloodPressure',
  }).select('patientId').lean();

  const patientIds = [...new Set(dueFollowUps.map(f => String(f.patientId)))];
  let remindedCount = 0;

  for (const patientId of patientIds) {
    try {
      const title = '血压监测提醒';
      const exists = await Message.findOne({
        user: patientId, type: 'system', title, createdAt: { $gt: oneDayAgo },
      });
      if (exists) continue;
      await Message.create({
        user: patientId,
        type: 'system',
        sender: 'AI健康助手',
        title,
        content: '您的健康方案要求今日监测血压，目前还没有看到您的打卡记录。请尽快测量并录入，如结果异常AI会第一时间提醒您的家庭医生关注。',
        unread: true,
      });
      remindedCount++;
    } catch (e) {
      console.error('[bp-monitor] 患者 ' + patientId + ' 提醒发送失败', e.message);
    }
  }
  if (remindedCount > 0) console.log(`[bp-monitor] 已为 ${remindedCount} 位患者发送血压监测提醒`);
}

// 每天扫描一次，供 index.js 在服务启动时调用
function startBPMonitorScheduler() {
  scanAndRemindMissingBP().catch(e => console.error('[bp-monitor] 首次扫描失败', e.message));
  setInterval(() => {
    scanAndRemindMissingBP().catch(e => console.error('[bp-monitor] 定时扫描失败', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { scanAndRemindMissingBP, startBPMonitorScheduler };
