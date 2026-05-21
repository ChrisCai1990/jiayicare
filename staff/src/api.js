const BASE = import.meta.env.VITE_API_URL || 'https://mongodb-production-06f7.up.railway.app/api'

export const getToken   = ()  => localStorage.getItem('jy_staff_token')
export const setToken   = (t) => localStorage.setItem('jy_staff_token', t)
export const clearToken = ()  => {
  localStorage.removeItem('jy_staff_token')
  localStorage.removeItem('jy_staff_info')
}

async function req(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

  // Knowledge
  getKnowledge:    (p = {}) => req('/staff/knowledge?' + qs(p)),
  createKnowledge: (data)   => req('/staff/knowledge', { method: 'POST', body: JSON.stringify(data) }),
  deleteKnowledge: (id)     => req(`/staff/knowledge/${id}`, { method: 'DELETE' }),
  pushKnowledge:   (id, patientIds) => req(`/staff/knowledge/${id}/push`, { method: 'POST', body: JSON.stringify({ patientIds }) }),

  // Questionnaires push
  getQuestionnaires: ()              => req('/staff/questionnaires'),
  pushQuestionnaire: (id, data)      => req(`/staff/questionnaires/${id}/push`, { method: 'POST', body: JSON.stringify(data) }),
  getPushRecords:    (p = {})        => req('/staff/push-records?' + qs(p)),

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
}
