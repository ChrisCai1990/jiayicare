const FollowUp = require('../models/FollowUp');

const isReportInterpretation = name => /(?:体检)?报告.*(?:解读|解析)|(?:解读|解析).*(?:体检)?报告/.test(String(name || ''));
const isPlanDesign = name => /体检.*方案.*(?:制定|定制)|(?:制定|定制).*体检.*方案/.test(String(name || ''));

async function activateReportInterpretationTasks(patientId, at = new Date()) {
  if (!patientId) return;
  await FollowUp.updateMany({
    patientId,
    sourceType: 'health_plan',
    taskRole: 'executor',
    activationEvent: 'checkup_report_uploaded',
    isBlocked: true,
    status: { $in: ['planned', 'in_progress'] },
  }, { $set: { isBlocked: false, date: at, remindAt: at } });
}

module.exports = { isReportInterpretation, isPlanDesign, activateReportInterpretationTasks };
