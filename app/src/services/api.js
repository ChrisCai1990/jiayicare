// ─── API Service ─────────────────────────────────────────────────
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://jiaycare.com/api';

// 后端返回的图片等资源常是相对路径(/api/uploads/xxx.png)，App 的 <Image> 需要完整 URL 才能加载。
// origin = BASE_URL 去掉末尾 /api。mediaUrl 把相对路径拼成完整地址，已是 http(s) 的原样返回。
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
export function mediaUrl(u) {
  if (!u) return u;
  if (/^https?:\/\//.test(u)) return u;
  return API_ORIGIN + (u.startsWith('/') ? u : '/' + u);
}

// Simple storage: uses localStorage on web, falls back gracefully
const storage = {
  getItem: (key) => {
    try { return Promise.resolve(localStorage.getItem(key)); } catch { return Promise.resolve(null); }
  },
  setItem: (key, val) => {
    try { localStorage.setItem(key, val); } catch {}
    return Promise.resolve();
  },
  removeItem: (key) => {
    try { localStorage.removeItem(key); } catch {}
    return Promise.resolve();
  },
};

let _token = null;
let _onUnauthorized = null;  // 401 回调，由 AuthContext 注册

export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

export async function loadToken() {
  _token = await storage.getItem('jy_token');
  return _token;
}

export async function saveToken(token) {
  _token = token;
  await storage.setItem('jy_token', token);
}

export async function clearToken() {
  _token = null;
  await storage.removeItem('jy_token');
  await storage.removeItem('jy_user');
}

async function request(path, options = {}) {
  const { timeout: customTimeout, ...fetchOptions } = options;
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  // 默认 15 秒超时；上传报告等大文件操作可传入更长超时
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), customTimeout || 15000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    const data = await res.json();
    if (res.status === 401) {
      await clearToken();
      if (_onUnauthorized) _onUnauthorized();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const errMsg = data.message + (data.error ? `（${data.error}）` : '') || `请求失败(${res.status})`;
      const err = new Error(errMsg);
      if (data.code) err.code = data.code;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时，请检查网络后重试');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Auth ─────────────────────────────────────────────────────────
export const authAPI = {
  sendCode: (phone) =>
    request('/auth/send-code', { method: 'POST', body: JSON.stringify({ phone }) }),

  login: (phone, code) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, code }) }),

  wechatLogin: (code) =>
    request('/auth/wechat', { method: 'POST', body: JSON.stringify({ code }) }),
};

// ── User ─────────────────────────────────────────────────────────
export const userAPI = {
  getMe:           ()             => request('/user/me'),
  getDashboard:    ()             => request('/user/dashboard'),
  updateMe:        (data)         => request('/user/me', { method: 'PUT', body: JSON.stringify(data) }),
  onboarding:      (data)         => request('/user/onboarding', { method: 'POST', body: JSON.stringify(data) }),
  getReport:       (period)       => request(`/user/report?period=${period || 'week'}`),
  sendChangeCode:  (newPhone)     => request('/user/change-phone/send-code', { method: 'POST', body: JSON.stringify({ newPhone }) }),
  changePhone:     (newPhone, code) => request('/user/change-phone', { method: 'POST', body: JSON.stringify({ newPhone, code }) }),
  getAiHealthSummary:  ()         => request('/user/ai-health-summary'),
  postAiHealthSummary: ()         => request('/user/ai-health-summary', { method: 'POST' }),
  getAiRiskAssessment: ()         => request('/user/ai-risk-assessment'),
  postAiRiskAssessment:()         => request('/user/ai-risk-assessment', { method: 'POST' }),
};

