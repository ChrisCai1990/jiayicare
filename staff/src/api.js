const BASE = import.meta.env.VITE_API_URL || 'https://mongodb-production-06f7.up.railway.app/api'

// Token helpers
export const getToken  = ()  => localStorage.getItem('jy_staff_token')
export const setToken  = (t) => localStorage.setItem('jy_staff_token', t)
export const clearToken = () => {
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

// ── Auth ──────────────────────────────────────────────────────────
export const staffAPI = {
  login: (username, password) =>
    req('/staff/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => req('/staff/me'),

  // Patients
  getPatients: (params = {}) =>
    req('/staff/patients?' + new URLSearchParams(params).toString()),
  getPatient: (id) => req(`/staff/patients/${id}`),
  createPatient: (data) =>
    req('/staff/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, data) =>
    req(`/staff/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Follow-ups
  getFollowUps: (params = {}) =>
    req('/staff/followups?' + new URLSearchParams(params).toString()),
  getPatientFollowUps: (patientId, params = {}) =>
    req(`/staff/patients/${patientId}/followups?` + new URLSearchParams(params).toString()),
  createFollowUp: (data) =>
    req('/staff/followups', { method: 'POST', body: JSON.stringify(data) }),
  updateFollowUp: (id, data) =>
    req(`/staff/followups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFollowUp: (id) =>
    req(`/staff/followups/${id}`, { method: 'DELETE' }),

  // Reports
  getReports: () => req('/staff/reports'),

  // Staff list (for assignment dropdowns)
  getStaffList: (params = {}) =>
    req('/staff/staff-list?' + new URLSearchParams(params).toString()),
}
