const policy = require('./managementReviewPolicy');

// Compatibility flag for monthly review and non-annual follow-up tasks.
function enabled(patientId, env = process.env) {
  return policy.restored(patientId, env);
}

// flowVersion on older records describes how the record was created.
function enabledForPlan(plan) {
  return Boolean(plan);
}

function enabledForNewPlan(patientId) {
  return Boolean(patientId);
}

async function enabledForPlanId(patientId, planId) {
  if (!require('mongoose').isValidObjectId(patientId) || !require('mongoose').isValidObjectId(planId)) return false;
  const AnnualPlan = require('../models/AnnualPlan');
  const plan = await AnnualPlan.findOne({ _id: planId, patientId })
    .select('_id').lean();
  return enabledForPlan(plan);
}

async function enabledForYear(patientId, year) {
  return require('mongoose').isValidObjectId(patientId) && Number.isInteger(Number(year));
}

function enabledForTask(task, env = process.env) {
  return !!task?.sourceAnnualPlanId || policy.restored(task?.patientId, env)
    || task?.formData?.annualFlowVersion === 2;
}

module.exports = { enabled, enabledForPlan, enabledForNewPlan, enabledForPlanId, enabledForYear, enabledForTask };