// ── Health Records ────────────────────────────────────────────────
export const recordsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/records${q ? '?' + q : ''}`);
  },
  trend: (type) => request(`/records/trend/${type}`),
  create: (data) => request('/records', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => request(`/records/${id}`, { method: 'DELETE' }),
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
  list:       () => request('/tasks'),
  // 设置任务状态（completed / pending）
  setStatus:  (id, status) => request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  complete:   (id) => request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }),
  uncomplete: (id) => request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) }),
  create:     (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Messages ──────────────────────────────────────────────────────
export const messagesAPI = {
  list:        ()            => request('/messages'),
  unreadCount: ()            => request('/messages/unread-count'),
  markRead:    (id)          => request(`/messages/${id}/read`, { method: 'PATCH' }),
  markAllRead: ()            => request('/messages/read-all', { method: 'PATCH' }),
  send:        (to, content) => request('/messages', { method: 'POST', body: JSON.stringify({ to, content }) }),
  getThread:   (role)        => request(`/messages/thread/${role}`),
};

// ── Push Records (医护端推送) ─────────────────────────────────────
export const pushRecordsAPI = {
  list:     ()           => request('/user/push-records'),
  markRead: (id)         => request(`/user/push-records/${id}/read`, { method: 'PATCH' }),
  pay:      (id, data)   => request(`/user/push-records/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
};

// ── Reminders ────────────────────────────────────────────────────
export const remindersAPI = {
  list:   ()     => request('/reminders'),
  toggle: (id)   => request(`/reminders/${id}/toggle`, { method: 'PATCH' }),
  create: (data) => request('/reminders', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id)   => request(`/reminders/${id}`, { method: 'DELETE' }),
};

// ── Medical Reports ───────────────────────────────────────────────
export const reportsAPI = {
  list:        ()     => request('/reports'),
  byCategory:  ()     => request('/reports/by-category'),
  get:         (id)   => request(`/reports/${id}`),
  create:      (data) => request('/reports', { method: 'POST', body: JSON.stringify(data), timeout: 60000 }),
  delete:      (id)   => request(`/reports/${id}`, { method: 'DELETE' }),
  parseAI:     (id)   => request(`/reports/${id}/parse-ai`, { method: 'POST' }),
};

// ── AI Chat ───────────────────────────────────────────────────────
export const chatAPI = {
  send: (messages, userInfo) =>
    request('/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, userInfo }),
    }),
  transfer: (lastMessage) =>
    request('/chat/transfer', {
      method: 'POST',
      body: JSON.stringify({ lastMessage }),
    }),
  getLogs: (userId) => request(`/chat/logs/${userId}`),
};

// ── Questionnaire ─────────────────────────────────────────────────
export const questionnaireAPI = {
  // 旧版固定问卷（健康初评）
  submit: (answers) =>
    request('/questionnaire', { method: 'POST', body: JSON.stringify({ answers }) }),
  // 动态问卷（管理员创建的问卷）
  pending: () =>
    request('/questionnaire/pending'),
  submitDynamic: (id, answers) =>
    request(`/questionnaire/${id}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
};

// ── Checkup Plan / 复查计划 ───────────────────────────────────────
export const checkupAPI = {
  get: () => request('/user/checkup-plan'),
};

// ── Services / 服务商城 ───────────────────────────────────────────
export const servicesAPI = {
  list:  ()                    => request('/services'),
  order: (serviceId, note, paymentMethod, useHealthFund, couponId) =>
    request('/services/order', { method: 'POST', body: JSON.stringify({ serviceId, note, paymentMethod, useHealthFund, couponId }) }),
  coupons: () => request('/services/coupons'),
};

// ── Partner Benefits / 合作伙伴权益 ────────────────────────────────
export const partnerBenefitsAPI = {
  list: () => request('/partner-benefits'),
};

// ── Orders / 我的订单 ─────────────────────────────────────────────
export const ordersAPI = {
  list:   ()    => request('/orders'),
  cancel: (id)  => request(`/orders/${id}/cancel`, { method: 'PATCH' }),
};

// ── Feedback ──────────────────────────────────────────────────────
export const feedbackAPI = {
  submit: (type, content) =>
    request('/feedback', { method: 'POST', body: JSON.stringify({ type, content }) }),
};

// ── System / 系统消息推送 ─────────────────────────────────────────
export const systemAPI = {
  push: () => request('/system/push', { method: 'POST' }),
};

// ── User: 健康方案 / 权益 / 随访任务 ─────────────────────────────
export const plansAPI = {
  list: () => request('/user/plans'),
  listAnnualMgmt: () => request('/user/annual-mgmt-plans'),
  view: (planId) =>
    request(`/user/plans/${planId}/view`, { method: 'PATCH' }),
  confirm: (planId) =>
    request(`/user/plans/${planId}/confirm`, { method: 'PATCH' }),
  confirmAnnualMgmt: (planId) =>
    request(`/user/annual-mgmt-plans/${planId}/confirm`, { method: 'PATCH' }),
  completeItem: (planId, itemId) =>
    request(`/user/plans/${planId}/items/${itemId}/complete`, { method: 'PATCH' }),
};

export const giftsAPI = {
  list: () => request('/user/gifts'),
};

export const pointsAPI = {
  get: () => request('/user/points'),
};

export const followupTasksAPI = {
  list: () => request('/user/followup-tasks'),
  done: (id, done = true) => request(`/user/followup-tasks/${id}/done`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  submitForm: (id, formData) => request(`/user/followup-tasks/${id}/form`, { method: 'POST', body: JSON.stringify({ formData }) }),
};

// ── Exam Requisitions / 检查开单 ──────────────────────────────────
export const requisitionsAPI = {
  list: () => request('/user/requisitions'),
};

// ── Screening / 专项筛查 ──────────────────────────────────────────
export const screeningAPI = {
  list:     ()                      => request('/screening'),
  select:   (data)                  => request('/screening', { method: 'POST', body: JSON.stringify(data) }),
  deselect: (id)                    => request(`/screening/${id}`, { method: 'DELETE' }),
  upload:   (id, data)              => request(`/screening/${id}/report`, { method: 'PATCH', body: JSON.stringify(data), timeout: 60000 }),
  complete: (id, note)              => request(`/screening/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ note }) }),
};

