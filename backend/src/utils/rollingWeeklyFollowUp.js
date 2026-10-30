const FollowUp = require('../models/FollowUp');
const mongoose = require('mongoose');
const { createHash } = require('node:crypto');

function weeklySuccessorId(parentId, item = '') {
  const bytes = createHash('sha256').update(`weekly-follow-up:v1:${String(parentId)}${item ? `:${item}` : ''}`).digest().subarray(0, 12);
  return new mongoose.Types.ObjectId(bytes);
}

function nextWeeklyDate(completedAt) {
  const chinaDay = new Date(new Date(completedAt).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const next = new Date(`${chinaDay}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

async function generateNextWeeklyFollowUp(followUp, item = '') {
  if (!followUp.repeatWeekly || followUp.status !== 'completed' || !followUp.weeklyTemplate) return null;
  const label = { bloodPressure: '血压', weight: '体重' }[item] || item;
  const template = item ? { ...followUp.weeklyTemplate, checkInItems: [item],
    theme: `${String(followUp.weeklyTemplate.theme || '').replace(/ · (血压|体重)$/, '')} · ${label}` } : followUp.weeklyTemplate;
  const successorId = weeklySuccessorId(followUp._id, item);
  const insert = {
    _id: successorId,
    weeklyParentId: followUp._id,
    repeatWeekly: true,
    weeklyTemplate: template,
    tenantId: followUp.tenantId || null,
    patientId: followUp.patientId,
    staffId: followUp.staffId,
    assignedTo: followUp.assignedTo,
    clientVisible: followUp.clientVisible !== false,
    date: nextWeeklyDate(followUp.completedAt || new Date()),
    type: template.type,
    status: 'planned',
    theme: template.theme,
    content: template.content,
    followUpSchemeId: template.followUpSchemeId || null,
    formData: template.formData || null,
    checkInItems: template.checkInItems || [],
    repeatDaily: false,
  };
  try {
    return await FollowUp.findOneAndUpdate(
      { _id: successorId },
      { $setOnInsert: insert },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code === 11000) return FollowUp.findById(successorId);
    throw error;
  }
}

// Each measurement closes only its own weekly cycle. An older combined task keeps
// the unmeasured items in place while the measured item gets its own successor.
async function completeWeeklyCheckIn(patientId, item, measuredAt) {
  const measured = new Date(measuredAt);
  if (!Number.isFinite(measured.getTime())) return null;
  const chinaDay = new Date(measured.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const endOfDay = new Date(`${chinaDay}T23:59:59.999+08:00`);
  const task = await FollowUp.findOne({ patientId, repeatWeekly: true,
    status: { $in: ['planned', 'in_progress', 'missed'] }, checkInItems: item,
    clientVisible: { $ne: false },
    date: { $lte: endOfDay }, 'formData.healthDataPlan.enabled': { $ne: true },
  }).sort({ date: 1, _id: 1 });
  if (!task) return null;
  if (await require('./staffOnlyFollowUp').isStaffOnlyFollowUpWithScheme(task)) return null;
  const items = [...new Set(task.checkInItems || [])];
  if (items.length === 1) {
    const completed = await FollowUp.findOneAndUpdate({ _id: task._id,
      status: { $in: ['planned', 'in_progress', 'missed'] }, checkInItems: item },
    { $set: { status: 'completed', completedAt: measured, completedBy: 'user',
      completedByUser: true, completedByUserAt: measured } }, { new: true });
    if (completed) await generateNextWeeklyFollowUp(completed,
      (completed.weeklyCompletedItems || []).length ? item : '');
    return completed;
  }
  const remaining = await FollowUp.findOneAndUpdate({ _id: task._id,
    status: { $in: ['planned', 'in_progress', 'missed'] }, checkInItems: item },
  { $pull: { checkInItems: item }, $addToSet: { weeklyCompletedItems: item } }, { new: true });
  if (!remaining) return null;
  await generateNextWeeklyFollowUp({ ...task.toObject(), status: 'completed', completedAt: measured }, item);
  if (!remaining.checkInItems.length) {
    await FollowUp.updateOne({ _id: task._id, status: { $in: ['planned', 'in_progress', 'missed'] }, checkInItems: { $size: 0 } },
      { $set: { status: 'completed', completedAt: measured, completedBy: 'user', completedByUser: true, completedByUserAt: measured } });
  }
  return remaining;
}

module.exports = { nextWeeklyDate, weeklySuccessorId, generateNextWeeklyFollowUp, completeWeeklyCheckIn };
