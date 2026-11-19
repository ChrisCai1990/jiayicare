const policy = require('./managementReviewPolicy');

// Jin Juan's historical plans predate explicit flow versions.
function enabled(patientId, env = process.env) {
  return policy.restored(patientId, env);
}

function enabledForPlan(plan, env = process.env) {
  if (!plan) return false;
  if (plan.flowVersion === 2) return true;
  if (plan.flowVersion === 1) return false;
  return enabled(plan.patientId, env);
}

function enabledForNewPlan(patientId, env = process.env) {
  return env.ANNUAL_FLOW_NEW_PLAN_MODE === 'all' || enabled(patientId, env);
}

async function enabledForPlanId(patientId, planId, env = process.env) {
  if (!require('mongoose').isValidObjectId(patientId) || !require('mongoose').isValidObjectId(planId)) return false;
  const AnnualPlan = require('../models/AnnualPlan');
  const plan = await AnnualPlan.findOne({ _id: planId, patientId })
    .select('patientId flowVersion').lean();
  return enabledForPlan(plan, env);
}

async function enabledForYear(patientId, year, env = process.env) {
  if (!require('mongoose').isValidObjectId(patientId) || !Number.isInteger(Number(year))) return false;
  const AnnualPlan = require('../models/AnnualPlan');
  const plans = await AnnualPlan.find({ patientId, year: Number(year) })
    .select('patientId flowVersion pushedAt confirmedAt updatedAt').sort({ updatedAt: -1 }).lean();
  const plan = plans.find(row => row.pushedAt || row.confirmedAt) || plans[0];
  return plan ? enabledForPlan(plan, env) : enabledForNewPlan(patientId, env);
}

function enabledForTask(task, env = process.env) {
  return policy.restored(task?.patientId, env)
    || task?.formData?.annualFlowVersion === 2;
}

module.exports = { enabled, enabledForPlan, enabledForNewPlan, enabledForPlanId, enabledForYear, enabledForTask };