// ── Family Members / 共享人账户 ────────────────────────────────────
export const familyAPI = {
  list:   ()        => request('/user/family'),
  add:    (data)    => request('/user/family', { method: 'POST', body: JSON.stringify(data) }),
  remove: (index)   => request(`/user/family/${index}`, { method: 'DELETE' }),
};

// 系统内家庭成员关联（需求6/18）
export const familyLinksAPI = {
  list:           ()                       => request('/user/family-links'),
  search:         (q)                      => request(`/user/family-links/search?q=${encodeURIComponent(q)}`),
  add:            (linkedUserId, relation) => request('/user/family-links', { method: 'POST', body: JSON.stringify({ linkedUserId, relation }) }),
  remove:         (linkId)                 => request(`/user/family-links/${linkId}`, { method: 'DELETE' }),
  pendingInvites: ()                       => request('/user/family-links/pending-invites'),
  acceptInvite:   (inviteId)              => request(`/user/family-links/invites/${inviteId}/accept`, { method: 'PATCH' }),
  rejectInvite:   (inviteId)              => request(`/user/family-links/invites/${inviteId}/reject`, { method: 'PATCH' }),
};

// ── Share / 健康报告分享 ──────────────────────────────────────────
export const shareAPI = {
  create:  (period, snapshot) =>
    request('/user/report/share', { method: 'POST', body: JSON.stringify({ period, snapshot }) }),
  getPublic: (token) =>
    request(`/share/${token}`),
};

// ── User: change phone ────────────────────────────────────────────
// (附加到 userAPI 扩展，这里单独导出方便 AccountSecurityScreen 使用)
export const userPhoneAPI = {
  sendChangeCode: (newPhone) =>
    request('/user/change-phone/send-code', { method: 'POST', body: JSON.stringify({ newPhone }) }),
  changePhone: (newPhone, code) =>
    request('/user/change-phone', { method: 'POST', body: JSON.stringify({ newPhone, code }) }),
};

// ── TTS 语音播报 ─────────────────────────────────────────────────
export const ttsAPI = {
  synthesize: (text, sceneType) =>
    request('/tts/synthesize', { method: 'POST', body: JSON.stringify({ text, sceneType }), timeout: 30000 }),
};
