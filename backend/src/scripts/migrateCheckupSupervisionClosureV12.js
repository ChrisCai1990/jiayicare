/* eslint-disable no-console */
require('dotenv').config()
const mongoose = require('mongoose')
const { TASK_PLAN_DRAFTS, PRODUCT_NAME } = require('./seedCheckupOneStopWorkflowDraft')

async function run({ apply = false } = {}) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare'
  await mongoose.connect(uri)
  try {
    const db = mongoose.connection.db
    const products = db.collection('products')
    const plans = db.collection('followupplans')
    const healthPlans = db.collection('healthplans')
    const orders = db.collection('orders')
    const product = await products.findOne({ name: PRODUCT_NAME })
    if (!product) throw new Error(`${PRODUCT_NAME}不存在`)

    const activeServices = await healthPlans.find({
      type: 'medical_assist', status: { $in: ['draft', 'active'] },
      $or: [{ 'content.serviceDomain': 'annual_checkup' }, { 'content.templateName': PRODUCT_NAME }, { title: /体检一站式/ }],
    }).toArray()
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', product: PRODUCT_NAME, activeServices: activeServices.length, stages: TASK_PLAN_DRAFTS.map(item => item.workflowStageKey) }, null, 2))
      return
    }

    const backupKey = `checkup-supervision-closure-v12-${new Date().toISOString()}`
    await db.collection('maintenance_backups').insertOne({
      backupKey, reason: 'Before adding checkup result review and health-planner final acceptance', createdAt: new Date(),
      product, activeServices,
    })

    const modules = []
    for (const draft of TASK_PLAN_DRAFTS) {
      const { key, mode, trigger, sequence, ...fields } = draft
      const name = fields.name.replace('【审核稿】', '')
      const updated = await plans.findOneAndUpdate(
        { name: { $in: [name, fields.name] } },
        { $set: { ...fields, name, status: 'active', reviewStatus: 'approved', reviewedAt: new Date(), updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, returnDocument: 'after' },
      )
      modules.push({ planId: updated._id, mode, trigger, sequence })
    }
    const workflowSnapshot = {
      key: 'checkup', questionnaireId: product.serviceWorkflow?.questionnaireId || null,
      followUpPlanId: modules[0]?.planId || null, followUpPlanIds: modules.map(item => item.planId), modules,
      notes: '健康规划师全程总督办；报告解析并经健管审核后由健康顾问完成结果评估和随访计划，最终由健康规划师验收闭环。',
    }
    await products.updateOne({ _id: product._id }, { $set: { serviceWorkflow: workflowSnapshot, updatedAt: new Date() } })

    const embedded = modules.map((item, sequence) => {
      const draft = TASK_PLAN_DRAFTS.find(row => row.sequence === item.sequence)
      return { id: String(item.planId), name: draft.name.replace('【审核稿】', ''), mode: item.mode, trigger: item.trigger, sequence, reviewerRole: item.mode === 'conditional' ? 'familyDoctor' : '' }
    })
    const activeIds = activeServices.map(item => item._id)
    if (activeIds.length) await healthPlans.updateMany({ _id: { $in: activeIds } }, { $set: {
      'content.followUpPlanId': String(modules[0]?.planId || ''),
      'content.followUpPlans': embedded,
      'content.workflowModules': embedded,
      'content.workflowModuleDecisions': embedded.filter(item => item.mode === 'conditional').map(item => ({ ...item, decision: 'pending', decidedAt: null, decidedBy: null })),
      'content.serviceWorkflowSnapshot': workflowSnapshot,
      updatedAt: new Date(),
    } })
    const orderIds = activeServices.map(item => item.sourceOrderId).filter(Boolean)
    if (orderIds.length) await orders.updateMany({ _id: { $in: orderIds }, status: { $nin: ['completed', 'cancelled'] } }, { $set: { serviceWorkflowSnapshot: workflowSnapshot, updatedAt: new Date() } })

    const { ensureCheckupTasks, onCheckupReportAudited } = require('../utils/checkupOneStopFlow')
    const HealthPlan = require('../models/HealthPlan')
    const MedicalReport = require('../models/MedicalReport')
    let taskSets = 0, auditedSignals = 0
    for (const id of activeIds) {
      const service = await HealthPlan.findById(id)
      await ensureCheckupTasks(service)
      taskSets += 1
      const report = await MedicalReport.findOne({ user: service.patientId, audit_status: 'audited' }).sort({ audited_at: -1, createdAt: -1 })
      if (report && await onCheckupReportAudited(report)) auditedSignals += 1
    }
    console.log(JSON.stringify({ mode: 'applied', backupKey, product: PRODUCT_NAME, moduleCount: modules.length, activeServices: activeIds.length, taskSets, auditedSignals }, null, 2))
  } finally {
    await mongoose.disconnect()
  }
}

if (require.main === module) run({ apply: process.argv.includes('--apply') }).catch(error => { console.error(error); process.exitCode = 1 })

module.exports = { run }
