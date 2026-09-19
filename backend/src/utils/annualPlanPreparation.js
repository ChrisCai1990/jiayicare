const AnnualPlanPreparation = require('../models/AnnualPlanPreparation');
const ProfessionalHealthAssessment = require('../models/ProfessionalHealthAssessment');
const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const Medication = require('../models/Medication');
const Supplement = require('../models/Supplement');
const { buildAnnualPlanPreparationChecklist } = require('./annualPlanPreparationChecklist');
const { loadAnnualPlanContinuity } = require('./annualPlanContinuity');

async function loadAnnualPlanPreparationChecklist(patientId, year = new Date().getFullYear()) {
  const [patient, preparation, auditedReportCount, activeMedicationCount, activeSupplementCount, assessments, continuity] = await Promise.all([
    User.findById(patientId).select('onboardingCompleted assignedFamilyDoctor assignedHealthManager assignedHealthPlanner').lean(),
    AnnualPlanPreparation.findOne({ patientId, year }).lean(),
    MedicalReport.countDocuments({ user: patientId, audit_status: 'audited' }),
    Medication.countDocuments({ user: patientId, active: { $ne: false }, stopped: { $ne: true }, aiStatus: { $ne: 'rejected' } }),
    Supplement.countDocuments({ user: patientId, stopped: { $ne: true }, aiStatus: { $ne: 'rejected' } }),
    ProfessionalHealthAssessment.find({ patientId, purpose: { $in: ['annual_input', 'issue_collaboration'] }, status: 'approved', $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }] }).select('purpose domain status').lean(),
    loadAnnualPlanContinuity(patientId, year),
  ]);
  if (!patient) return null;
  return { preparation, continuity, checklist: buildAnnualPlanPreparationChecklist({ patient, preparation, auditedReportCount, activeMedicationCount, activeSupplementCount, assessments, continuity }) };
}

module.exports = { buildAnnualPlanPreparationChecklist, loadAnnualPlanPreparationChecklist };
