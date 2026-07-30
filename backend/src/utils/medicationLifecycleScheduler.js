const Medication = require('../models/Medication');
const Supplement = require('../models/Supplement');

function todayCst() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function stopExpiredTreatments() {
  const today = todayCst();
  const filter = { stopped: false, endDate: { $ne: '', $lte: today } };
  const update = {
    $set: {
      stopped: true,
      stopDate: today,
      stopReason: '计划到期，系统自动停用',
      stopMode: 'automatic',
      stoppedBy: null,
      stoppedByName: '系统',
    },
  };
  const [medications, supplements] = await Promise.all([
    Medication.updateMany(filter, update),
    Supplement.updateMany(filter, update),
  ]);
  const count = (medications.modifiedCount || 0) + (supplements.modifiedCount || 0);
  if (count) console.log(`[treatment-lifecycle] 自动停用到期记录 ${count} 条`);
  return count;
}

function startMedicationLifecycleScheduler() {
  stopExpiredTreatments().catch(error => console.error('[treatment-lifecycle] 首次扫描失败', error.message));
  setInterval(() => {
    stopExpiredTreatments().catch(error => console.error('[treatment-lifecycle] 定时扫描失败', error.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { stopExpiredTreatments, startMedicationLifecycleScheduler };
