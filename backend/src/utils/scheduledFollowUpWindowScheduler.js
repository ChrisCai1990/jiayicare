const AnnualPlan = require('../models/AnnualPlan');
const { syncAnnualPlanFollowUps } = require('./annualPlanFollowUps');

// 年度管理方案的"日常监测/季度评估"随访占位只提前生成未来 HORIZON_DAYS 天（见 annualPlanFollowUps.js）。
// syncAnnualPlanFollowUps 按稳定排期键原位更新，每天仅补充新进入窗口的日期，
// 已审核记录不会被重新生成，也不会再次进入审核队列。
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
  const FollowUp = require('../models/FollowUp');
  const User = require('../models/User');
  const legacyRows = await FollowUp.find({ status: { $in: ['planned', 'in_progress', 'missed'] }, theme: { $regex: /就医提醒|年度体检/ } }).select('patientId assignedTo');
  for (const row of legacyRows) {
    const patient = await User.findById(row.patientId).select('assignedHealthManager').lean();
    if (patient?.assignedHealthManager && String(row.assignedTo || '') !== String(patient.assignedHealthManager)) {
      await FollowUp.updateOne({ _id: row._id }, { $set: { assignedTo: patient.assignedHealthManager } });
    }
  }
  // 旧版本把健康规划师人工消息写进 manager 且部分消息没有 conversationId，导致汇总有未读数、点进线程却为空。
  const Admin = require('../models/Admin');
  const Message = require('../models/Message');
  const planners = await Admin.find({ role: 'healthPlanner' }).select('name').lean();
  for (const planner of planners) {
    if (!planner.name) continue;
    const escaped = planner.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows = await Message.find({ type: 'manager', sender: { $regex: `^${escaped}(?:（|$)` } }).select('user');
    for (const message of rows) {
      await Message.updateOne({ _id: message._id }, { $set: { type: 'planner', conversationId: `${message.user}_planner` } });
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
