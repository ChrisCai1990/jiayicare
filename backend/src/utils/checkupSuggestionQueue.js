const { randomUUID } = require('crypto');
const idOf = value => String(value?._id || value || '');

async function authorizedActor(run, plan, models) {
  const actor = await models.Admin.findById(run.actorId).lean();
  if (!actor || actor.staffStatus === 'inactive' || !['familyDoctor', 'superadmin'].includes(actor.role)) throw new Error('actor unavailable');
  const patient = await models.User.findById(plan.patientId).lean();
  if (!patient || (actor.tenantId && idOf(actor.tenantId) !== idOf(patient.tenantId))) throw new Error('tenant mismatch');
  if (actor.customRoleId && actor.role !== 'superadmin') {
    const role = await models.StaffRole.findById(actor.customRoleId).lean();
    if (!role?.permissions?.followups?.edit || !role.permissions?.plans?.edit
      || role.permissions.plans.planTypes?.annual_checkup === false) throw new Error('permission changed');
  }
  return actor;
}

async function drainQueue(models, service) {
  // The marker is in the initial plan insert, so a crash before queue insertion
  // remains discoverable. Old drafts without this marker are never backfilled.
  const plans = models.HealthPlan.find({ preparationAddonAuto: true, preparationTaskId: { $ne: null },
    preparationAddonReview: null, status: 'draft', pushedAt: null, 'content.aiStatus': 'pending' }).sort({ _id: 1 }).lean().cursor();
  for await (const plan of plans) {
    const task = await models.FollowUp.findById(plan.preparationTaskId).lean();
    // A failed draft/task bind must be repaired before spending any AI budget.
    if (idOf(task?.formData?.annualCheckupPreparation?.evidence?.healthPlanId) !== idOf(plan._id)) continue;
    try {
      await models.Suggestion.updateOne({ _id: plan._id }, { $setOnInsert: {
        _id: plan._id, taskId: plan.preparationTaskId, actorId: plan.staffId,
        token: randomUUID(), status: 'queued', input: null, result: null,
      } }, { upsert: true, runValidators: true });
    } catch (error) { if (error.code !== 11000 || !error.keyPattern?._id) throw error; }
  }
  // Cursor, not a fixed first-page limit: more than 25/500 entries are not lost.
  const queued = models.Suggestion.find({ status: 'queued' }).sort({ _id: 1 }).lean().cursor();
  for await (const run of queued) {
    try {
      const plan = await models.HealthPlan.findById(run._id).lean();
      if (!plan || !plan.preparationAddonAuto || idOf(plan.preparationTaskId) !== idOf(run.taskId)) throw new Error('invalid source');
      const actor = await authorizedActor(run, plan, models);
      await service.generate(run.taskId, actor, { updatedAt: plan.updatedAt, token: run.token });
    } catch {
      // No automatic retries of failed/uncertain AI calls. Current owner sees
      // the failed record in the existing preparation plan, not a new task.
      await models.Suggestion.updateOne({ _id: run._id, token: run.token, status: 'queued' }, { $set: {
        status: 'failed', message: '自动准备未完成，请核对负责人、权限、方案或资料后重试；未修改方案', finishedAt: new Date(),
      } });
    }
  }
}

let running = false;
let requested = false;
function wakeCheckupSuggestionQueue() {
  requested = true;
  if (running) return;
  running = true;
  // Request wakeups must not leak a request's tenant into a global worker.
  require('./tenantScope').runWithoutTenantScope(() => setImmediate(async () => {
    try {
      const runtime = require('./checkupSuggestionRuntime');
      const dependencies = runtime.models();
      do {
        requested = false;
        await drainQueue(dependencies, runtime.service(dependencies));
      } while (requested);
    } catch { console.error('[checkup-preparation] 队列未完成，等待已有每日扫描恢复'); }
    finally { running = false; }
  }));
}
module.exports = { drainQueue, authorizedActor, wakeCheckupSuggestionQueue };
