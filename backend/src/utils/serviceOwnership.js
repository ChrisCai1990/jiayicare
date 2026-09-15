const { resolveHealthPlanner } = require('./healthPlannerAssignment');

const CLOSURE_MODES = new Set(['automatic', 'planner_review']);

function normalizeClosureMode(value) {
  return CLOSURE_MODES.has(value) ? value : 'planner_review';
}

async function resolveServiceSupervisor(patientOrId) {
  return resolveHealthPlanner(patientOrId);
}

function orderOwnershipFields({ supervisorId, initiationSource = 'customer', initiatedByStaff = null, closureMode = 'planner_review' }) {
  return {
    initiationSource,
    initiatedByStaff,
    supervisorId,
    currentStage: 'intake',
    currentAssignee: supervisorId,
    closureMode: normalizeClosureMode(closureMode),
    supervisionStatus: 'pending_intake',
  };
}

function serviceInstanceOwnershipFields({ supervisorId, initiatedByStaff, closureMode = 'planner_review' }) {
  return {
    initiationSource: 'staff',
    initiatedByStaff,
    supervisorId,
    currentStage: 'intake',
    currentAssignee: supervisorId,
    closureMode: normalizeClosureMode(closureMode),
    supervisionStatus: 'pending_intake',
  };
}

module.exports = {
  normalizeClosureMode,
  resolveServiceSupervisor,
  // Transitional alias used by both customer checkout and staff-pushed purchase.
  // Service type never changes the order owner; professional work is assigned as child tasks.
  resolveOrderWorkflowAssignee: resolveServiceSupervisor,
  orderOwnershipFields,
  serviceInstanceOwnershipFields,
};
