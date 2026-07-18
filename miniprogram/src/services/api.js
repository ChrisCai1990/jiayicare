// ─── API Service（小程序版） ─────────────────────────────────────
// 移植自 app/src/services/api.js。核心差异：
//  - 小程序不能用 fetch/localStorage，改用 Taro.request + Taro.setStorageSync/getStorageSync
//  - 其余 API 分组/方法/路径/参数与 app 端保持一致（同一套后端）
import Taro from '@tarojs/taro';

const BASE_URL = 'https://jiaycare.com/api';

// 后端返回的图片等资源常是相对路径(/api/uploads/xxx.png)，小程序 <Image> 需要完整 URL 才能加载。
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
export function mediaUrl(u) {
  if (!u) return u;
  if (/^https?:\/\//.test(u)) return u;
  return API_ORIGIN + (u.startsWith('/') ? u : '/' + u);
}

let _token = null;
let _onUnauthorized = null; // 401 回调，由 AuthContext 注册

export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

export function loadToken() {
  try { _token = Taro.getStorageSync('jy_token') || null; } catch { _token = null; }
  return _token;
}

export function saveToken(token) {
  _token = token;
  try { Taro.setStorageSync('jy_token', token); } catch {}
}

export function clearToken() {
  _token = null;
  try {
    Taro.removeStorageSync('jy_token');
    Taro.removeStorageSync('jy_user');
  } catch {}
}

async function request(path, options = {}) {
  const { method = 'GET', body, timeout: customTimeout, header } = options;
  const headers = { 'Content-Type': 'application/json', ...(header || {}) };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  let data;
  if (body) {
    try { data = JSON.parse(body); } catch { data = body; }
  }

  try {
    const res = await Taro.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header: headers,
      timeout: customTimeout || 15000,
    });

    const resData = res.data || {};

    if (res.statusCode === 401) {
      clearToken();
      if (_onUnauthorized) _onUnauthorized();
      throw new Error('登录已过期，请重新登录');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const errMsg = (resData.message || '') + (resData.error ? `（${resData.error}）` : '') || `请求失败(${res.statusCode})`;
      const err = new Error(errMsg);
      if (resData.code) err.code = resData.code;
      throw err;
    }
    return resData;
  } catch (err) {
    if (err.errMsg && /timeout/i.test(err.errMsg)) throw new Error('请求超时，请检查网络后重试');
    throw err;
  }
}

// ── Auth ─────────────────────────────────────────────────────────
export const authAPI = {
  sendCode: (phone) =>
    request('/auth/send-code', { method: 'POST', body: JSON.stringify({ phone }) }),

  login: (phone, code) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, code }) }),

  // 小程序登录：不再走网页授权 code，而是 Taro.login() 拿 code 后传给 /auth/wechat-mp
  wechatLogin: () =>
    Taro.login().then(({ code }) => {
      if (!code) throw new Error('微信登录失败，请重试');
      return request('/auth/wechat-mp', { method: 'POST', body: JSON.stringify({ code }) });
    }),
};

// ── User ─────────────────────────────────────────────────────────
export const userAPI = {
  getMe: () => request('/user/me'),
  getDashboard: () => request('/user/dashboard'),
  updateMe: (data) => request('/user/me', { method: 'PUT', body: JSON.stringify(data) }),
  onboarding: (data) => request('/user/onboarding', { method: 'POST', body: JSON.stringify(data) }),
  getReport: (period) => request(`/user/report?period=${period || 'week'}`),
  sendChangeCode: (newPhone) => request('/user/change-phone/send-code', { method: 'POST', body: JSON.stringify({ newPhone }) }),
  changePhone: (newPhone, code) => request('/user/change-phone', { method: 'POST', body: JSON.stringify({ newPhone, code }) }),
  getAiHealthSummary: () => request('/user/ai-health-summary'),
  postAiHealthSummary: () => request('/user/ai-health-summary', { method: 'POST' }),
  getAiRiskAssessment: () => request('/user/ai-risk-assessment'),
  postAiRiskAssessment: () => request('/user/ai-risk-assessment', { method: 'POST' }),
};

