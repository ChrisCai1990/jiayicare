const BASE = import.meta.env.VITE_API_URL || 'http://121.40.156.39/api'
export const API_ORIGIN = BASE.replace(/\/api$/, '')

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
  if (res.status === 401) {
    // Token 过期或无效：清空登录状态并跳回登录页
    clearToken()
    localStorage.removeItem('jy_staff_info')
    window.location.href = '/login'
    throw new Error(data.message || 'Token 无效或已过期，请重新登录')
  }
  if (!res.ok) {
    const err = new Error(data.message || '请求失败')
    err.status = res.status
    if (data.needConfirm) { err.needConfirm = true; err.approvedBy = data.approvedBy }
    throw err
  }
  return data
}

const qs = (params) => new URLSearchParams(params).toString()

export const staffAPI = {
  // Auth
  login: (username, password) => req('/staff/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => req('/staff/me'),

  // Patients
  getPatients:        (p = {}) => req('/staff/patients?' + qs(p)),
  getPatient:         (id)     => req(`/staff/patients/${id}`),
  createPatient:      (data)   => req('/staff/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient:      (id, d)  => req(`/staff/patients/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  recalculateScore:   (id)     => req(`/staff/patients/${id}/recalculate-score`, { method: 'POST' }),
  serviceOptions:     ()       => req('/staff/service-options'),        // 服务包下拉选项（admin商城服务）
  memberSourceOptions:()       => req('/staff/member-source-options'),  // 会员来源下拉选项（admin配置）
  searchRegistered:   (q)      => req('/staff/patients/search-registered?q=' + encodeURIComponent(q || '')),
  assignPatient:      (data)   => req('/staff/patients/assign', { method: 'POST', body: JSON.stringify(data) }),

  // Follow-ups
  getFollowUps:        (p = {}) => req('/staff/followups?' + qs(p)),
  getPatientFollowUps: (id, p={})=> req(`/staff/patients/${id}/followups?` + qs(p)),
  createFollowUp:      (data)   => req('/staff/followups', { method: 'POST', body: JSON.stringify(data) }),
  updateFollowUp:      (id, d)  => req(`/staff/followups/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteFollowUp:      (id)     => req(`/staff/followups/${id}`, { method: 'DELETE' }),
  reviewFollowUp:      (id, d)  => req(`/staff/followups/${id}/review`, { method: 'PATCH', body: JSON.stringify(d) }),

  // Health Plans
  getPlans:       (p = {}) => req('/staff/plans?' + qs(p)),
  getPlan:        (id)     => req(`/staff/plans/${id}`),
  createPlan:     (data)   => req('/staff/plans', { method: 'POST', body: JSON.stringify(data) }),
  updatePlan:     (id, d)  => req(`/staff/plans/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deletePlan:     (id)     => req(`/staff/plans/${id}`, { method: 'DELETE' }),
  pushPlan:       (id)     => req(`/staff/plans/${id}/push`, { method: 'PATCH' }),
  // AI体检方案讨论区
  addPlanDiscussion:      (id, content, images) => req(`/staff/plans/${id}/discussions`, { method: 'POST', body: JSON.stringify({ content, images }) }),
  deletePlanDiscussion:   (id, index) => req(`/staff/plans/${id}/discussions/${index}`, { method: 'DELETE' }),
  generatePlanDiscussionReply: (id) => req(`/staff/plans/${id}/discussions/ai-reply`, { method: 'POST' }),
  updatePlanItem: (planId, itemId, d) => req(`/staff/plans/${planId}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(d) }),

  // Medical Reports
  getReports:    (p = {}) => req('/staff/medical-reports?' + qs(p)),
  getReport:     (id)     => req(`/staff/medical-reports/${id}`),
  uploadReport:  (data)   => req('/staff/medical-reports', { method: 'POST', body: JSON.stringify(data) }),
  // 家庭医生双审
  getPendingDoctorAuditReports: (patientId) => req(`/staff/patients/${patientId}/reports/pending-doctor-audit`),
  doctorAuditReport: (patientId, reportId, data) => req(`/staff/patients/${patientId}/reports/${reportId}/doctor-audit`, { method: 'POST', body: JSON.stringify(data) }),
  // 膳食调查问卷营养师复核
  nutritionistReviewResponse: (patientId, responseId) => req(`/staff/patients/${patientId}/questionnaire-responses/${responseId}/nutritionist-review`, { method: 'POST' }),
  // 上传报告后自动识别机构/日期回填表单
  quickMetaFromReportFile: (url, mimeType) => req('/staff/upload/quick-meta', { method: 'POST', body: JSON.stringify({ url, mimeType }) }),
  uploadReportFile: (file, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/staff/upload/report-file`)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)) }
    xhr.onload = () => {
      const res = JSON.parse(xhr.responseText)
      if (xhr.status === 401) { clearToken(); window.location.href = '/login'; reject(new Error('Token 无效')) }
      else if (xhr.status >= 400) reject(new Error(res.message || '上传失败'))
      else resolve(res.data)
    }
    xhr.onerror = () => reject(new Error('网络错误，上传失败'))
    const fd = new FormData()
    fd.append('file', file)
    xhr.send(fd)
  }),
  uploadReportWithProgress: (data, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/staff/medical-reports`)
    xhr.setRequestHeader('Content-Type', 'application/json')
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)) }
    xhr.onload = () => {
      const res = JSON.parse(xhr.responseText)
      if (xhr.status === 401) { clearToken(); window.location.href = '/login'; reject(new Error('Token 无效或已过期')) }
      else if (xhr.status >= 400) reject(new Error(res.message || '上传失败'))
      else resolve(res)
    }
    xhr.onerror = () => reject(new Error('网络错误，上传失败'))
    xhr.send(JSON.stringify(data))
  }),
  auditReport:   (id, d)  => req(`/staff/medical-reports/${id}/audit`, { method: 'PATCH', body: JSON.stringify(d) }),
  updateReport:  (id, d)  => req(`/staff/medical-reports/${id}`,       { method: 'PATCH', body: JSON.stringify(d) }),
  deleteReport:  (id)     => req(`/staff/medical-reports/${id}`,       { method: 'DELETE' }),
  parseReportAI: (id)     => req(`/staff/medical-reports/${id}/parse-ai`, { method: 'POST' }),
  reclassifyReport: (patientId, reportId) => req(`/staff/patients/${patientId}/reports/${reportId}/reclassify`, { method: 'POST' }),
  getScreeningCatalog: () => req('/staff/screening-catalog'),

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
  addServiceSupplement:    (id, d)         => req(`/staff/service-records/${id}/supplement`, { method: 'POST', body: JSON.stringify(d) }),
  editServiceSupplement:   (id, suppId, d) => req(`/staff/service-records/${id}/supplement/${suppId}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteServiceSupplement: (id, suppId)    => req(`/staff/service-records/${id}/supplement/${suppId}`, { method: 'DELETE' }),
  deleteServiceRecord:  (id)     => req(`/staff/service-records/${id}`, { method: 'DELETE' }),
  generateChatFollowupDraft: (patientId, role, range) => req(`/staff/patients/${patientId}/chat-followup/ai-draft`, { method: 'POST', body: JSON.stringify({ role, range }) }),
  reviewRoutineDraft:   (id, d)     => req(`/staff/service-records/${id}/ai-review`, { method: 'PATCH', body: JSON.stringify(d) }),

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
  getProductCategories: () => req('/staff/product-categories'),
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
  giveCoupon:       (id, data) => req(`/staff/patients/${id}/coupons`, { method: 'POST', body: JSON.stringify(data) }),
  getPatientCoupons:(id)       => req(`/staff/patients/${id}/coupons`),

  // P4 — Direct message to patient
  sendMessageToPatient: (id, data) => req(`/staff/patients/${id}/message`, { method: 'POST', body: JSON.stringify(data) }),
  getChatThread:   (userId) => req(`/staff/user-messages/${userId}/thread`),
  replyChatMessage: (userId, content) => req(`/staff/user-messages/${userId}/reply`, { method: 'POST', body: JSON.stringify({ content }) }),

  // P4 — Referrals
  createReferral:        (data)      => req('/staff/referrals', { method: 'POST', body: JSON.stringify(data) }),
  getReferrals:          (p = {})    => req('/staff/referrals?' + qs(p)),
  updateReferral:        (id, data)  => req(`/staff/referrals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getPatientReferrals:   (patientId) => req(`/staff/referrals?patientId=${patientId}&limit=100`),
  generateAIReferralResponseDraft: (id, summary) => req(`/staff/referrals/${id}/ai-response-draft`, { method: 'POST', body: JSON.stringify({ summary: summary || '' }) }),
  markSentReferralsRead: ()          => req('/staff/referrals/mark-sent-read', { method: 'PATCH' }),

  // P4 — Notifications
  getNotifications: ()         => req('/staff/notifications'),
  getExpiringPatients: (days = 30) => req(`/staff/patients/expiring?days=${days}`),

  // P4 — Active plan items for report linking
  getActivePlanItems: (patientId) => req(`/staff/patients/${patientId}/active-plan-items`),

  // Annual Plan
  getAnnualHealthPlans: (year, patientName) => req(`/staff/annual-health-plans?` + qs({ year: year || '', patientName: patientName || '' })),
  getAnnualPlan:        (patientId, year) => req(`/staff/patients/${patientId}/annual-plan` + (year ? `?year=${year}` : '')),
  saveAnnualPlan:       (patientId, data) => req(`/staff/patients/${patientId}/annual-plan`, { method: 'PUT', body: JSON.stringify(data) }),
  confirmSupplyPlan:    (planId) => req(`/staff/supply-plans/${planId}/confirm`, { method: 'PATCH' }),
  pushAnnualPlan:       (patientId, year, planType) => req(`/staff/patients/${patientId}/annual-plan/push?year=${year}` + (planType ? `&planType=${planType}` : ''), { method: 'PATCH' }),
  // 订单管理
  getPatientOrders:     (patientId)       => req(`/staff/patients/${patientId}/orders`),
  startOrder:           (orderId, data)   => req(`/staff/orders/${orderId}/start`, { method: 'PATCH', body: JSON.stringify(data) }),
  setOrderFulfiller:    (orderId, fulfillerId) => req(`/staff/orders/${orderId}/fulfiller`, { method: 'PATCH', body: JSON.stringify({ fulfillerId }) }),

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

  // 患者药物管理
  getPatientMedications:    (id)       => req(`/staff/patients/${id}/medications`),
  createPatientMedication:  (id, data) => req(`/staff/patients/${id}/medications`, { method: 'POST', body: JSON.stringify(data) }),
  updatePatientMedication:  (id, medId, data) => req(`/staff/patients/${id}/medications/${medId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePatientMedication:  (id, medId) => req(`/staff/patients/${id}/medications/${medId}`, { method: 'DELETE' }),

  // 患者营养素管理
  getPatientSupplements:    (id)       => req(`/staff/patients/${id}/supplements`),
  createPatientSupplement:  (id, data) => req(`/staff/patients/${id}/supplements`, { method: 'POST', body: JSON.stringify(data) }),
  updatePatientSupplement:  (id, supId, data) => req(`/staff/patients/${id}/supplements/${supId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePatientSupplement:  (id, supId) => req(`/staff/patients/${id}/supplements/${supId}`, { method: 'DELETE' }),

  // 专项筛查三层目录（从管理端套餐动态读取）
  getScreeningTree:         ()         => req('/staff/screening-tree'),

  // 患者专项筛查 & 日常打卡（医护端查看）
  getPatientScreening:      (id)       => req(`/staff/patients/${id}/screening`),
  dedupPatientScreening:    (id)       => req(`/staff/patients/${id}/screening/dedup`, { method: 'POST', body: JSON.stringify({}) }),
  deleteAIScreeningItem:    (id, data) => req(`/staff/patients/${id}/screening/ai-item`, { method: 'DELETE', body: JSON.stringify(data) }),
  getPatientHealthRecords:  (id, p={}) => req(`/staff/patients/${id}/health-records?` + qs(p)),
  createPatientHealthRecord: (id, data) => req(`/staff/patients/${id}/health-records`, { method: 'POST', body: JSON.stringify(data) }),
  updatePatientHealthRecord: (patientId, recordId, data) => req(`/staff/patients/${patientId}/health-records/${recordId}`, { method: 'PUT', body: JSON.stringify(data) }),
  resolveHealthRecordAlert: (id) => req(`/staff/health-records/${id}/resolve-alert`, { method: 'PATCH' }),
  resolveChatTransfer: (id) => req(`/staff/chat-transfers/${id}/resolve`, { method: 'PATCH' }),

  // 家庭成员关联（需求18）
  getPatientFamilyLinks:    (id)            => req(`/staff/patients/${id}/family-links`),
  addFamilyLink:            (id, data)      => req(`/staff/patients/${id}/family-links`, { method: 'POST', body: JSON.stringify(data) }),
  removeFamilyLink:         (id, linkId)    => req(`/staff/patients/${id}/family-links/${linkId}`, { method: 'DELETE' }),

  // AI 待办任务聚合
  getAiTodos: () => req('/staff/ai-todos'),

  // 日常健康打卡总览
  getCheckinOverview: (p = {}) => req('/staff/checkin-overview?' + qs(p)),

  // 体检方案回传进度总览（哪些客户还有体检项目未完成）
  getCheckupProgress: () => req('/staff/checkup-progress'),

  // 用户留言收件箱
  getUserMessages: () => req('/staff/user-messages'),

  // 回复用户留言
  replyToUser: (userId, content) => req(`/staff/user-messages/${userId}/reply`, { method: 'POST', body: JSON.stringify({ content }) }),
  // 获取用户对话线程
  getUserMessageThread: (userId, role = 'manager') => req(`/staff/user-messages/${userId}/thread?role=${role}`),
  // 标记某用户留言为已读
  markUserMessagesRead: (userId, role = 'manager') => req(`/staff/user-messages/${userId}/read`, { method: 'PATCH', body: JSON.stringify({ role }) }),

  // 我发出的转介
  getSentReferrals: (p = {}) => req('/staff/referrals?direction=sent&' + qs(p)),


  // 4.2 身体成分
  saveBodyComposition: (id, data) => req(`/staff/patients/${id}/body-composition`, { method: 'PATCH', body: JSON.stringify(data) }),
  editBodyCompHistory: (id, index, data) => req(`/staff/patients/${id}/body-composition-history/${index}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBodyCompHistory: (id, index) => req(`/staff/patients/${id}/body-composition-history/${index}`, { method: 'DELETE' }),

  // 专项筛查静态分类目录（OCR 自动/手动归类下拉用）
  getScreeningCatalog: () => req('/staff/screening-catalog'),

  // 问卷 → 健康档案 自动导入
  getQuestionnaireResponses: (id) => req(`/staff/patients/${id}/questionnaire-responses`),
  generateArchiveDraft:      (id, responseId) => req(`/staff/patients/${id}/archive-draft`, { method: 'POST', body: JSON.stringify({ responseId }) }),
  applyArchiveDraft:         (id, items) => req(`/staff/patients/${id}/archive-draft/apply`, { method: 'POST', body: JSON.stringify({ items }) }),
  dismissArchiveDraft:       (id) => req(`/staff/patients/${id}/archive-draft/dismiss`, { method: 'POST' }),

  // 4.4 AI健康汇总 / 4.5 AI管理方案生成
  generateAIHealthSummary: (id, year, scope, force) => req(`/staff/patients/${id}/ai-health-summary`, { method: 'POST', body: JSON.stringify({ year, scope, force }) }),
  updateAIHealthSummary:   (id, data) => req(`/staff/patients/${id}/ai-health-summary`, { method: 'PATCH', body: JSON.stringify(data) }),
  addAIHealthSummaryDiscussion:    (id, content, year, images) => req(`/staff/patients/${id}/ai-health-summary/discussions`, { method: 'POST', body: JSON.stringify({ content, year, images }) }),
  deleteAIHealthSummaryDiscussion: (id, index, year) => req(`/staff/patients/${id}/ai-health-summary/discussions/${index}?year=${year || ''}`, { method: 'DELETE' }),
  generateAIHealthSummaryReply:    (id, year) => req(`/staff/patients/${id}/ai-health-summary/discussions/ai-reply`, { method: 'POST', body: JSON.stringify({ year }) }),
  generateAIAnnualPlan:    (id, planType, notes) => req(`/staff/patients/${id}/ai-annual-plan`,    { method: 'POST', body: JSON.stringify({ planType, notes }) }),

  // 场景七：AI 辅助生成文案草稿（kind: followup | service_record | plan_desc）
  generateAIDraft:         (id, kind, context = {}) => req(`/staff/patients/${id}/ai-draft`, { method: 'POST', body: JSON.stringify({ kind, context }) }),

  // 场景八：AI 风险评估与预警
  generateAIRisk:          (id, year) => req(`/staff/patients/${id}/ai-risk-assessment`, { method: 'POST', body: JSON.stringify({ year }) }),
  updateAIRisk:            (id, data) => req(`/staff/patients/${id}/ai-risk-assessment`, { method: 'PATCH', body: JSON.stringify(data) }),
  // AI风险评估·团队讨论区（与AI健康分析讨论区一致）
  addAIRiskDiscussion:     (id, content, year, images) => req(`/staff/patients/${id}/ai-risk-assessment/discussions?year=${year}`, { method: 'POST', body: JSON.stringify({ content, images }) }),
  deleteAIRiskDiscussion:  (id, index, year) => req(`/staff/patients/${id}/ai-risk-assessment/discussions/${index}?year=${year}`, { method: 'DELETE' }),
  generateAIRiskReply:     (id, year) => req(`/staff/patients/${id}/ai-risk-assessment/discussions/ai-reply?year=${year}`, { method: 'POST' }),
  // 10年ASCVD风险评估
  saveAscvdRisk:           (id, inputs) => req(`/staff/patients/${id}/ascvd-risk`, { method: 'POST', body: JSON.stringify(inputs) }),
  deleteAscvdRisk:         (id, year, index) => req(`/staff/patients/${id}/ascvd-risk?year=${year}${index !== undefined ? `&index=${index}` : ''}`, { method: 'DELETE' }),

  // 场景九：AI 用药建议
  generateAIMedicationSuggest: (id) => req(`/staff/patients/${id}/ai-medication-suggest`, { method: 'POST' }),
  reviewAIMedication: (patientId, medId, action) => req(`/staff/patients/${patientId}/medications/${medId}/ai-review`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  // 场景十：AI 营养素建议
  generateAISupplementSuggest: (id) => req(`/staff/patients/${id}/ai-supplement-suggest`, { method: 'POST' }),
  reviewAISupplement: (patientId, supId, action) => req(`/staff/patients/${patientId}/supplements/${supId}/ai-review`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  reviewPatientMedication: (patientId, medId, action) => req(`/staff/patients/${patientId}/medications/${medId}/review`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  // 场景十五：AI 转介草稿
  generateAIReferralDraft: (id, toRole, toName, reason, attachedHealthInfo) => req(`/staff/patients/${id}/ai-referral-draft`, { method: 'POST', body: JSON.stringify({ toRole, toName, reason, attachedHealthInfo }) }),

  // 场景六：AI 智能随访建议
  generateAIFollowupSuggestion: (id) => req(`/staff/patients/${id}/ai-followup-suggestion`, { method: 'POST' }),
  reviewFollowupDraft:          (id, action, notes, edits, draftToken) => req(`/staff/patients/${id}/ai-followup-draft`, { method: 'PATCH', body: JSON.stringify({ action, notes, edits, draftToken }) }),
  // 场景九：AI 健康教练消息
  generateAICoachMessage:       (id) => req(`/staff/patients/${id}/ai-coach-message`, { method: 'POST' }),
  reviewCoachDraft:             (id, action, message, draftToken) => req(`/staff/patients/${id}/ai-coach-draft`, { method: 'PATCH', body: JSON.stringify({ action, ...(message ? { message } : {}), draftToken }) }),
  sendCoachMessage:             (id, message) => req(`/staff/patients/${id}/coach-message/send`, { method: 'POST', body: JSON.stringify({ message }) }),
  // 场景五：AI 个性化内容推荐
  generateAIContentRecommend:   (id) => req(`/staff/patients/${id}/ai-content-recommend`, { method: 'POST' }),
  // 场景11：AI开单建议（从管理方案异常复查生成，返回建议，不创建记录）
  generateAIExamSuggest: (id) => req(`/staff/patients/${id}/ai-exam-requisition-suggest`, { method: 'POST' }),
  // 场景8：AI营养干预方案（营养师审核）——2026-07-13起必须先选定 templateId 模板，AI只在模板骨架基础上具体化
  generateAINutritionPlan: (id, templateId, goal) => req(`/staff/patients/${id}/ai-nutrition-plan`, { method: 'POST', body: JSON.stringify({ templateId, goal }) }),
  // 场景6：AI年度体检方案（健管专员审核）——2026-07-13起必须先选定 templateId 套餐模板，标准项目原样锁定，AI只在加项库里做选择
  generateAIAnnualCheckupPlan: (id, templateId, goal) => req(`/staff/patients/${id}/ai-annual-checkup-plan`, { method: 'POST', body: JSON.stringify({ templateId, goal }) }),
  // 场景9：AI就医协助方案（就医专员审核），orderId 可选——从商城订单流转过来时带上，用作生成依据；
  // templateId 可选——手动生成场景传入表示专员已手选模板，严格使用；两者都不传则走订单服务名自动匹配的历史兜底路径
  generateAIMedicalAssistPlan: (id, orderId, templateId, briefNote) => req(`/staff/patients/${id}/ai-medical-assist-plan?${orderId ? `orderId=${orderId}&` : ''}${templateId ? `templateId=${templateId}&` : ''}${briefNote ? `briefNote=${encodeURIComponent(briefNote)}` : ''}`, { method: 'POST' }),

  // 4.3 专项筛查
  getScreeningReports:   (id)   => req(`/staff/patients/${id}/screening-reports`),
  getProjectSubItems:    (type, id) => req(`/staff/requisition-items/${type}/${id}/sub-items`),
  createScreeningRecord: (id, data, files) => {
    const fileList = files && files.length > 0 ? files : null
    if (fileList) {
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        fd.append(k, Array.isArray(v) ? JSON.stringify(v) : (v ?? ''))
      })
      fileList.forEach(f => fd.append('files', f))
      return req(`/staff/patients/${id}/screening-records`, { method: 'POST', body: fd })
    }
    return req(`/staff/patients/${id}/screening-records`, { method: 'POST', body: JSON.stringify(data) })
  },
  updateScreeningRecord: (id, rid, data, files) => {
    const fileList = files && files.length > 0 ? files : null
    if (fileList) {
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        fd.append(k, Array.isArray(v) ? JSON.stringify(v) : (v ?? ''))
      })
      fileList.forEach(f => fd.append('files', f))
      return req(`/staff/patients/${id}/screening-records/${rid}`, { method: 'PATCH', body: fd })
    }
    return req(`/staff/patients/${id}/screening-records/${rid}`, { method: 'PATCH', body: JSON.stringify(data) })
  },
  deleteScreeningRecord: (id, rid) => req(`/staff/patients/${id}/screening-records/${rid}`, { method: 'DELETE' }),
}
