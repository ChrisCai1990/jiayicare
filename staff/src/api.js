const BASE = import.meta.env.VITE_API_URL || 'http://121.40.156.39/api'

export const getToken   = ()  => localStorage.getItem('jy_staff_token')
export const setToken   = (t) => localStorage.setItem('jy_staff_token', t)
export const clearToken = ()  => {
  localStorage.removeItem('jy_staff_token')
  localStorage.removeItem('jy_staff_info')
}

async function req(path, options = {}) {
  const token = getToken()
  const isFormData = options.body instanceof FormData
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || '请求失败')
  return data
}

const qs = (params) => new URLSearchParams(params).toString()

export const staffAPI = {
  // Auth
  login: (username, password) => req('/staff/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => req('/staff/me'),

  // Patients
  getPatients:   (p = {}) => req('/staff/patients?' + qs(p)),
  getPatient:    (id)     => req(`/staff/patients/${id}`),
  createPatient: (data)   => req('/staff/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, d)  => req(`/staff/patients/${id}`, { method: 'PUT', body: JSON.stringify(d) }),

  // Follow-ups
  getFollowUps:        (p = {}) => req('/staff/followups?' + qs(p)),
  getPatientFollowUps: (id, p={})=> req(`/staff/patients/${id}/followups?` + qs(p)),
  createFollowUp:      (data)   => req('/staff/followups', { method: 'POST', body: JSON.stringify(data) }),
  updateFollowUp:      (id, d)  => req(`/staff/followups/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteFollowUp:      (id)     => req(`/staff/followups/${id}`, { method: 'DELETE' }),

  // Health Plans
  getPlans:       (p = {}) => req('/staff/plans?' + qs(p)),
  getPlan:        (id)     => req(`/staff/plans/${id}`),
  createPlan:     (data)   => req('/staff/plans', { method: 'POST', body: JSON.stringify(data) }),
  updatePlan:     (id, d)  => req(`/staff/plans/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deletePlan:     (id)     => req(`/staff/plans/${id}`, { method: 'DELETE' }),
  pushPlan:       (id)     => req(`/staff/plans/${id}/push`, { method: 'PATCH' }),
  updatePlanItem: (planId, itemId, d) => req(`/staff/plans/${planId}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(d) }),

  // Medical Reports
  getReports:    (p = {}) => req('/staff/medical-reports?' + qs(p)),
  getReport:     (id)     => req(`/staff/medical-reports/${id}`),
  uploadReport:  (data)   => req('/staff/medical-reports', { method: 'POST', body: JSON.stringify(data) }),
  auditReport:   (id, d)  => req(`/staff/medical-reports/${id}/audit`, { method: 'PATCH', body: JSON.stringify(d) }),

  // Upload
  uploadImage: (file) => {
    const fd = new FormData(); fd.append('image', file);
    return req('/staff/upload/image', { method: 'POST', body: fd });
  },

  // Knowledge
  getKnowledge:    (p = {}) => req('/staff/knowledge?' + qs(p)),
  createKnowledge: (data)   => req('/staff/knowledge', { method: 'POST', body: JSON.stringify(data) }),
  deleteKnowledge: (id)     => req(`/staff/knowledge/${id}`, { method: 'DELETE' }),
  pushKnowledge:   (id, patientIds) => req(`/staff/knowledge/${id}/push`, { method: 'POST', body: JSON.stringify({ patientIds }) }),

  // FollowUp Forms (admin-created templates)
  getFollowupForms: () => req('/staff/followup-forms'),
  getFollowupPlans: () => req('/staff/followup-plans'),

  // 健康方案模板（新建方案时选用）
  getPlanTemplates: (type) => req('/staff/plan-templates' + (type ? '?type=' + type : '')),

  // 检查开单
  getPatientRequisitions: (patientId)     => req(`/staff/patients/${patientId}/requisitions`),
  createRequisition:      (data)          => req('/staff/requisitions', { method: 'POST', body: JSON.stringify(data) }),
  cancelRequisition:      (id)            => req(`/staff/requisitions/${id}/cancel`, { method: 'PATCH' }),
  getRequisitionItems:    (q = '')        => req(`/staff/requisition-items?q=${encodeURIComponent(q)}`),

  // Questionnaires push
  getQuestionnaires:          ()         => req('/staff/questionnaires'),
  pushQuestionnaire:          (id, data) => req(`/staff/questionnaires/${id}/push`, { method: 'POST', body: JSON.stringify(data) }),
  getQuestionnaireResponses:  (id)       => req(`/staff/questionnaires/${id}/responses`),
  getPushRecords:             (p = {})   => req('/staff/push-records?' + qs(p)),

  // Service Records
  getServiceRecords:    (p = {}) => req('/staff/service-records?' + qs(p)),
  createServiceRecord:  (data)   => req('/staff/service-records', { method: 'POST', body: JSON.stringify(data) }),
  updateServiceRecord:  (id, d)  => req(`/staff/service-records/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteServiceRecord:  (id)     => req(`/staff/service-records/${id}`, { method: 'DELETE' }),

  // Commission
  getMyCommission:  (p = {}) => req('/staff/commission/me?' + qs(p)),
  getReferralCode:  ()       => req('/staff/commission/code'),
  getTeamCommission:()       => req('/staff/commission/team'),

  // Operations
  getOperationsDashboard: () => req('/staff/operations/dashboard'),

  // Reports & Staff list
  getReports2: () => req('/staff/reports'),
  getStaffList: (p = {}) => req('/staff/staff-list?' + qs(p)),

  // P3 — Personal Center
  updateMe:     (data)  => req('/staff/me', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword:(data) => req('/staff/me/password', { method: 'PUT', body: JSON.stringify(data) }),

  // P3 — Products
  getProducts:    (p = {}) => req('/staff/products?' + qs(p)),
  pushProduct:    (id, data) => req(`/staff/products/${id}/push`, { method: 'POST', body: JSON.stringify(data) }),
  pushBundle:     (data)     => req('/staff/products/push-bundle', { method: 'POST', body: JSON.stringify(data) }),

  // P3 — Team
  getTeam: () => req('/staff/team'),

  // P3 — Patient sub-resources
  getPatientPlans:          (id) => req(`/staff/patients/${id}/plans`),
  getPatientReports:        (id) => req(`/staff/patients/${id}/reports`),
  getPatientServiceRecords: (id) => req(`/staff/patients/${id}/service-records`),

  // P4 — Gift Service
  giftToPatient:    (id, data) => req(`/staff/patients/${id}/gift`, { method: 'POST', body: JSON.stringify(data) }),
  getPatientGifts:  (id)       => req(`/staff/patients/${id}/gifts`),

  // P4 — Direct message to patient
  sendMessageToPatient: (id, data) => req(`/staff/patients/${id}/message`, { method: 'POST', body: JSON.stringify(data) }),

  // P4 — Referrals
  createReferral:   (data)     => req('/staff/referrals', { method: 'POST', body: JSON.stringify(data) }),
  getReferrals:     (p = {})   => req('/staff/referrals?' + qs(p)),
  updateReferral:   (id, data) => req(`/staff/referrals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // P4 — Notifications
  getNotifications: ()         => req('/staff/notifications'),
  getExpiringPatients: (days = 30) => req(`/staff/patients/expiring?days=${days}`),

  // P4 — Active plan items for report linking
  getActivePlanItems: (patientId) => req(`/staff/patients/${patientId}/active-plan-items`),

  // Annual Plan
  getAnnualHealthPlans: (year)         => req(`/staff/annual-health-plans` + (year ? `?year=${year}` : '')),
  getAnnualPlan:        (patientId, year) => req(`/staff/patients/${patientId}/annual-plan` + (year ? `?year=${year}` : '')),
  saveAnnualPlan:       (patientId, data) => req(`/staff/patients/${patientId}/annual-plan`, { method: 'PUT', body: JSON.stringify(data) }),

  // Abnormal Reviews
  getAbnormalReviews:    (p = {})   => req('/staff/abnormal-reviews?' + qs(p)),
  createAbnormalReview:  (data)     => req('/staff/abnormal-reviews', { method: 'POST', body: JSON.stringify(data) }),
  updateAbnormalReview:  (id, data) => req(`/staff/abnormal-reviews/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAbnormalReview:  (id)       => req(`/staff/abnormal-reviews/${id}`, { method: 'DELETE' }),

  // Membership management
  getPatientMembership:    (id)     => req(`/staff/patients/${id}/membership`),
  updatePatientMembership: (id, d)  => req(`/staff/patients/${id}/membership`, { method: 'PATCH', body: JSON.stringify(d) }),

  // 会员营销
  getLevels:         ()     => req('/staff/marketing/levels'),
  createLevel:       (data) => req('/staff/marketing/levels', { method: 'POST', body: JSON.stringify(data) }),
  updateLevel:       (id,d) => req(`/staff/marketing/levels/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteLevel:       (id)   => req(`/staff/marketing/levels/${id}`, { method: 'DELETE' }),

  getActivities:     (p={}) => req('/staff/marketing/activities?' + qs(p)),
  createActivity:    (data) => req('/staff/marketing/activities', { method: 'POST', body: JSON.stringify(data) }),
  updateActivity:    (id,d) => req(`/staff/marketing/activities/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteActivity:    (id)   => req(`/staff/marketing/activities/${id}`, { method: 'DELETE' }),

  getPackages:       ()     => req('/staff/marketing/packages'),
  createPackage:     (data) => req('/staff/marketing/packages', { method: 'POST', body: JSON.stringify(data) }),
  updatePackage:     (id,d) => req(`/staff/marketing/packages/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deletePackage:     (id)   => req(`/staff/marketing/packages/${id}`, { method: 'DELETE' }),
}
