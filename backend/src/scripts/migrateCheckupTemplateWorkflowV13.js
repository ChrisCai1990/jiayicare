/* eslint-disable no-console */
require('dotenv').config()
const mongoose = require('mongoose')

const PRODUCT_NAME = '体检一站式服务'

async function run({ apply = false } = {}) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare'
  await mongoose.connect(uri)
  try {
    const db = mongoose.connection.db
    const product = await db.collection('products').findOne({
      name: PRODUCT_NAME,
      'serviceWorkflow.key': 'checkup',
    })
    if (!product) throw new Error(`${PRODUCT_NAME}尚未配置 checkup 产品流程`)

    const moduleIds = (product.serviceWorkflow?.modules || [])
      .map(item => item.planId?._id || item.planId)
      .filter(Boolean)
    const plans = moduleIds.length
      ? await db.collection('followupplans').find({ _id: { $in: moduleIds } }).toArray()
      : []
    const planNames = new Map(plans.map(plan => [String(plan._id), plan.name || '']))
    const linkedPlans = (product.serviceWorkflow?.modules || []).map(item => ({
      id: String(item.planId?._id || item.planId || ''),
      name: planNames.get(String(item.planId?._id || item.planId || '')) || '',
      mode: item.mode || 'fixed',
      trigger: item.trigger || '',
      sequence: item.sequence || 0,
    })).filter(item => item.id)

    const templates = await db.collection('plantemplates').find({
      type: 'medical_assist',
      $or: [
        { name: PRODUCT_NAME },
        { 'content.serviceDomain': { $in: ['annual_checkup', 'checkup'] }, name: /体检一站式/ },
      ],
    }).toArray()
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', product: PRODUCT_NAME, moduleCount: linkedPlans.length, templates: templates.map(item => item.name) }, null, 2))
      return
    }

    const backupKey = `checkup-template-workflow-v13-${new Date().toISOString()}`
    await db.collection('maintenance_backups').insertOne({
      backupKey,
      reason: 'Before aligning checkup PlanTemplate links with Product.serviceWorkflow',
      createdAt: new Date(),
      product,
      templates,
    })
    if (templates.length) {
      await db.collection('plantemplates').updateMany(
        { _id: { $in: templates.map(item => item._id) } },
        { $set: {
          'content.serviceDomain': 'annual_checkup',
          'content.followUpPlanId': linkedPlans[0]?.id || '',
          'content.followUpPlanName': linkedPlans[0]?.name || '',
          'content.followUpPlans': linkedPlans,
          'content.workflowSource': 'product',
          'content.workflowProductId': String(product._id),
          'content.workflowProductName': product.name,
          updatedAt: new Date(),
        } },
      )
    }
    console.log(JSON.stringify({ mode: 'applied', backupKey, product: PRODUCT_NAME, moduleCount: linkedPlans.length, templatesUpdated: templates.length }, null, 2))
  } finally {
    await mongoose.disconnect()
  }
}

if (require.main === module) run({ apply: process.argv.includes('--apply') }).catch(error => { console.error(error); process.exitCode = 1 })

module.exports = { run }
