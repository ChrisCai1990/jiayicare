const AnnualPlanPreparation = require('../models/AnnualPlanPreparation');
const ProfessionalHealthAssessment = require('../models/ProfessionalHealthAssessment');
const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const Medication = require('../models/Medication');
const Supplement = require('../models/Supplement');
const { buildAnnualPlanPreparationChecklist } = require('./annualPlanPreparationChecklist');

async function loadAnnualPlanPreparationChecklist(patientId, year = new Date().getFullYear()) {
  const [patient, preparation, auditedReportCount, activeMedicationCount, activeSupplementCount, assessments] = await Promise.all([
    User.findById(patientId).select('onboardingCompleted assignedFamilyDoctor assignedHealthManager assignedHealthPlanner').lean(),
    AnnualPlanPreparation.findOne({ patientId, year }).lean(),
    MedicalReport.countDocuments({ user: patientId, audit_status: 'audited' }),
    Medication.countDocuments({ user: patientId, active: { $ne: false }, stopped: { $ne: true }, aiStatus: { $ne: 'rejected' } }),
    Supplement.countDocuments({ user: patientId, stopped: { $ne: true }, aiStatus: { $ne: 'rejected' } }),
    ProfessionalHealthAssessment.find({ patientId, purpose: 'annual_input', status: 'approved' }).select('purpose domain status').lean(),
  ]);
  if (!patient) return null;
  return { preparation, checklist: buildAnnualPlanPreparationChecklist({ patient, preparation, auditedReportCount, activeMedicationCount, activeSupplementCount, assessments }) };
}

module.exports = { buildAnnualPlanPreparationChecklist, loadAnnualPlanPreparationChecklist };
