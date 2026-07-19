const User = require('../models/User');
const HealthRecord = require('../models/HealthRecord');
const DailyTeamInsight = require('../models/DailyTeamInsight');
const { generateDailyTeamInsight, toLocalDateStr } = require('./dailyTeamInsight');

// 首页「健康团队今日动态」批量生成：每天凌晨为活跃用户批量跑一遍，
// 用户当天打开App直接读现成结果，无需现场等AI生成。
// 复用 dailyCareScheduler.js 的调度骨架：启动先跑一次，之后每24h一次。

async function scanAndGenerateDailyTeamInsights() {
  const todayStr = toLocalDateStr(new Date());
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  // 只为「近30天有过打卡」或「近30天新建档」的活跃用户生成，避免浪费AI调用
  const activeUserIds = await HealthRecord.distinct('user', { recordedAt: { $gte: thirtyDaysAgo } });
  const recentUsers = await User.find({ createdAt: { $gte: thirtyDaysAgo } }).select('_id').lean();
  const candidateIds = [...new Set([...activeUserIds.map(String), ...recentUsers.map(u => String(u._id))])];

  let generated = 0;
  for (const uid of candidateIds) {
    try {
      const exists = await DailyTeamInsight.findOne({ user: uid, date: todayStr });
      if (exists) continue; // 防重复：今天已生成过就跳过
      await generateDailyTeamInsight(uid, todayStr);
      generated++;
    } catch (e) {
      console.error('[daily-team-insight] 用户 ' + uid + ' 生成失败', e.message);
    }
  }
  if (generated > 0) console.log(`[daily-team-insight] 已为 ${generated} 位用户生成今日健康团队动态`);
}

function startDailyTeamInsightScheduler() {
  scanAndGenerateDailyTeamInsights().catch(e => console.error('[daily-team-insight] 首次扫描失败', e.message));
  setInterval(() => {
    scanAndGenerateDailyTeamInsights().catch(e => console.error('[daily-team-insight] 定时扫描失败', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { scanAndGenerateDailyTeamInsights, startDailyTeamInsightScheduler };
