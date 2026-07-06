// 企业HR门户专用 API 封装：独立 token 存储（jy_hr_token），与超管/医护端 token 完全隔离
const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/enterprise-hr` : 'http://121.40.156.39/api/enterprise-hr'

let _token = localStorage.getItem('jy_hr_token') || ''

export function setHrToken(t) {
  _token = t
  localStorage.setItem('jy_hr_token', t)
}
export function clearHrToken() {
  _token = ''
  localStorage.removeItem('jy_hr_token')
  localStorage.removeItem('jy_hr_info')
}
export function getHrToken() { return _token }

function handleUnauthorized() {
  clearHrToken()
  if (!window.location.pathname.startsWith('/hr/login')) {
    window.location.href = '/hr/login'
  }
}

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  if (res.status === 401) { handleUnauthorized(); throw new Error('登录已过期，请重新登录') }
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `请求失败 (${res.status})`)
  return data
}

export const hrAPI = {
  login:        (username, password) => req('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  overview:     () => req('/overview'),
  healthSummary:() => req('/health-summary'),
}
