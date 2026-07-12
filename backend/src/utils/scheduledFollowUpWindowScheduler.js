const AnnualPlan = require('../models/AnnualPlan');
const { syncAnnualPlanFollowUps } = require('./annualPlanFollowUps');

// 年度管理方案的"日常监测/季度评估"随访占位只提前生成未来 HORIZON_DAYS 天（见 annualPlanFollowUps.js）。
// syncAnnualPlanFollowUps 内部按 Date.now() 重新计算窗口，且是"先删未审核的旧占位、再按当前窗口重建"，
// 天然幂等——每天重跑一次，就相当于窗口跟着日期往前滚动一天，把新进入窗口的那一天补出来，
// 不会重复，也不会影响医护已审核/编辑过的记录（那些 aiStatus 已不是 pending，删除条件筛不到）。
async function scanAndSyncScheduledWindow() {
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
