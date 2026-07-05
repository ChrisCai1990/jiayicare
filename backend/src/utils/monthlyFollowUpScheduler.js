const AnnualPlan = require('../models/AnnualPlan');
const User = require('../models/User');
const { runMonthlyFollowUpReview } = require('./followupReview');

// 对所有已确认方案、本月尚未跑过回顾的患者执行一次月度AI随访回顾
// 每个患者只按其最新确认的方案跑一次（同一患者可能有多个方案类型，取最近确认的一份即可，避免重复生成随访建议）
async function scanAndRunMonthlyReview() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const plans = await AnnualPlan.find({
    confirmedAt: { $ne: null },
    $or: [{ lastMonthlyReviewAt: null }, { lastMonthlyReviewAt: { $lt: monthStart } }],
  }).sort({ confirmedAt: -1 }).lean();

  const seenPatients = new Set();
  let count = 0;
  for (const plan of plans) {
    const patientKey = String(plan.patientId);
    if (seenPatients.has(patientKey)) continue;
    seenPatients.add(patientKey);
    try {
      const user = await User.findById(plan.patientId).select('name gender age chronicDiseases');
      if (!user) continue;
      await runMonthlyFollowUpReview(user, plan.createdBy);
      count++;
    } catch (e) {
      console.error('[monthly-followup-review] 患者 ' + patientKey + ' 回顾失败', e.message);
    } finally {
      await AnnualPlan.updateMany(
        { patientId: plan.patientId, confirmedAt: { $ne: null } },
        { lastMonthlyReviewAt: new Date() }
      ).catch(() => {});
    }
  }
  if (count > 0) console.log(`[monthly-followup-review] 已为 ${count} 位患者生成月度随访回顾`);
}

// 启动定时扫描（每天检查一次，命中月初或补跑遗漏项时才实际执行），供 index.js 在服务启动时调用
function startMonthlyReviewScheduler() {
  scanAndRunMonthlyReview().catch(e => console.error('[monthly-followup-review] 首次扫描失败', e.message));
  setInterval(() => {
    scanAndRunMonthlyReview().catch(e => console.error('[monthly-followup-review] 定时扫描失败', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { scanAndRunMonthlyReview, startMonthlyReviewScheduler };
