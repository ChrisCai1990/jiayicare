/* eslint-disable no-console */
require('dotenv').config()
const mongoose = require('mongoose')

const TYPE = 'medical_assist'

async function run({ apply = false } = {}) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare'
  await mongoose.connect(uri)
  try {
    const db = mongoose.connection.db
    const templates = await db.collection('plantemplates')
      .find({ type: TYPE, status: 'active' }).sort({ createdAt: 1, _id: 1 }).toArray()
    const groups = new Map()
    templates.forEach(template => {
      const name = String(template.name || '').trim()
      if (!name) return
      if (!groups.has(name)) groups.set(name, [])
      groups.get(name).push(template)
    })
    const duplicates = [...groups.entries()].filter(([, rows]) => rows.length > 1)
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', duplicateGroups: duplicates.map(([name, rows]) => ({ name, total: rows.length, ids: rows.map(row => String(row._id)) })) }, null, 2))
      return
    }
    if (!duplicates.length) {
      console.log(JSON.stringify({ mode: 'applied', duplicateGroups: 0, removedDuplicates: 0, reassignedPlans: 0 }, null, 2))
      return
    }
    const backupKey = `medical-assist-template-consolidation-v18-${new Date().toISOString()}`
    await db.collection('maintenance_backups').insertOne({
      backupKey,
      reason: 'Before consolidating duplicate active medical-assist templates across client brands',
      createdAt: new Date(),
      templates: duplicates.flatMap(([, rows]) => rows),
    })
    let removedDuplicates = 0
    let reassignedPlans = 0
    const consolidated = []
    for (const [name, rows] of duplicates) {
      const canonical = rows[0]
      const richest = [...rows].sort((a, b) => Object.keys(b.content || {}).length - Object.keys(a.content || {}).length)[0]
      const brands = [...new Set(rows.flatMap(row => [
        ...(Array.isArray(row.clientBrands) ? row.clientBrands : []),
        row.clientBrand,
        ...(Array.isArray(row.content?.clientBrands) ? row.content.clientBrands : []),
      ]).filter(value => ['jiayiguanjia', 'jinyisen'].includes(value)))]
      await db.collection('plantemplates').updateOne({ _id: canonical._id }, { $set: {
        name,
        clientBrand: brands.length === 1 ? brands[0] : '',
        clientBrands: brands,
        content: { ...(canonical.content || {}), ...(richest.content || {}), clientBrands: brands },
        updatedAt: new Date(),
      } })
      const duplicateIds = rows.slice(1).map(row => row._id)
      const refs = await db.collection('healthplans').updateMany(
        { 'content.templateId': { $in: [...duplicateIds, ...duplicateIds.map(String)] } },
        { $set: { 'content.templateId': canonical._id, 'content.templateName': name } },
      )
      reassignedPlans += refs.modifiedCount || 0
      const deleted = await db.collection('plantemplates').deleteMany({ _id: { $in: duplicateIds } })
      removedDuplicates += deleted.deletedCount || 0
      consolidated.push({ name, canonicalId: String(canonical._id), removed: deleted.deletedCount || 0, clientBrands: brands })
    }
    console.log(JSON.stringify({ mode: 'applied', backupKey, duplicateGroups: duplicates.length, removedDuplicates, reassignedPlans, consolidated }, null, 2))
  } finally {
    await mongoose.disconnect()
  }
}

if (require.main === module) run({ apply: process.argv.includes('--apply') }).catch(error => { console.error(error); process.exitCode = 1 })

module.exports = { run }
