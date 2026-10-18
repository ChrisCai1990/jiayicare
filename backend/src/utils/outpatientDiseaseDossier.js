// A first disease overview can only be made from the outpatient fields the
// doctor has just checked in the review form. Keep source and reviewer visible.
function initialSummaryFromOutpatient(outpatient, report, reviewer, now) {
  const joined = (...values) => values.filter(Boolean).join('\n');
  return {
    chiefComplaint: outpatient.chiefComplaint || '',
    presentIllness: outpatient.presentIllness || '',
    physicalExam: joined(outpatient.vitalSigns, outpatient.examination),
    epidemiologicalHistory: '',
    initialDiagnosis: joined(...outpatient.diagnoses),
    currentMedication: outpatient.medicationInstruction || '',
    sourceType: 'medical_record',
    sourceInstitution: String(report.hospital || report.institution || '').trim().slice(0, 200),
    sourceDepartment: String(outpatient.department || '').trim().slice(0, 100),
    sourceDoctor: String(outpatient.clinician || '').trim().slice(0, 100),
    verificationStatus: 'source_verified',
    updatedAt: now,
    updatedById: reviewer._id,
    updatedByName: reviewer.name || reviewer.username || '',
  };
}

module.exports = { initialSummaryFromOutpatient };
