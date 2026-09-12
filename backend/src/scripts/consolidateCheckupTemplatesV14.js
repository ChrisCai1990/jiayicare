/* eslint-disable no-console */
require('dotenv').config()
const mongoose = require('mongoose')

const TEMPLATE_NAME = '体检一站式服务'

async function run({ apply = false } = {}) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare'
  await mongoose.connect(uri)
  try {
    const db = mongoose.connection.db
    const templates = await db.collection('plantemplates').find({
      type: 'medical_assist', name: TEMPLATE_NAME,
    }).sort({ createdAt: 1, _id: 1 }).toArray()
    if (!templates.length) {
      console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', total: 0, skipped: 'template_not_found' }, null, 2))
      return
    }

    const canonical = templates[0]
    const duplicates = templates.slice(1)
    if (!apply) {
      console.log(JSON.stringify({
        mode: 'dry-run', canonicalId: String(canonical._id),
        duplicateIds: duplicates.map(item => String(item._id)), total: templates.length,
      }, null, 2))
      return
    }

    const backupKey = `checkup-template-consolidation-v14-${new Date().toISOString()}`
    await db.collection('maintenance_backups').insertOne({
      backupKey,
      reason: 'Before consolidating brand-specific checkup one-stop templates into one shared template',
      createdAt: new Date(),
      templates,
    })

    const richest = [...templates].sort((a, b) =>
      (b.content?.followUpPlans?.length || 0) - (a.content?.followUpPlans?.length || 0)
    )[0]
    await db.collection('plantemplates').updateOne({ _id: canonical._id }, { $set: {
      status: 'active',
      clientBrand: '',
      clientBrands: ['jiayiguanjia', 'jinyisen'],
      content: {
        ...(canonical.content || {}),
        ...(richest.content || {}),
        clientBrands: ['jiayiguanjia', 'jinyisen'],
      },
      updatedAt: new Date(),
    } })

    const duplicateIds = duplicates.map(item => item._id)
    let reassignedPlans = 0
    if (duplicateIds.length) {
      const result = await db.collection('healthplans').updateMany(
        { 'content.templateId': { $in: duplicateIds } },
        { $set: { 'content.templateId': canonical._id, 'content.templateName': TEMPLATE_NAME } },
      )
      reassignedPlans = result.modifiedCount || 0
      await db.collection('plantemplates').deleteMany({ _id: { $in: duplicateIds } })
    }

    console.log(JSON.stringify({
      mode: 'applied', backupKey, canonicalId: String(canonical._id),
      removedDuplicates: duplicateIds.length, reassignedPlans,
      clientBrands: ['jiayiguanjia', 'jinyisen'],
    }, null, 2))
  } finally {
    await mongoose.disconnect()
  }
}

if (require.main === module) run({ apply: process.argv.includes('--apply') }).catch(error => { console.error(error); process.exitCode = 1 })

module.exports = { run }
