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
}
