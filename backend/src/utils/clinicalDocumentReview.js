const CLINICAL_CATEGORIES = new Set(['prescription_order', 'outpatient_record', 'inpatient_record']);

const text = value => String(value || '').trim();
const cleanText = value => text(value).slice(0, 2000);

function cleanMedication(row = {}) {
  return {
    includeInCurrentMedication: row.includeInCurrentMedication === true,
    name: cleanText(row.name), brandName: cleanText(row.brandName), specification: cleanText(row.specification),
    dosage: cleanText(row.dosage), method: cleanText(row.method), frequency: cleanText(row.frequency),
    timing: cleanText(row.timing), startDate: cleanText(row.startDate), endDate: cleanText(row.endDate),
    purpose: cleanText(row.purpose), note: cleanText(row.note),
  };
}

function normalizeClinicalReview(category, value = {}) {
  if (!CLINICAL_CATEGORIES.has(category)) return null;
  const base = {
    sourceReviewed: value.sourceReviewed === true,
    clinician: cleanText(value.clinician), department: cleanText(value.department),
    reviewConclusion: cleanText(value.reviewConclusion),
  };
  if (category === 'prescription_order') return {
    ...base, issuedDate: cleanText(value.issuedDate), diagnosis: cleanText(value.diagnosis),
    medicationDecision: ['has_medications', 'none', 'unclear'].includes(value.medicationDecision) ? value.medicationDecision : '',
    noMedicationReason: cleanText(value.noMedicationReason), instructions: cleanText(value.instructions),
    medications: Array.isArray(value.medications) ? value.medications.slice(0, 30).map(cleanMedication) : [],
  };
  if (category === 'outpatient_record') return {
    ...base, visitDate: cleanText(value.visitDate), visitType: cleanText(value.visitType),
    chiefComplaint: cleanText(value.chiefComplaint), diagnoses: Array.isArray(value.diagnoses) ? value.diagnoses.slice(0, 20).map(cleanText).filter(Boolean) : [],
    examination: cleanText(value.examination), testsAndOrders: cleanText(value.testsAndOrders),
    treatmentPlan: cleanText(value.treatmentPlan), medicationInstruction: cleanText(value.medicationInstruction),
    referralAndFollowUp: cleanText(value.referralAndFollowUp),
  };
  return {
    ...base, admissionDate: cleanText(value.admissionDate), dischargeDate: cleanText(value.dischargeDate),
    admissionReason: cleanText(value.admissionReason), diagnoses: Array.isArray(value.diagnoses) ? value.diagnoses.slice(0, 20).map(cleanText).filter(Boolean) : [],
    hospitalCourse: cleanText(value.hospitalCourse), procedures: cleanText(value.procedures), dischargeStatus: cleanText(value.dischargeStatus),
    dischargeInstructions: cleanText(value.dischargeInstructions), medicationInstruction: cleanText(value.medicationInstruction),
    followUpPlan: cleanText(value.followUpPlan),
  };
}

function validateClinicalReview(category, value) {
  if (!CLINICAL_CATEGORIES.has(category)) return null;
  const review = normalizeClinicalReview(category, value);
  if (!review?.sourceReviewed) return '请确认已核对原始资料后再审核通过';
  if (!review.reviewConclusion) return '请填写本次结构化审核结论';
  if (category === 'prescription_order') {
    if (!review.medicationDecision) return '请确认处方是否包含明确的用药医嘱';
    if (review.medicationDecision === 'has_medications' && !review.medications.length) return '请逐项录入处方药物，或改为“无明确用药医嘱”';
    if (review.medicationDecision !== 'has_medications' && !review.noMedicationReason) return '请说明未生成用药记录的依据';
    for (const medication of review.medications) {
      if (!medication.name) return '每项处方药物都需填写通用名或处方名称';
      if (medication.includeInCurrentMedication && (!medication.dosage || !medication.frequency)) return `“${medication.name}”纳入当前用药前需确认剂量和频次`;
    }
  }
  return null;
}

module.exports = { CLINICAL_CATEGORIES, normalizeClinicalReview, validateClinicalReview };
