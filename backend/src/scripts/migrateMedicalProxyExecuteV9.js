/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await FollowUp.collection.updateMany(
    { sourceType: 'order', workflowKey: 'medical_proxy:execute', activationEvent: 'medical_proxy_booking_completed' },
    { $set: { activationEvent: '' } },
  );
  console.log(JSON.stringify({ invalidActivationEventsFixed: result.modifiedCount || 0 }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
