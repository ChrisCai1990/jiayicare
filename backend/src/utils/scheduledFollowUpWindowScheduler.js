const AnnualPlan = require('../models/AnnualPlan');
const { syncAnnualPlanFollowUps, dedupeAnnualPlanFollowUps } = require('./annualPlanFollowUps');

// 年度管理方案的"日常监测/季度评估"随访占位只提前生成未来 HORIZON_DAYS 天（见 annualPlanFollowUps.js）。
// syncAnnualPlanFollowUps 按稳定排期键原位更新，每天仅补充新进入窗口的日期，
// 已审核记录不会被重新生成，也不会再次进入审核队列。
async function scanAndSyncScheduledWindow() {
  const removed = await dedupeAnnualPlanFollowUps();
  if (removed > 0) console.log(`[scheduled-followup-window] 已清理 ${removed} 条历史重复随访计划`);
  const plans = await AnnualPlan.find({}).lean();
  let total = 0;
  for (const plan of plans) {
    try {
      total += await syncAnnualPlanFollowUps(plan);
    } catch (e) {
      console.error('[scheduled-followup-window] 方案 ' + plan._id + ' 补生成失败', e.message);
    }
  }
  if (plans.length > 0) console.log(`[scheduled-followup-window] 已为 ${plans.length} 份方案刷新占位窗口，共 ${total} 条`);
}

// 启动定时扫描（每天一次），供 index.js 在服务启动时调用
function startScheduledFollowUpWindowScheduler() {
  scanAndSyncScheduledWindow().catch(e => console.error('[scheduled-followup-window] 首次扫描失败', e.message));
  setInterval(() => {
    scanAndSyncScheduledWindow().catch(e => console.error('[scheduled-followup-window] 定时扫描失败', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { scanAndSyncScheduledWindow, startScheduledFollowUpWindowScheduler };
