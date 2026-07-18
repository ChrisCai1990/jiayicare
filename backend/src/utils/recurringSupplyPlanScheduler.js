const RecurringSupplyPlan = require('../models/RecurringSupplyPlan');
const Message = require('../models/Message');
const { FREQUENCY_DAYS } = require('./annualPlanSupplyPlans');

const PLAN_TYPE_LABEL = { medication: '配药', supplement: '配营养素' };

// 定期配药/配营养素计划到期扫描：nextDueDate <= 今天 且 enabled 的计划，
// ①生成健管专员待办（aiStatus:'pending'，接入staff.js的getTodos汇总，健管专员确认安排后
//   在患者详情页把该计划标记approved，nextDueDate才会滚到下一周期——避免"生成了但没人管"）
// ②给客户端消息中心推一条system消息，提前告知"该去配药/配营养素了，健管会联系你安排"
// 幂等：同一到期周期只通知一次（lastNotifiedAt 记录本次到期日，避免同一天定时任务多次运行重复推送）
async function scanAndNotifyDueSupplyPlans() {
  const now = new Date();
  const due = await RecurringSupplyPlan.find({
    enabled: true,
    nextDueDate: { $lte: now },
  }).populate('patientId', 'name');

  let notified = 0;
  for (const plan of due) {
    // 本周期已经生成过待办但医护还没确认，不重复推送/不重复生成待办
    if (plan.aiStatus === 'pending') continue;

    try {
      plan.aiStatus = 'pending';
      plan.lastNotifiedAt = now;
      await plan.save();

      const label = PLAN_TYPE_LABEL[plan.planType] || plan.planType;
      const patientName = plan.patientId?.name || '会员';
      await Message.create({
        user: plan.patientId._id || plan.patientId,
        type: 'system',
        sender: '嘉医管家',
        title: `该${label}了`,
        content: `您的「${plan.itemName}」按计划该${label}了${plan.institution ? `，建议前往${plan.institution}` : ''}，健康管理师会联系您协助安排。`,
      });
      notified++;
      console.log(`[recurring-supply-plan] ${patientName} 「${plan.itemName}」到期，已生成待办+通知`);
    } catch (e) {
      console.error('[recurring-supply-plan] 计划 ' + plan._id + ' 通知失败', e.message);
    }
  }
  if (due.length > 0) console.log(`[recurring-supply-plan] 扫描到 ${due.length} 条到期计划，本次新通知 ${notified} 条`);
}

// 健管专员在患者详情页确认"已安排"后调用：nextDueDate 滚到下一周期，aiStatus 清空等待下次到期
function advanceToNextCycle(plan) {
  const days = FREQUENCY_DAYS[plan.frequency];
  if (!days) return plan;
  plan.nextDueDate = new Date(plan.nextDueDate.getTime() + days * 86400000);
  plan.aiStatus = null;
  return plan;
}

function startRecurringSupplyPlanScheduler() {
  scanAndNotifyDueSupplyPlans().catch(e => console.error('[recurring-supply-plan] 首次扫描失败', e.message));
  setInterval(() => {
    scanAndNotifyDueSupplyPlans().catch(e => console.error('[recurring-supply-plan] 定时扫描失败', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { scanAndNotifyDueSupplyPlans, advanceToNextCycle, startRecurringSupplyPlanScheduler };
