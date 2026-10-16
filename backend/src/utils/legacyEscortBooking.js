const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const User = require('../models/User');

const dateInput = value => {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Restore the missing appointment stage on older, untouched advisor-started escorts.
// The same guard applies to every matching order; visits with any execution result
// and on-site consultations are left in their existing workflow.
async function reconcileForStaff(staff) {
  if (!['healthPlanner', 'healthManager', 'medicalAssistant'].includes(staff.role)) return 0;
  const managerPatients = staff.role === 'healthManager'
    ? await User.find({ assignedHealthManager: staff._id }).select('_id').lean() : [];
  const candidates = staff.role === 'healthManager'
    ? await Order.find({ user: { $in: managerPatients.map(row => row._id) }, currentStage: { $in: ['execute', 'booking'] },
      'medicalProxyPlan.medicalEscort': true, 'medicalProxyPlan.initiationSource': 'staff_direct' }).select('_id').lean()
    : staff.role === 'healthPlanner'
    ? await FollowUp.find({ assignedTo: staff._id, workflowKey: 'medical_proxy:supervise', status: 'in_progress',
      'formData.medicalEscort': true, 'formData.currentStage': 'execute' }).select('sourceOrderId').lean()
    : await FollowUp.find({ assignedTo: staff._id, workflowKey: 'medical_proxy:execute',
      status: { $in: ['planned', 'cancelled'] }, 'formData.medicalEscort': true }).select('sourceOrderId').lean();
  let count = 0;
  for (const candidate of candidates) {
    const order = await Order.findById(candidate.sourceOrderId || candidate._id)
      .select('user status currentStage scheduledAt medicalProxyPlan serviceName').lean();
    if (!order || !['execute', 'booking'].includes(order.currentStage)
      || ['completed', 'cancelled'].includes(order.status)
      || order.medicalProxyPlan?.medicalEscort !== true
      || order.medicalProxyPlan?.adHocConsultation === true
      || order.medicalProxyPlan?.initiationSource !== 'staff_direct') continue;
    const key = { sourceType: 'order', sourceOrderId: order._id };
    const execution = await FollowUp.findOne({ ...key, workflowKey: 'medical_proxy:execute' })
      .select('patientId staffId assignedTo status cancelReason formData executedContent').lean();
    if (!execution || execution.formData?.assignmentMode !== 'automatic' || !(
      execution.status === 'planned'
      || (execution.status === 'cancelled' && execution.cancelReason === '补办健管预约')
    ) || execution.executedContent || execution.formData?.executionOutcome || execution.formData?.executionResult) continue;
    const booking = await FollowUp.findOne({ ...key, workflowKey: 'medical_proxy:booking' }).select('status').lean();
    if (booking && booking.status !== 'planned') continue;
    const patient = await User.findById(order.user).select('assignedHealthManager assignedHealthPlanner').lean();
    if (!patient?.assignedHealthManager || !patient?.assignedHealthPlanner) continue;
    if (execution.status === 'planned') {
      const stopped = await FollowUp.updateOne({ _id: execution._id, status: 'planned', executedContent: { $in: ['', null] } },
        { $set: { status: 'cancelled', cancelReason: '补办健管预约', isBlocked: true } });
      if (!stopped.modifiedCount) continue;
    }
    if (!booking) {
      const now = new Date();
      await FollowUp.findOneAndUpdate({ ...key, workflowKey: 'medical_proxy:booking' }, { $setOnInsert: {
        patientId: execution.patientId, staffId: execution.staffId, assignedTo: patient.assignedHealthManager,
        type: 'other', status: 'planned', date: now, remindAt: now, ...key,
        workflowKey: 'medical_proxy:booking', taskRole: 'executor',
        theme: `就医陪同：健管专员完成陪同预约 · ${order.serviceName}`,
        plannedContent: '核实实际预约信息；完成后转给已指定的就医专员。',
        formData: { planSnapshot: order.medicalProxyPlan, medicalEscort: true, medicalAssistantId: execution.assignedTo,
          preferredDateStart: dateInput(order.scheduledAt), preferredDateEnd: dateInput(order.scheduledAt) },
      } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    await Order.updateOne({ _id: order._id, currentStage: { $in: ['execute', 'booking'] } },
      { $set: { currentStage: 'booking', currentAssignee: patient.assignedHealthManager,
        supervisorId: patient.assignedHealthPlanner } });
    await FollowUp.updateOne({ ...key, workflowKey: 'medical_proxy:supervise', status: 'in_progress' },
      { $set: { 'formData.currentStage': 'booking', content: '当前环节：健管专员完成陪同预约' } });
    count += 1;
  }
  return count;
}

module.exports = { reconcileForStaff };
