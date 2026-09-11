/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
async function main() {
  await mongoose.connect(process.env.MONGODB_URI); const followUps = mongoose.connection.db.collection('followups');
  const assignments = await followUps.find({ taskRole: 'executor', theme: /门诊一站式.*执行人员安排/, status: 'completed', 'formData.bookingSnapshot': { $exists: false } }).toArray();
  let updated = 0;
  for (const task of assignments) { const booking = task.dependsOnTaskId ? await followUps.findOne({ _id: task.dependsOnTaskId }) : null; if (booking?.formData) { await followUps.updateOne({ _id: task._id }, { $set: { 'formData.bookingSnapshot': booking.formData, updatedAt: new Date() } }); updated += 1; } }
  console.log(JSON.stringify({ bookingSnapshotsBackfilled: updated }));
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
