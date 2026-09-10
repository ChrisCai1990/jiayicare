/* eslint-disable no-console */
require('dotenv').config()
const mongoose = require('mongoose')
const HealthPlan = require('../models/HealthPlan')
const { onCustomerConfirmedCheckupPlan } = require('../utils/checkupOneStopFlow')

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare')
  try {
    const confirmed = await HealthPlan.find({ type: 'annual_checkup', confirmedAt: { $ne: null } }).select('patientId').sort({ confirmedAt: -1 })
    const patientIds = [...new Set(confirmed.map(item => String(item.patientId)))]
    let advanced = 0
    for (const patientId of patientIds) {
      if (await onCustomerConfirmedCheckupPlan(patientId)) advanced += 1
    }
    console.log(JSON.stringify({ confirmedPatients: patientIds.length, advancedToBooking: advanced }))
  } finally {
    await mongoose.disconnect()
  }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { run }
