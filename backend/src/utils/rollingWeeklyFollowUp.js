const FollowUp = require('../models/FollowUp');
const mongoose = require('mongoose');
const { createHash } = require('node:crypto');

function weeklySuccessorId(parentId) {
  const bytes = createHash('sha256').update(`weekly-follow-up:v1:${String(parentId)}`).digest().subarray(0, 12);
  return new mongoose.Types.ObjectId(bytes);
}

function nextWeeklyDate(completedAt) {
  const chinaDay = new Date(new Date(completedAt).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const next = new Date(`${chinaDay}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

async function generateNextWeeklyFollowUp(followUp) {
  if (!followUp.repeatWeekly || followUp.status !== 'completed' || !followUp.weeklyTemplate) return null;
  const template = followUp.weeklyTemplate;
  const successorId = weeklySuccessorId(followUp._id);
  const insert = {
    _id: successorId,
    weeklyParentId: followUp._id,
    repeatWeekly: true,
    weeklyTemplate: template,
    tenantId: followUp.tenantId || null,
    patientId: followUp.patientId,
    staffId: followUp.staffId,
    assignedTo: followUp.assignedTo,
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

module.exports = { nextWeeklyDate, weeklySuccessorId, generateNextWeeklyFollowUp };
