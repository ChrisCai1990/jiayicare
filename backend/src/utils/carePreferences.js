// Optional logistics preferences, not clinical readiness requirements.
function normalizeCarePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('就医偏好格式无效');
  const text = (v, max) => {
    if (v == null) return '';
    if (typeof v !== 'string' || v.length > max) throw new Error('就医偏好内容过长或格式无效');
    return v.trim();
  };
  const travel = value.allowTravel || '';
  if (!['', 'yes', 'no'].includes(travel)) throw new Error('请选择是否接受异地就医');
  return { city: text(value.city, 100), hospitals: text(value.hospitals, 500), allowTravel: travel };
}
function carePreferenceContext(user) {
  return { residenceCity: user.residence?.city || '', preferredCities: user.carePreferences?.city || user.residence?.city || '', preferredHospitals: user.carePreferences?.hospitals || '', allowTravel: user.carePreferences?.allowTravel || '' };
}
module.exports = { normalizeCarePreferences, carePreferenceContext };