// ── Health Records ────────────────────────────────────────────────
export const recordsAPI = {
  list: (params = {}) => {
    const q = Object.keys(params).filter(k => params[k] != null && params[k] !== '')
      .map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    return request(`/records${q ? '?' + q : ''}`);
  },
  trend: (type) => request(`/records/trend/${type}`),
  create: (data) => request('/records', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => request(`/records/${id}`, { method: 'DELETE' }),
  todayStatus: () => request('/records/today-status'),
};

// ── Medications ───────────────────────────────────────────────────
export const medicationsAPI = {
  list: (status) => request(`/medications${status ? '?status=' + status : ''}`),
  create: (data) => request('/medications', { method: 'POST', body: JSON.stringify(data) }),
  checkin: (id) => request(`/medications/${id}/checkin`, { method: 'POST' }),
  stop: (id, data) => request(`/medications/${id}/stop`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) => request(`/medications/${id}`, { method: 'DELETE' }),
};

// ── Supplements ───────────────────────────────────────────────────
export const supplementsAPI = {
  list: (status) => request(`/supplements${status ? '?status=' + status : ''}`),
  create: (data) => request('/supplements', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/supplements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  checkin: (id) => request(`/supplements/${id}/checkin`, { method: 'POST' }),
  stop: (id, data) => request(`/supplements/${id}/stop`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) => request(`/supplements/${id}`, { method: 'DELETE' }),
};

// ── Tasks ─────────────────────────────────────────────────────────
export const tasksAPI = {
  list: () => request('/tasks'),
  setStatus: (id, status) => request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  complete: (id) => request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }),
  uncomplete: (id) => request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) }),
  create: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Messages ──────────────────────────────────────────────────────
export const messagesAPI = {
  list: () => request('/messages'),
  unreadCount: () => request('/messages/unread-count'),
  markRead: (id) => request(`/messages/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/messages/read-all', { method: 'PATCH' }),
  send: (to, content) => request('/messages', { method: 'POST', body: JSON.stringify({ to, content }) }),
  getThread: (role) => request(`/messages/thread/${role}`),
};

// ── Push Records (医护端推送) ─────────────────────────────────────
export const pushRecordsAPI = {
  list: () => request('/user/push-records'),
  markRead: (id) => request(`/user/push-records/${id}/read`, { method: 'PATCH' }),
  pay: (id, data) => request(`/user/push-records/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
};

// ── Reminders ────────────────────────────────────────────────────
export const remindersAPI = {
  list: () => request('/reminders'),
  toggle: (id) => request(`/reminders/${id}/toggle`, { method: 'PATCH' }),
  create: (data) => request('/reminders', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => request(`/reminders/${id}`, { method: 'DELETE' }),
};

// ── Medical Reports ───────────────────────────────────────────────
export const reportsAPI = {
  list: () => request('/reports'),
  byCategory: () => request('/reports/by-category'),
  get: (id) => request(`/reports/${id}`),
  create: (data) => request('/reports', { method: 'POST', body: JSON.stringify(data), timeout: 60000 }),
  delete: (id) => request(`/reports/${id}`, { method: 'DELETE' }),
  parseAI: (id) => request(`/reports/${id}/parse-ai`, { method: 'POST' }),
  // 小程序专用：用 Taro.chooseImage + Taro.uploadFile 上传报告图片，再走后端 /reports 创建
  uploadFile: (filePath) =>
    Taro.uploadFile({
      url: `${BASE_URL}/reports/upload`,
      filePath,
      name: 'file',
      header: _token ? { Authorization: `Bearer ${_token}` } : {},
    }).then((res) => {
      try { return JSON.parse(res.data); } catch { return res.data; }
    }),
};

// ── AI Chat ───────────────────────────────────────────────────────
export const chatAPI = {
  send: (messages, userInfo) =>
    request('/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, userInfo }),
      timeout: 50000,
    }),
  transfer: (lastMessage) =>
    request('/chat/transfer', { method: 'POST', body: JSON.stringify({ lastMessage }) }),
  getLogs: (userId) => request(`/chat/logs/${userId}`),
};

// ── Questionnaire ─────────────────────────────────────────────────
export const questionnaireAPI = {
  submit: (answers) => request('/questionnaire', { method: 'POST', body: JSON.stringify({ answers }) }),
  pending: () => request('/questionnaire/pending'),
  submitDynamic: (id, answers) => request(`/questionnaire/${id}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
};

// ── Checkup Plan ────────────────────────────────────────────────
export const checkupAPI = {
  get: () => request('/user/checkup-plan'),
};

// ── Services / 服务商城 ───────────────────────────────────────────
export const servicesAPI = {
  list: () => request('/services'),
  order: (serviceId, note, paymentMethod, useHealthFund, couponId) =>
    request('/services/order', { method: 'POST', body: JSON.stringify({ serviceId, note, paymentMethod, useHealthFund, couponId }) }),
  coupons: () => request('/services/coupons'),
};

// ── Partner Benefits ────────────────────────────────────────────
export const partnerBenefitsAPI = {
  list: () => request('/partner-benefits'),
};

// ── Orders ────────────────────────────────────────────────────
export const ordersAPI = {
  list: () => request('/orders'),
  cancel: (id) => request(`/orders/${id}/cancel`, { method: 'PATCH' }),
};

// ── Feedback ──────────────────────────────────────────────────────
export const feedbackAPI = {
  submit: (type, content) => request('/feedback', { method: 'POST', body: JSON.stringify({ type, content }) }),
  mine: () => request('/feedback/mine'),
};

// ── System ─────────────────────────────────────────────────────
export const systemAPI = {
  push: () => request('/system/push', { method: 'POST' }),
};

// ── Plans / Gifts / Points / Followup / Requisitions / Screening ──
export const plansAPI = {
  list: () => request('/user/plans'),
  listAnnualMgmt: () => request('/user/annual-mgmt-plans'),
  view: (planId) => request(`/user/plans/${planId}/view`, { method: 'PATCH' }),
  confirm: (planId) => request(`/user/plans/${planId}/confirm`, { method: 'PATCH' }),
  confirmAnnualMgmt: (planId) => request(`/user/annual-mgmt-plans/${planId}/confirm`, { method: 'PATCH' }),
  completeItem: (planId, itemId) => request(`/user/plans/${planId}/items/${itemId}/complete`, { method: 'PATCH' }),
};

export const giftsAPI = {
  list: () => request('/user/gifts'),
};

export const pointsAPI = {
  get: () => request('/user/points'),
};

export const followupTasksAPI = {
  list: () => request('/user/followup-tasks'),
  done: (id, done = true, needFollowUp = false) => request(`/user/followup-tasks/${id}/done`, { method: 'PATCH', body: JSON.stringify({ done, needFollowUp }) }),
  submitForm: (id, formData) => request(`/user/followup-tasks/${id}/form`, { method: 'POST', body: JSON.stringify({ formData }) }),
};

export const requisitionsAPI = {
  list: () => request('/user/requisitions'),
};

export const screeningAPI = {
  list: () => request('/screening'),
  select: (data) => request('/screening', { method: 'POST', body: JSON.stringify(data) }),
  deselect: (id) => request(`/screening/${id}`, { method: 'DELETE' }),
  upload: (id, data) => request(`/screening/${id}/report`, { method: 'PATCH', body: JSON.stringify(data), timeout: 60000 }),
  complete: (id, note) => request(`/screening/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ note }) }),
};

