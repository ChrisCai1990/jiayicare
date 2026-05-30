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

  // 用户信息变更记录
  changeLogs: (params = {}) => req('/change-logs?' + new URLSearchParams(params).toString()),

  // 医护账号管理（旧，保留兼容）
  staffList:   (params = {}) => req('/staff?' + new URLSearchParams(params).toString()),
  createStaff: (data)        => req('/staff', { method: 'POST', body: JSON.stringify(data) }),
  updateStaff: (id, data)    => req(`/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStaff: (id)          => req(`/staff/${id}`, { method: 'DELETE' }),

  // 会员类型管理（旧，保留兼容）
  memberTypes:        ()         => req('/member-types'),
  createMemberType:   (data)     => req('/member-types', { method: 'POST', body: JSON.stringify(data) }),
  toggleMemberType:   (id)       => req(`/member-types/${id}/toggle`, { method: 'PATCH' }),
  deleteMemberType:   (id)       => req(`/member-types/${id}`, { method: 'DELETE' }),

  // 商城产品分类管理
  productCategories:      ()       => req('/product-categories'),
  createProductCategory:  (data)   => req('/product-categories', { method: 'POST', body: JSON.stringify(data) }),
  deleteProductCategory:  (id)     => req(`/product-categories/${id}`, { method: 'DELETE' }),

  // 图片上传（multipart）
  uploadImage: async (file) => {
    const fd = new FormData()
    fd.append('image', file)
    const headers = {}
    const token = _token
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${BASE}/upload/image`, { method: 'POST', headers, body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || '上传失败')
    return data
  },

  // 商城产品管理
  products:           (params = {}) => req('/products?' + new URLSearchParams(params).toString()),
  createProduct:      (data)     => req('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct:      (id, data) => req(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleProduct:      (id)       => req(`/products/${id}/toggle`, { method: 'PATCH' }),
  batchToggleProducts:(ids, status) => req('/products/batch-toggle', { method: 'PATCH', body: JSON.stringify({ ids, status }) }),
  deleteProduct:      (id)       => req(`/products/${id}`, { method: 'DELETE' }),

  // 年度健康管理方案
  getAnnualPlan:  (patientId, year) => req(`/patients/${patientId}/annual-plan` + (year ? `?year=${year}` : '')),
  saveAnnualPlan: (patientId, data) => req(`/patients/${patientId}/annual-plan`, { method: 'PUT', body: JSON.stringify(data) }),

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

  // ── 基本设置 ────────────────────────────────────────────────

  // 企业信息
  getCompanyInfo:    ()       => req('/company-info'),
  saveCompanyInfo:   (data)   => req('/company-info', { method: 'PUT', body: JSON.stringify(data) }),

  // 部门管理
  departments:       ()         => req('/departments'),
  createDept:        (data)     => req('/departments', { method: 'POST', body: JSON.stringify(data) }),
  updateDept:        (id, data) => req(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleDept:        (id)       => req(`/departments/${id}/toggle`, { method: 'PATCH' }),
  deleteDept:        (id)       => req(`/departments/${id}`, { method: 'DELETE' }),

  // 角色管理
  roles:             ()         => req('/roles'),
  createRole:        (data)     => req('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole:        (id, data) => req(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRole:        (id)       => req(`/roles/${id}`, { method: 'DELETE' }),

  // 员工管理
  employees:         (params = {}) => req('/employees?' + new URLSearchParams(params).toString()),
  createEmployee:    (data)     => req('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee:    (id, data) => req(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleEmployee:    (id)       => req(`/employees/${id}/toggle`, { method: 'PATCH' }),
  resetEmpPassword:  (id, password) => req(`/employees/${id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
  deleteEmployee:    (id)       => req(`/employees/${id}`, { method: 'DELETE' }),

  // 会员标签
  memberTags:        ()         => req('/member-tags'),
  createMemberTag:   (data)     => req('/member-tags', { method: 'POST', body: JSON.stringify(data) }),
  updateMemberTag:   (id, data) => req(`/member-tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleMemberTag:   (id)       => req(`/member-tags/${id}/toggle`, { method: 'PATCH' }),
  deleteMemberTag:   (id)       => req(`/member-tags/${id}`, { method: 'DELETE' }),

  // 会员来源
  memberSources:      ()         => req('/member-sources'),
  createMemberSource: (data)     => req('/member-sources', { method: 'POST', body: JSON.stringify(data) }),
  updateMemberSource: (id, data) => req(`/member-sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleMemberSource: (id)       => req(`/member-sources/${id}/toggle`, { method: 'PATCH' }),
  deleteMemberSource: (id)       => req(`/member-sources/${id}`, { method: 'DELETE' }),

  // 会员类型（树形）
  memberTypesTree:       ()         => req('/member-types-tree'),
  createMemberTypeTree:  (data)     => req('/member-types-tree', { method: 'POST', body: JSON.stringify(data) }),
  updateMemberTypeTree:  (id, data) => req(`/member-types-tree/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleMemberTypeTree:  (id)       => req(`/member-types-tree/${id}/toggle`, { method: 'PATCH' }),
  deleteMemberTypeTree:  (id)       => req(`/member-types-tree/${id}`, { method: 'DELETE' }),

  // ── 项目设置 ────────────────────────────────────────────────

  // 分类管理
  categories:        ()         => req('/categories'),
  createCategory:    (data)     => req('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory:    (id, data) => req(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory:    (id)       => req(`/categories/${id}`, { method: 'DELETE' }),

  // 疾病名称库
  diseases:          (params = {}) => req('/diseases?' + new URLSearchParams(params).toString()),
  createDisease:     (data)     => req('/diseases', { method: 'POST', body: JSON.stringify(data) }),
  updateDisease:     (id, data) => req(`/diseases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDisease:     (id)       => req(`/diseases/${id}`, { method: 'DELETE' }),
  importDiseases:    (items)    => req('/diseases/import', { method: 'POST', body: JSON.stringify({ items }) }),

  // 检验项目
  labTestItems:      (params = {}) => req('/lab-test-items?' + new URLSearchParams(params).toString()),
  createLabTestItem: (data)     => req('/lab-test-items', { method: 'POST', body: JSON.stringify(data) }),
  updateLabTestItem: (id, data) => req(`/lab-test-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleLabTestItem: (id)       => req(`/lab-test-items/${id}/toggle`, { method: 'PATCH' }),
  deleteLabTestItem: (id)       => req(`/lab-test-items/${id}`, { method: 'DELETE' }),

  // 检验医嘱
  labTestOrders:      (params = {}) => req('/lab-test-orders?' + new URLSearchParams(params).toString()),
  createLabTestOrder: (data)     => req('/lab-test-orders', { method: 'POST', body: JSON.stringify(data) }),
  updateLabTestOrder: (id, data) => req(`/lab-test-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleLabTestOrder: (id)       => req(`/lab-test-orders/${id}/toggle`, { method: 'PATCH' }),
  deleteLabTestOrder: (id)       => req(`/lab-test-orders/${id}`, { method: 'DELETE' }),

  // 检验套餐
  labTestPackages:      (params = {}) => req('/lab-test-packages?' + new URLSearchParams(params).toString()),
  createLabTestPackage: (data)     => req('/lab-test-packages', { method: 'POST', body: JSON.stringify(data) }),
  updateLabTestPackage: (id, data) => req(`/lab-test-packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleLabTestPackage: (id)       => req(`/lab-test-packages/${id}/toggle`, { method: 'PATCH' }),
  deleteLabTestPackage: (id)       => req(`/lab-test-packages/${id}`, { method: 'DELETE' }),

  // 特殊检查项目
  specialExams:      (params = {}) => req('/special-exams?' + new URLSearchParams(params).toString()),
  createSpecialExam: (data)     => req('/special-exams', { method: 'POST', body: JSON.stringify(data) }),
  updateSpecialExam: (id, data) => req(`/special-exams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleSpecialExam: (id)       => req(`/special-exams/${id}/toggle`, { method: 'PATCH' }),
  deleteSpecialExam: (id)       => req(`/special-exams/${id}`, { method: 'DELETE' }),

  // 服务项目
  serviceItems:      (params = {}) => req('/service-items?' + new URLSearchParams(params).toString()),
  createServiceItem: (data)     => req('/service-items', { method: 'POST', body: JSON.stringify(data) }),
  updateServiceItem: (id, data) => req(`/service-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleServiceItem: (id)       => req(`/service-items/${id}/toggle`, { method: 'PATCH' }),
  deleteServiceItem: (id)       => req(`/service-items/${id}`, { method: 'DELETE' }),

  // 其他收费
  otherCharges:      (params = {}) => req('/other-charges?' + new URLSearchParams(params).toString()),
  createOtherCharge: (data)     => req('/other-charges', { method: 'POST', body: JSON.stringify(data) }),
  updateOtherCharge: (id, data) => req(`/other-charges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleOtherCharge: (id)       => req(`/other-charges/${id}/toggle`, { method: 'PATCH' }),
  deleteOtherCharge: (id)       => req(`/other-charges/${id}`, { method: 'DELETE' }),

  // 项目模板
  projectTemplates:      ()         => req('/project-templates'),
  createProjectTemplate: (data)     => req('/project-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateProjectTemplate: (id, data) => req(`/project-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProjectTemplate: (id)       => req(`/project-templates/${id}`, { method: 'DELETE' }),

  // 随访表单
  followupForms:      ()         => req('/followup-forms'),
  createFollowupForm: (data)     => req('/followup-forms', { method: 'POST', body: JSON.stringify(data) }),
  updateFollowupForm: (id, data) => req(`/followup-forms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleFollowupForm: (id)       => req(`/followup-forms/${id}/toggle`, { method: 'PATCH' }),
  deleteFollowupForm: (id)       => req(`/followup-forms/${id}`, { method: 'DELETE' }),

  // 随访方案
  followupPlans:      ()         => req('/followup-plans'),
  createFollowupPlan: (data)     => req('/followup-plans', { method: 'POST', body: JSON.stringify(data) }),
  updateFollowupPlan: (id, data) => req(`/followup-plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleFollowupPlan: (id)       => req(`/followup-plans/${id}/toggle`, { method: 'PATCH' }),
  deleteFollowupPlan: (id)       => req(`/followup-plans/${id}`, { method: 'DELETE' }),

  // 健康评分配置
  getScoringConfig:    ()     => req('/system-config/scoring'),
  updateScoringConfig: (data) => req('/system-config/scoring', { method: 'PUT', body: JSON.stringify(data) }),
}
