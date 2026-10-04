const crypto = require('node:crypto');
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Message = require('../models/Message');
const ChatLog = require('../models/ChatLog');
const User = require('../models/User');
const AnnualPlan = require('../models/AnnualPlan');
const { annualExecutionGate } = require('./annualServicePeriod');
const { enabledForPatient } = require('./healthManagementRollout');

const TWO_DAYS = 48 * 60 * 60 * 1000;
const ACTIVE = ['planned', 'in_progress', 'missed'];
const HANDOFF_KEY = 'ai-no-response:v1';

function handoffId(taskId) {
  return new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`${HANDOFF_KEY}:${taskId}`).digest('hex').slice(0, 24));
}

function createRuntime(deps = {}) {
  const followUps = deps.FollowUp || FollowUp;
  const messages = deps.Message || Message;
  const chatLogs = deps.ChatLog || ChatLog;
  const users = deps.User || User;
  const plans = deps.AnnualPlan || AnnualPlan;
  const executionGate = deps.annualExecutionGate || annualExecutionGate;
  const enabled = deps.enabledForPatient || enabledForPatient;

  async function hasReply(task) {
    if (!task.aiNoResponse?.firstSentAt) return false;
    // 任何客户主动留言均按已回应处理，避免跨频道回复后继续催促。
    const since = { $gt: task.aiNoResponse.firstSentAt };
    return !!(await messages.exists({ user: task.patientId, type: 'user', recalled: { $ne: true }, createdAt: since }))
      || !!(await chatLogs.exists({ user: task.patientId, recalled: { $ne: true }, createdAt: since }));
  }

  async function process(task, now) {
    const state = task.aiNoResponse;
    if (!state || state.state !== 'pending' || !ACTIVE.includes(task.status)
      || task.aiStatus !== 'approved' || task.isBlocked
      || task.sourceType !== 'scheduled' || !String(task.sourceScheduleKey || '').startsWith('personalized:')) return 'skipped';
    if (!enabled(task.patientId)) return 'skipped';
    const patient = await users.findById(task.patientId).select('isDeleted assignedHealthManager').lean();
    if (!patient || patient.isDeleted || !patient.assignedHealthManager) return 'skipped';
    const plan = await plans.findById(task.sourceAnnualPlanId).lean();
    if (!plan?.confirmedAt || plan.servicePackageSnapshot?.noResponseRule !== '连续3次（隔日）未配合转人工') return 'skipped';
    if (!(await executionGate(plan)).allowed) return 'skipped';
    const attempts = Number(state.attemptCount || 0);
    if (await hasReply(task)) {
      await followUps.updateOne({ _id: task._id, 'aiNoResponse.state': 'pending' }, { $set: { 'aiNoResponse.state': 'responded', 'aiNoResponse.respondedAt': now } });
      return 'responded';
    }
    if (attempts >= 3) {
      const id = handoffId(task._id);
      await followUps.findOneAndUpdate({ _id: id }, { $setOnInsert: {
        _id: id, patientId: task.patientId, staffId: patient.assignedHealthManager,
        assignedTo: patient.assignedHealthManager, date: now, remindAt: now, type: 'other', status: 'planned',
        theme: `AI随访三次未回应 · ${task.theme || '健康管理'}`,
        plannedContent: 'AI已隔日联系三次，客户仍未回应。请健管专员核对实际情况并人工联系，记录处理结果。',
        content: 'AI已隔日联系三次，等待人工跟进。', tags: ['人工跟进'],
        sourceType: 'ai_no_response', sourceId: task._id, workflowKey: HANDOFF_KEY,
      } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await followUps.updateOne({ _id: task._id, 'aiNoResponse.state': 'pending', 'aiNoResponse.attemptCount': 3 },
        { $set: { 'aiNoResponse.state': 'escalated', 'aiNoResponse.escalatedAt': now } });
      return 'escalated';
    }
    const nextAt = new Date(state.nextAt);
    if (!Number.isFinite(nextAt.getTime()) || nextAt > now) return 'skipped';
    const count = attempts + 1;
    const dedupeKey = `ai-no-response:${task._id}:${count}`;
    const message = await messages.findOneAndUpdate({ dedupeKey }, { $setOnInsert: {
      user: task.patientId, type: 'planner', sender: 'AI健康规划师', title: `健康管理随访（${count}/3）`,
      content: `您好，关于“${task.theme || '健康管理随访'}”，想了解您的进展或需要的协助。方便时请回复消息，我们会根据您的情况继续跟进。`,
      conversationId: `${task.patientId}_planner`, isAI: true, unread: true, dedupeKey,
    } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await followUps.updateOne({ _id: task._id, status: { $in: ACTIVE }, 'aiNoResponse.state': 'pending', 'aiNoResponse.attemptCount': attempts },
      { $set: { 'aiNoResponse.attemptCount': count, 'aiNoResponse.nextAt': new Date(now.getTime() + TWO_DAYS),
        ...(attempts === 0 ? { 'aiNoResponse.firstSentAt': message.createdAt || now } : {}),
        'aiNoResponse.lastSentAt': message.createdAt || now } });
    return 'sent';
  }

  async function scan(now = new Date(), env = process.env) {
    if (env.AI_NO_RESPONSE_FOLLOWUP_ENABLED !== 'true') return { disabled: true, sent: 0, escalated: 0 };
    const tasks = await followUps.find({ sourceType: 'scheduled', sourceScheduleKey: /^personalized:/,
      status: { $in: ACTIVE }, aiStatus: 'approved', 'aiNoResponse.state': 'pending', 'aiNoResponse.nextAt': { $lte: now } })
      .sort({ 'aiNoResponse.nextAt': 1 }).limit(100).lean();
    const result = { sent: 0, escalated: 0, responded: 0, skipped: 0, errors: 0 };
    for (const task of tasks) {
      try { const outcome = await process(task, now); result[outcome] += 1; }
      catch (error) { result.errors += 1; console.error('[ai-no-response] task failed', String(task._id), error.message); }
    }
    return result;
  }

  return { scan, process };
}

function start() {
  const runtime = createRuntime();
  runtime.scan().catch(error => console.error('[ai-no-response] initial scan failed', error.message));
  setInterval(() => runtime.scan().catch(error => console.error('[ai-no-response] scan failed', error.message)), 24 * 60 * 60 * 1000);
}

module.exports = { createRuntime, handoffId, start };