// ── Family Members ────────────────────────────────────────────────
export const familyAPI = {
  list: () => request('/user/family'),
  add: (data) => request('/user/family', { method: 'POST', body: JSON.stringify(data) }),
  remove: (index) => request(`/user/family/${index}`, { method: 'DELETE' }),
};

export const familyLinksAPI = {
  list: () => request('/user/family-links'),
  search: (q) => request(`/user/family-links/search?q=${encodeURIComponent(q)}`),
  add: (linkedUserId, relation) => request('/user/family-links', { method: 'POST', body: JSON.stringify({ linkedUserId, relation }) }),
  remove: (linkId) => request(`/user/family-links/${linkId}`, { method: 'DELETE' }),
  pendingInvites: () => request('/user/family-links/pending-invites'),
  acceptInvite: (inviteId) => request(`/user/family-links/invites/${inviteId}/accept`, { method: 'PATCH' }),
  rejectInvite: (inviteId) => request(`/user/family-links/invites/${inviteId}/reject`, { method: 'PATCH' }),
};

// ── Share ──────────────────────────────────────────────────────
export const shareAPI = {
  create: (period, snapshot) => request('/user/report/share', { method: 'POST', body: JSON.stringify({ period, snapshot }) }),
  getPublic: (token) => request(`/share/${token}`),
};

// ── change phone ───────────────────────────────────────────────
export const userPhoneAPI = {
  sendChangeCode: (newPhone) => request('/user/change-phone/send-code', { method: 'POST', body: JSON.stringify({ newPhone }) }),
  changePhone: (newPhone, code) => request('/user/change-phone', { method: 'POST', body: JSON.stringify({ newPhone, code }) }),
};

// ── TTS ────────────────────────────────────────────────────────
export const ttsAPI = {
  synthesize: (text, sceneType) =>
    request('/tts/synthesize', { method: 'POST', body: JSON.stringify({ text, sceneType }), timeout: 30000 }),
};
