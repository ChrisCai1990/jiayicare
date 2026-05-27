const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/admin` : 'http://121.40.156.39/api/admin'

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

  // 医护账号管理
  staffList:   (params = {}) => req('/staff?' + new URLSearchParams(params).toString()),
  createStaff: (data)        => req('/staff', { method: 'POST', body: JSON.stringify(data) }),
  updateStaff: (id, data)    => req(`/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStaff: (id)          => req(`/staff/${id}`, { method: 'DELETE' }),

  // 会员类型管理
  memberTypes:        ()         => req('/member-types'),
  createMemberType:   (data)     => req('/member-types', { method: 'POST', body: JSON.stringify(data) }),
  toggleMemberType:   (id)       => req(`/member-types/${id}/toggle`, { method: 'PATCH' }),
  deleteMemberType:   (id)       => req(`/member-types/${id}`, { method: 'DELETE' }),

  // 商城产品管理
  products:           (params = {}) => req('/products?' + new URLSearchParams(params).toString()),
  createProduct:      (data)     => req('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct:      (id, data) => req(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleProduct:      (id)       => req(`/products/${id}/toggle`, { method: 'PATCH' }),
  batchToggleProducts:(ids, status) => req('/products/batch-toggle', { method: 'PATCH', body: JSON.stringify({ ids, status }) }),
  deleteProduct:      (id)       => req(`/products/${id}`, { method: 'DELETE' }),

  // 健康方案模板管理
  planTemplates:      (type)     => req('/plan-templates' + (type ? '?type=' + type : '')),
  createPlanTemplate: (data)     => req('/plan-templates', { method: 'POST', body: JSON.stringify(data) }),
  updatePlanTemplate: (id, data) => req(`/plan-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  copyPlanTemplate:   (id)       => req(`/plan-templates/${id}/copy`, { method: 'POST' }),
  togglePlanTemplate: (id)       => req(`/plan-templates/${id}/toggle`, { method: 'PATCH' }),
  deletePlanTemplate: (id)       => req(`/plan-templates/${id}`, { method: 'DELETE' }),

  // 动态问卷管理
  questionnaires:            ()         => req('/questionnaires'),
  createQuestionnaire:       (data)     => req('/questionnaires', { method: 'POST', body: JSON.stringify(data) }),
  updateQuestionnaire:       (id, data) => req(`/questionnaires/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setQuestionnaireStatus:    (id, status) => req(`/questionnaires/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteQuestionnaire:       (id)       => req(`/questionnaires/${id}`, { method: 'DELETE' }),
  questionnaireResponses:    (id)       => req(`/questionnaires/${id}/responses`),
  copyQuestionnaire:         (id)       => req(`/questionnaires/${id}/copy`, { method: 'POST' }),
  reorderQuestionnaires:     (items)    => req('/questionnaires/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
}
