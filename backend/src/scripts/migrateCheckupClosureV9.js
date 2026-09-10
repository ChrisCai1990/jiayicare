/* eslint-disable no-console */
require('dotenv').config()
const mongoose = require('mongoose')
const HealthPlan = require('../models/HealthPlan')
const { onCustomerConfirmedCheckupPlan } = require('../utils/checkupOneStopFlow')

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare')
  try {
    const confirmed = await HealthPlan.find({ type: 'annual_checkup', confirmedAt: { $ne: null } }).select('patientId')
    const patientIds = [...new Set(confirmed.map(item => String(item.patientId)))]
    let linked = 0
    for (const patientId of patientIds) if (await onCustomerConfirmedCheckupPlan(patientId)) linked += 1
    console.log(JSON.stringify({ confirmedPatients: patientIds.length, linkedCheckupClosures: linked }))
  } finally { await mongoose.disconnect() }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { run }
