const BASE = 'https://mongodb-production-06f7.up.railway.app/api/admin'

let _token = localStorage.getItem('jy_admin_token') || ''

export function setToken(t) {
  _token = t
  localStorage.setItem('jy_admin_token', t)
}
export function clearToken() {
  _token = ''
  localStorage.removeItem('jy_admin_token')
  localStorage.removeItem('jy_admin_info')
}
export function getToken() { return _token }

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `请求失败 (${res.status})`)
  return data
}

export const adminAPI = {
  login:            (username, password) => req('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  dashboard:        ()                   => req('/dashboard'),
  patients:         (params = {})        => req('/patients?' + new URLSearchParams(params).toString()),
  patientDetail:    (id)                 => req(`/patients/${id}`),
  sendMessage:      (id, title, content) => req(`/patients/${id}/message`, { method: 'POST', body: JSON.stringify({ title, content }) }),
  createTask:       (id, data)           => req(`/patients/${id}/task`, { method: 'POST', body: JSON.stringify(data) }),
  orders:           (params = {})        => req('/orders?' + new URLSearchParams(params).toString()),
  updateOrderStatus:(id, status)         => req(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  messages:         (params = {})        => req('/messages?' + new URLSearchParams(params).toString()),

  // 服务商城管理
  services:           ()         => req('/services'),
  createService:      (data)     => req('/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService:      (id, data) => req(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleService:      (id)       => req(`/services/${id}/toggle`, { method: 'PATCH' }),
  deleteService:      (id)       => req(`/services/${id}`, { method: 'DELETE' }),

  // 复查计划
  getCheckupPlan:     (userId, year) => req(`/patients/${userId}/checkup-plan${year ? '?year=' + year : ''}`),
  saveCheckupPlan:    (data)         => req('/checkup-plans', { method: 'POST', body: JSON.stringify(data) }),
  updateCheckupItem:  (planId, itemId, data) => req(`/checkup-plans/${planId}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // 用户信息变更记录（#34）
  changeLogs: (params = {}) => req('/change-logs?' + new URLSearchParams(params).toString()),

  // 动态问卷管理
  questionnaires:            ()         => req('/questionnaires'),
  createQuestionnaire:       (data)     => req('/questionnaires', { method: 'POST', body: JSON.stringify(data) }),
  updateQuestionnaire:       (id, data) => req(`/questionnaires/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setQuestionnaireStatus:    (id, status) => req(`/questionnaires/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteQuestionnaire:       (id)       => req(`/questionnaires/${id}`, { method: 'DELETE' }),
  questionnaireResponses:    (id)       => req(`/questionnaires/${id}/responses`),
}
