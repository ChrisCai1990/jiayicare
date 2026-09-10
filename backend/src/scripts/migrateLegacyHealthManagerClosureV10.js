/* eslint-disable no-console */
require('dotenv').config()
const mongoose = require('mongoose')
const FollowUp = require('../models/FollowUp')
const HealthPlan = require('../models/HealthPlan')
require('../models/FollowUpPlan')
const { ensureCheckupTasks, isCheckupService } = require('../utils/checkupOneStopFlow')

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare')
  try {
    const plans = await HealthPlan.find({ type: 'medical_assist', status: { $in: ['active', 'draft'] } })
    let merged = 0
    for (const plan of plans.filter(isCheckupService)) {
      const tasks = await ensureCheckupTasks(plan)
      if (!tasks.report_collection || !tasks.onsite) continue
      const legacy = await FollowUp.findOne({
        sourceHealthPlanId: plan._id, sourceType: 'health_plan', taskRole: 'executor',
        _id: { $nin: [tasks.report_collection._id, tasks.onsite._id] },
        status: { $in: ['planned', 'in_progress', 'missed'] },
        theme: /(?:AI就医协助方案确认后随访|体检需求与资料确认)/,
      }).sort({ createdAt: 1 })
      if (!legacy) continue
      const reportSchemeId = tasks.report_collection.followUpSchemeId
      const reportWorkflowKey = tasks.report_collection.workflowKey
      tasks.report_collection.status = 'cancelled'
      tasks.report_collection.isBlocked = false
      tasks.report_collection.cancelReason = `已合并至健管专员原任务 ${legacy._id}`
      tasks.report_collection.workflowKey = `merged:${tasks.report_collection._id}`
      await tasks.report_collection.save()
      legacy.followUpSchemeId = reportSchemeId
      legacy.workflowKey = reportWorkflowKey
      legacy.theme = `执行体检结果回收与服务闭环 · ${plan.title}`
      legacy.dependsOnTaskId = tasks.onsite._id
      legacy.isBlocked = tasks.onsite.status !== 'completed'
      legacy.status = tasks.onsite.status === 'completed' ? 'in_progress' : 'planned'
      legacy.activationEvent = legacy.isBlocked ? 'onsite_completed' : ''
      legacy.cancelReason = ''
      await legacy.save()
      merged += 1
    }
    console.log(JSON.stringify({ mergedLegacyHealthManagerClosures: merged }))
  } finally { await mongoose.disconnect() }
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { run }
