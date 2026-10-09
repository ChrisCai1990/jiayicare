const DEFAULT_DEPARTMENT = '消化内科';

function customerHospitalFromText(text) {
  const match = String(text || '').match(/(?:客户意向(?:医院|机构)|意向(?:医院|机构))\s*[:：]\s*([^\n；;，,]+)/);
  return match?.[1]?.trim() || '';
}

function advisorDraft(data = {}, orderNote = '') {
  const draft = data && typeof data === 'object' ? data : {};
  const customerHospital = customerHospitalFromText(draft.customerRequest || orderNote)
    || customerHospitalFromText(orderNote);
  return {
    ...draft,
    hospital: draft.hospital || customerHospital,
    department: draft.department || DEFAULT_DEPARTMENT,
    hospitalSource: draft.hospitalSource || (!draft.hospital && customerHospital ? 'customer_intention' : ''),
  };
}

module.exports = { DEFAULT_DEPARTMENT, customerHospitalFromText, advisorDraft };
