const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { SOURCE_KEY, groupedSlots, medicationLine, slotContent } = require('../../../shared/combinedMedicationReminder.cjs');
const { beijingDate } = require('../../../shared/medicationReminder.cjs');
const { disposableMedicationSlotsFilter } = require('./medicationFollowUpVisibility');
const planId = user => new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`${SOURCE_KEY}:${user}`).digest('hex').slice(0,24));
function models() { return { Medication: require('../models/Medication'), Reminder: require('../models/Reminder'), Message: require('../models/Message') }; }
async function refreshDailyMedicationWindow(plan, meds, now = new Date()) {
  const FollowUp = require('../models/FollowUp');
  const today = beijingDate(now);
  // The Reminder is the durable plan and Message records individual doses.
  // Retire only untouched slots from the former daily FollowUp generator.
  await FollowUp.deleteMany({ patientId: plan.user, ...disposableMedicationSlotsFilter });
  await models().Reminder.updateOne({ _id: plan._id }, { $set: { medicationWindowDate: today } });
  return 0;
}
async function syncCombinedMedicationReminder(user, now = new Date()) {
  const { Medication, Reminder } = models();
  const meds = await Medication.find({ user, stopped: { $ne: true }, active: { $ne: false }, 'reminder.enabled': true }).lean();
  const slots = groupedSlots(meds, now);
  const filter = { _id: planId(user), user };
  if (!slots.length) {
    const plan = await Reminder.findOneAndUpdate(filter, { $set: { enabled: false, nextMedicationAt: null } }, { new: true });
    if (plan) await refreshDailyMedicationWindow(plan, meds, now);
    return plan;
  }
  const previous = await Reminder.findOne(filter).lean();
  const times = [...new Set(slots.map(s => s.time))].sort();
  const active = [...new Map(slots.flatMap(s => s.medications).map(m => [m.id,m])).values()];
  const description = active.map(medicationLine).join('\n');
  const startDate = new Date(`${beijingDate(slots[0].date)}T00:00:00+08:00`);
  const endDate = new Date(`${beijingDate(slots.at(-1).date)}T23:59:59+08:00`);
  const set = { user, category: 'medication', title: `用药提醒（${active.length}种药）`, description,
    scheduleType: 'recurring', systemManaged: true, sourceKey: SOURCE_KEY,
    // The legacy string is displayed by released App/mini-program clients.
    reminderTime: times.join('、'), reminderTimes: times, daysOfWeek: [], startDate, endDate,
    enabled: !previous?.userDisabled, nextMedicationAt: slots[0].date };
  const plan = await Reminder.findOneAndUpdate(filter, { $set: set }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await refreshDailyMedicationWindow(plan, meds, now);
  return plan;
}

async function scanMedicationReminders(now = new Date()) {
  const { Medication, Reminder, Message } = models();
  const plans = await Reminder.find({ sourceKey: SOURCE_KEY, systemManaged: true, $or: [
    { medicationWindowDate: { $ne: beijingDate(now) } }, { enabled: true, nextMedicationAt: { $ne: null, $lte: now } },
  ] }).lean();
  let sent = 0;
  for (const plan of plans) {
    try {
      // Read live prescriptions at delivery, so stopped/deleted/edited drugs never
      // survive in an old pre-generated reminder. No historical mass backfill.
      if (!await require('../models/User').exists({ _id: plan.user, isDeleted: { $ne: true } })) {
        await Reminder.updateOne({ _id: plan._id }, { $set: { enabled: false, nextMedicationAt: null } });
        continue;
      }
      const meds = await Medication.find({ user: plan.user, stopped: { $ne: true }, active: { $ne: false }, 'reminder.enabled': true }).lean();
      if (plan.medicationWindowDate !== beijingDate(now)) {
        await refreshDailyMedicationWindow(plan, meds, now);
        const refreshed = await Reminder.findById(plan._id).lean();
        if (!refreshed) continue;
        Object.assign(plan, refreshed);
      }
      if (!plan.enabled || !plan.nextMedicationAt || new Date(plan.nextMedicationAt) > now) continue;
      const due = new Date(plan.nextMedicationAt);
      const slot = groupedSlots(meds, due)[0];
      const unchanged = { _id: plan._id, enabled: true, nextMedicationAt: due, updatedAt: plan.updatedAt };
      if (!await Reminder.exists(unchanged)) continue;
      // Do not tell a customer to take old doses after an outage. Resume the next
      // scheduled slot instead of replaying a backlog of medication messages.
      if (slot && +slot.date === +due && +now - +due <= 5 * 60000) {
        const dedupeKey = `medication-slot:${plan.user}:${due.toISOString()}`;
        const _id = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(dedupeKey).digest('hex').slice(0,24));
        const result = await Message.updateOne({ _id }, { $setOnInsert: { user: plan.user, type: 'system', sender: '嘉医管家',
          title: `${slot.time} 用药提醒`, content: slotContent(slot), unread: true, isAI: false, aiGenerated: false, dedupeKey,
        } }, { upsert: true, setDefaultsOnInsert: true });
        sent += result.upsertedCount || 0;
      }
      const next = groupedSlots(meds, new Date(+now + 1))[0];
      await Reminder.updateOne(unchanged, { $set: { nextMedicationAt: next?.date || null, enabled: !!next,
        lastMedicationAt: slot && +slot.date === +due && +now - +due <= 5 * 60000 ? due : plan.lastMedicationAt || null } });
    } catch (error) { console.error('[medication-reminder]', String(plan._id), error.message); }
  }
  return sent;
}
async function refreshExistingPlan(user, now = new Date()) {
  const { Reminder } = models();
  if (await Reminder.exists({ _id: planId(user), user })) return syncCombinedMedicationReminder(user, now);
}
function startMedicationReminderScheduler() {
  let running = false;
  const run = async () => { if (running) return; running = true; try { await scanMedicationReminders(); } catch (e) { console.error('[medication-reminder]', e.message); } finally { running = false; } };
  const first = setTimeout(run, 15000); first.unref();
  const timer = setInterval(run, 30000); timer.unref();
}
module.exports = { syncCombinedMedicationReminder, scanMedicationReminders, startMedicationReminderScheduler, refreshExistingPlan, refreshDailyMedicationWindow, planId };
