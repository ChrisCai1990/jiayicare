import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'
import { StaffListContext, ModulePanel } from '../components/ModulePanel'

// ── 方案类型 ─────────────────────────────────────────────────────────
const PLAN_TYPES = [
  { key: 'health_reshape',    name: '健康重塑方案',   icon: '💪', color: '#1E6B50', bg: '#E8F5EF' },
  { key: 'young_state',       name: '健康年轻态方案', icon: '✨', color: '#7C3AED', bg: '#F3E8FF' },
  { key: 'chronic_stable',    name: '慢病维稳方案',   icon: '🩺', color: '#DC2626', bg: '#FEF2F2' },
  { key: 'health_prevention', name: '健康预防方案',   icon: '🛡️', color: '#0077B6', bg: '#EFF6FF' },
]

const SERVICE_VERSION_STRATEGY = {
  jys_young: 'young_state', jys_stable: 'chronic_stable', jys_reshape: 'health_reshape', jys_advisor: 'chronic_stable',
  jygj_escort: 'health_reshape', jygj_prevention: 'health_prevention', jygj_light: 'young_state',
}
const strategyOf = value => SERVICE_VERSION_STRATEGY[value] || value

const SERVICE_MODE_FIELDS = [
  { key: 'serviceMode', label: '服务落地方式', type: 'select', defaultValue: 'reminder', options: [
    { value: 'reminder', label: '仅提醒（客户 + 健管专员）' },
    { value: 'single', label: '单项服务' },
    { value: 'managed', label: '全托管（一站式服务）' },
  ] },
  { key: 'serviceType', label: '单项服务内容', type: 'select', options: [
    { value: '', label: '请选择（仅单项服务需要）' },
    { value: 'proxy_booking', label: '代约 / 代办' },
    { value: 'proxy_visit', label: '代诊' },
    { value: 'escort_visit', label: '陪诊' },
    { value: 'escort_exam', label: '陪检' },
    { value: 'consult_coordination', label: '会诊协调' },
  ] },
]

// ── 板块定义（key → { name, icon, fields }）──────────────────────────
const MODULE_DEFS = {
  medical_treatment: {
    name: '医疗问题解决', icon: '🏥', multi: true, summaryKey: 'hospital', summaryLabel: '就医医院',
    fields: [
      { key: 'standardPlanName', label: '来源标准模板', type: 'text' },
      { key: 'standardContent', label: '标准执行内容', type: 'textarea' },
      { key: 'standardSchedule', label: '标准执行周期', type: 'textarea' },
      { key: 'visit_time',   label: '就医时间',   type: 'date' },
      { key: 'hospital',     label: '就医医院',   type: 'text', placeholder: '如：省人民医院' },
      { key: 'department',   label: '就诊科室',   type: 'text', placeholder: '如：心内科' },
      { key: 'expert',       label: '专家姓名',   type: 'text' },
      { key: 'reason',       label: '就医原因',   type: 'textarea' },
      { key: 'coordinator',  label: '协调专员',   type: 'staff-select' },
      { key: 'followUpStaff', label: '随访人员',  type: 'staff-select' },
      ...SERVICE_MODE_FIELDS,
      { key: 'notes',        label: '注意事项',   type: 'textarea', internal: true },
    ],
  },
  specialist_collab: {
    name: '全专联合会诊', icon: '👨‍⚕️', multi: true, summaryKey: 'hospital', summaryLabel: '会诊医院',
    fields: [
      { key: 'plan_time',    label: '计划会诊时间', type: 'date' },
      { key: 'plan_method',  label: '计划会诊方式', type: 'text', placeholder: '如：线上/线下' },
      { key: 'hospital',     label: '会诊医院',     type: 'text' },
      { key: 'department',   label: '会诊科室',     type: 'text' },
      { key: 'expert',       label: '会诊专家',     type: 'text' },
      { key: 'purpose',      label: '会诊目的',     type: 'textarea' },
      { key: 'coordinator',  label: '协调专员',     type: 'staff-select' },
      { key: 'followUpStaff', label: '随访人员',    type: 'staff-select' },
      ...SERVICE_MODE_FIELDS,
      { key: 'notes',        label: '注意事项',     type: 'textarea', internal: true },
    ],
  },
  abnormal_followup: {
    name: '异常复查提醒', icon: '🔔', multi: true, summaryKey: 'items', summaryLabel: '复查项目',
    fields: [
      { key: 'standardPlanName', label: '来源标准模板', type: 'text' },
      { key: 'standardContent', label: '标准执行内容', type: 'textarea' },
      { key: 'standardSchedule', label: '标准执行周期', type: 'textarea' },
      { key: 'items',           label: '复查项目',       type: 'text' },
      { key: 'reason',          label: '复查原因',       type: 'textarea' },
      { key: 'hospital',        label: '复查医院',       type: 'text' },
      { key: 'time',            label: '复查时间',       type: 'date' },
      { key: 'department',      label: '检查科室',       type: 'text' },
      { key: 'expert',          label: '检查专家',       type: 'text' },
      { key: 'order_dept',      label: '开单科室',       type: 'text' },
      { key: 'order_expert',    label: '开单专家',       type: 'text' },
      ...SERVICE_MODE_FIELDS,
      { key: 'coordinator',     label: '协调专员',       type: 'staff-select' },
      { key: 'followUpStaff',   label: '随访人员',       type: 'staff-select' },
      { key: 'notes',           label: '注意事项',       type: 'textarea', internal: true },
    ],
  },
  vaccine: {
    name: '疫苗接种', icon: '💉', multi: true, summaryKey: 'name', summaryLabel: '疫苗名称',
    fields: [
      { key: 'standardPlanName', label: '来源标准模板', type: 'text' },
      { key: 'standardContent', label: '标准执行内容', type: 'textarea' },
      { key: 'standardSchedule', label: '标准执行周期', type: 'textarea' },
      { key: 'name',        label: '疫苗名称', type: 'text' },
      { key: 'brand',       label: '品牌',     type: 'text' },
      { key: 'time',        label: '接种时间', type: 'date' },
      { key: 'reason',      label: '接种原因', type: 'textarea' },
      { key: 'institution', label: '接种机构', type: 'text' },
      { key: 'followUpStaff', label: '随访人员', type: 'staff-select' },
      ...SERVICE_MODE_FIELDS,
      { key: 'notes',       label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  monitoring: {
    name: '自动监测提醒', icon: '📊', multi: true, summaryKey: 'items', summaryLabel: '监测项目',
    fields: [
      { key: 'items',     label: '监测项目', type: 'text' },
      { key: 'time',      label: '系统提醒时间', type: 'text', placeholder: '如：08:00' },
      { key: 'purpose',   label: '监测目的', type: 'textarea' },
      { key: 'frequency', label: '系统提醒频率', type: 'text', placeholder: '如：每日一次、每周一次' },
      { key: 'notes',     label: '注意事项', type: 'textarea', internal: true },
      ...SERVICE_MODE_FIELDS,
    ],
  },
  lifestyle: {
    name: '生活方式评估', icon: '🌿',
    fields: [
      { key: 'time',  label: '评估周期', type: 'text', placeholder: '如：2026年上半年' },
      { key: 'focus', label: '评估重点', type: 'textarea' },
      { key: 'staff', label: '评估人员', type: 'staff-select' },
      { key: 'notes', label: '注意事项', type: 'textarea', internal: true },
      ...SERVICE_MODE_FIELDS,
    ],
  },
  annual_checkup: {
    name: '年度体检', icon: '🔬',
    fields: [
      { key: 'standardPlanName', label: '来源标准模板', type: 'text' },
      { key: 'standardContent', label: '标准执行内容', type: 'textarea' },
      { key: 'standardSchedule', label: '标准执行周期', type: 'textarea' },
      { key: 'date',        label: '计划体检日期', type: 'date' },
      { key: 'institution', label: '计划体检机构', type: 'text' },
      { key: 'focus',       label: '重点关注',     type: 'textarea' },
      ...SERVICE_MODE_FIELDS,
      { key: 'followUpStaff', label: '随访人员',   type: 'staff-select' },
    ],
  },
  functional_medicine: {
    name: '功能医学检测', icon: '🧪', multi: true, summaryKey: 'items', summaryLabel: '检测项目',
    fields: [
      { key: 'items',       label: '检测项目', type: 'text' },
      { key: 'institution', label: '检测机构', type: 'text' },
      { key: 'reason',      label: '检测原因', type: 'textarea' },
      { key: 'time',        label: '检测时间', type: 'date' },
      { key: 'followUpStaff', label: '随访人员', type: 'staff-select' },
      { key: 'notes',       label: '注意事项', type: 'textarea', internal: true },
      ...SERVICE_MODE_FIELDS,
    ],
  },
  quarterly_eval: {
    name: '季度评估', icon: '📋',
    fields: [
      { key: 'body_composition', label: '人体成分测量',   type: 'yesno' },
      { key: 'diet_analysis',    label: '膳食调研及分析', type: 'yesno' },
      { key: 'followUpStaff',    label: '随访人员',       type: 'staff-select' },
      ...SERVICE_MODE_FIELDS,
    ],
  },
  medication: {
    name: '药物服用', icon: '💊', multi: true, summaryKey: 'items', summaryLabel: '药物/事项',
    fields: [
      { key: 'items', label: '药物或管理事项', type: 'text' },
      { key: 'frequency', label: '频次', type: 'text' },
      { key: 'time', label: '计划时间', type: 'date' },
      { key: 'followUpStaff', label: '随访人员', type: 'staff-select' },
      { key: 'notes', label: '注意事项', type: 'textarea', internal: true },
      ...SERVICE_MODE_FIELDS,
    ],
  },
  supplement: {
    name: '营养素补充', icon: '🧴', multi: true, summaryKey: 'items', summaryLabel: '营养素/事项',
    fields: [
      { key: 'items', label: '营养素或管理事项', type: 'text' },
      { key: 'frequency', label: '频次', type: 'text' },
      { key: 'time', label: '计划时间', type: 'date' },
      { key: 'followUpStaff', label: '随访人员', type: 'staff-select' },
      { key: 'notes', label: '注意事项', type: 'textarea', internal: true },
      ...SERVICE_MODE_FIELDS,
    ],
  },
  nutrition_intervention: {
    name: '强化营养干预', icon: '🥗', multi: true, summaryKey: 'items', summaryLabel: '干预事项',
    fields: [
      { key: 'items', label: '干预内容', type: 'text' },
      { key: 'frequency', label: '干预频次', type: 'text' },
      { key: 'time', label: '计划时间', type: 'date' },
      { key: 'followUpStaff', label: '随访人员', type: 'staff-select' },
      { key: 'notes', label: '注意事项', type: 'textarea', internal: true },
      ...SERVICE_MODE_FIELDS,
    ],
  },
  checkup_completion: {
    name: '体检完善', icon: '🧾', multi: true, summaryKey: 'items', summaryLabel: '待完善项目',
    fields: [
      { key: 'standardPlanName', label: '来源标准模板', type: 'text' },
      { key: 'standardContent', label: '标准执行内容', type: 'textarea' },
      { key: 'standardSchedule', label: '标准执行周期', type: 'textarea' },
      { key: 'items', label: '待完善项目', type: 'text' },
      { key: 'reason', label: '完善依据', type: 'textarea' },
      { key: 'time', label: '计划日期', type: 'date' },
      { key: 'followUpStaff', label: '执行人', type: 'staff-select' },
      ...SERVICE_MODE_FIELDS,
      { key: 'notes', label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  personalized_followups: {
    name: '个性化方案', icon: '🗓️', multi: true, summaryKey: 'standardPlanName', summaryLabel: '个性化方案',
    fields: [
      { key: 'standardPlanName', label: '标准方案名称', type: 'text' },
      { key: 'standardContent', label: '标准执行内容', type: 'textarea' },
      { key: 'standardSchedule', label: '标准执行周期', type: 'textarea' },
      { key: 'matchReason', label: '选用依据', type: 'textarea' },
      { key: 'personalization', label: '个性化调整', type: 'textarea', placeholder: '只填写相对标准方案需要增加、删减或重点关注的内容；无调整可留空' },
      { key: 'executionDate', label: '主执行日期', type: 'date' },
      { key: 'frequency', label: '执行频次', type: 'text' },
      { key: 'followUpStaff', label: '主执行人', type: 'staff-select' },
      { key: 'collaborator', label: '协同执行人（可选）', type: 'staff-select' },
      { key: 'collaborationDate', label: '协同执行日期（可选）', type: 'date' },
      { key: 'precautions', label: '注意事项', type: 'textarea' },
      { key: 'customerAction', label: '客户行动', type: 'textarea' },
      ...SERVICE_MODE_FIELDS,
    ],
  },
}

// Admin v2年度模板确认的统一事项字段。原模块专属字段继续保留，公共字段用于依据追溯、
// 健康顾问审核和客户确认后的任务拆分。
const COMMON_ACTION_FIELDS = [
  { key: 'basisSummary', label: '设置依据', type: 'textarea', placeholder: '来源报告/研判、日期及已确认事实' },
  { key: 'frequency', label: '执行频率', type: 'text', placeholder: '如：单次、每日1次、每月1次' },
  { key: 'precautions', label: '注意事项', type: 'textarea', placeholder: '检查准备、执行要求或风险提示' },
  { key: 'customerAction', label: '客户行动', type: 'textarea', placeholder: '客户需要查看、记录或完成的事项' },
  { key: 'ownerRole', label: '责任角色', type: 'text', placeholder: '如：健管专员、健康规划师' },
]
Object.values(MODULE_DEFS).forEach(def => {
  if (!def.multi) return
  const existing = new Set(def.fields.map(field => field.key))
  def.fields = [...def.fields, ...COMMON_ACTION_FIELDS.filter(field => !existing.has(field.key))]
})

// Admin“具体方案”名称 → 医护端可编辑板块。顺序完全采用模板 followUpPlans，不再按前端套餐类型猜测。
const templateNodeToModule = (node, index) => {
  const name = String(node?.name || '').replace(/[【】]/g, '').trim()
  let key = ''
  if (/医疗问题解决/.test(name)) key = 'medical_treatment'
  else if (/全专联合会诊/.test(name)) key = 'specialist_collab'
  else if (/异常复查提醒/.test(name)) key = 'abnormal_followup'
  else if (/疫苗接种/.test(name)) key = 'vaccine'
  else if (/药物服用/.test(name)) key = 'medication'
  else if (/营养素补充/.test(name)) key = 'supplement'
  else if (/强化营养干预/.test(name)) key = 'nutrition_intervention'
  else if (/日常监测/.test(name)) key = 'monitoring'
  else if (/年度体检/.test(name)) key = 'annual_checkup'
  else if (/季度评估/.test(name)) key = 'quarterly_eval'
  else if (/生活方式评估/.test(name)) key = `lifestyle_${index}`
  else key = `template_${String(node?.id || index)}`
  const baseKey = key.startsWith('lifestyle_') ? 'lifestyle' : key
  const fallback = { name: name || `方案节点${index + 1}`, icon: '📌', fields: [
    { key: 'time', label: '计划时间/周期', type: 'text' },
    { key: 'content', label: '具体内容', type: 'textarea' },
    { key: 'followUpStaff', label: '随访人员', type: 'staff-select' },
    { key: 'notes', label: '注意事项', type: 'textarea', internal: true },
  ] }
  return { key, def: { ...(MODULE_DEFS[baseKey] || fallback), name: name || MODULE_DEFS[baseKey]?.name || fallback.name }, source: node }
}

const ADMIN_RULE_MODULE_MAP = {
  monitoring: 'monitoring', abnormal_followup: 'abnormal_followup', lifestyle: 'lifestyle',
  medication: 'medication', medical_service: 'medical_treatment', stage_assessment: 'quarterly_eval', annual_checkup: 'annual_checkup',
}

const BASIC_STANDARD_MODULE_KEYS = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'annual_checkup']

const inferStandardCategory = name => {
  const text = String(name || '').replace(/[【】\s]/g, '')
  if (/年度体检/.test(text)) return 'annual_checkup'
  if (/完善体检|体检完善/.test(text)) return 'checkup_completion'
  if (/定期复查|复查/.test(text)) return 'abnormal_followup'
  if (/疫苗|接种/.test(text)) return 'vaccine'
  if (/安排就医|就医协助|就医/.test(text)) return 'medical_treatment'
  return 'personalized'
}

const standardPlanContent = plan => Object.entries(plan?.default_content || {})
  .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
  .map(([key, value]) => `${key}：${value}`)
  .join('；') || '按标准模板执行'

const standardPlanSchedule = plan => (plan?.cycles || []).map((cycle, index) => {
  if (cycle.cycleType === 'date') return `第${index + 1}次由健康顾问确定日期`
  const unit = cycle.cycleUnit === 'week' ? '周' : cycle.cycleUnit === 'month' ? '个月' : '天'
  return `确认后${cycle.cycleDuration || 0}${unit}`
}).join('、') || '由健康顾问确定日期'

const templateEntries = template => {
  // v3起年度规则统一调用全局随访方案库；模板内旧 followUpPlans 只兼容存量，
  // 不再决定客户页面板块。AI筛选结果统一进入“个性化随访方案”。
  const entries = BASIC_STANDARD_MODULE_KEYS.map(key => ({ key, def: MODULE_DEFS[key], source: { key, standardScreening: true } }))
  const usedBaseKeys = new Set(entries.map(entry => entry.key.startsWith('lifestyle_') ? 'lifestyle' : entry.key))
  ;(template?.content?.moduleRules || []).filter(rule => rule.enabled !== false).forEach(rule => {
    const key = ADMIN_RULE_MODULE_MAP[rule.key]
    if (!key || key === 'monitoring' || usedBaseKeys.has(key) || !MODULE_DEFS[key]) return
    entries.push({ key, def: MODULE_DEFS[key], source: rule })
    usedBaseKeys.add(key)
  })
  entries.push({ key: 'personalized_followups', def: MODULE_DEFS.personalized_followups, source: { key: 'global_followup_library' } })
  return entries
}

// ── 各方案类型包含的板块（按顺序）──────────────────────────────────
const PLAN_TYPE_MODULES = {
  health_reshape:    ['medical_treatment', 'specialist_collab', 'abnormal_followup', 'vaccine', 'lifestyle', 'annual_checkup', 'quarterly_eval'],
  young_state:       ['abnormal_followup', 'vaccine', 'functional_medicine', 'lifestyle', 'annual_checkup', 'quarterly_eval'],
  chronic_stable:    ['abnormal_followup', 'vaccine', 'lifestyle', 'annual_checkup', 'quarterly_eval'],
  health_prevention: ['abnormal_followup', 'vaccine', 'annual_checkup'],
}


// ── 主页面 ────────────────────────────────────────────────────────────
// patientMode=true：id 为 patientId，读写 AnnualPlan 模型（年度健康管理 Tab 入口）
// patientMode=false：id 为 HealthPlan._id（年度管理方案 Tab 入口，旧流程）
export default function AnnualMgmtPlanPage({ patientMode = false }) {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { staff } = useStaff()
  // 年度管理方案只归健康顾问负责：营养师等其他角色可以查看方案内容，但不该看到能编辑/推送的入口
  const canEdit = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const [searchParams, setSearchParams] = useSearchParams()

  const [patient, setPatient]       = useState(null)
  const [plan, setPlan]             = useState(null)
  const [planType, setPlanType]     = useState('')
  const [moduleData, setModuleData] = useState({})
  const [plansByType, setPlansByType] = useState({}) // patientMode: { servicePlanCode: plan }，各服务版本独立保存
  const [year, setYear]             = useState(new Date().getFullYear())
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [pushing, setPushing]       = useState(false)
  const [dirty, setDirty]           = useState(false)
  const [pushedAt, setPushedAt]     = useState(null)
  const [confirmedAt, setConfirmedAt] = useState(null)
  const [aiPlanLoading, setAiPlanLoading] = useState(false)
  const [staffList, setStaffList]   = useState([])
  const [adminTemplates, setAdminTemplates] = useState([])
  const [standardPlans, setStandardPlans] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [preparation, setPreparation] = useState(null)
  const [preparationSaving, setPreparationSaving] = useState(false)
  const [preparationDraft, setPreparationDraft] = useState({ requiredAssessmentDomains: '', medicationStatus: 'unknown', supplementStatus: 'unknown', advisorReady: false })
  const [professionalAssessments, setProfessionalAssessments] = useState([])
  const [assessmentBusy, setAssessmentBusy] = useState(false)
  const [assessmentSaving, setAssessmentSaving] = useState(false)
  const [assessmentDraft, setAssessmentDraft] = useState({ domain: '', title: '', facts: '', risks: '', missingInformation: '', recommendations: '' })

  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data || [])).catch(() => {})
    staffAPI.getFollowupPlans().then(r => setStandardPlans(r.data || [])).catch(() => setStandardPlans([]))
  }, [])

  useEffect(() => {
    if (!patientMode || !patient?._id) return
    setTemplatesLoading(true)
    staffAPI.getPlanTemplates('health_management', patient._id)
      .then(r => {
        const templates = r.data || []
        setAdminTemplates(templates)
        const recommended = templates.find(item => item.isRecommended)
        if (recommended) {
          const key = recommended.content?.servicePlanCode || recommended.content?.planType || ''
          setSelectedTemplateId(current => current || recommended._id)
          setPlanType(current => current || key)
        }
      })
      .catch(err => { setAdminTemplates([]); toast(err.message || '加载Admin管理方案模板失败') })
      .finally(() => setTemplatesLoading(false))
  }, [patientMode, patient?._id])

  useEffect(() => {
    setLoading(true)
    if (patientMode) {
      Promise.all([
        staffAPI.getPatient(id),
        staffAPI.getAnnualPlan(id, year),
        staffAPI.getAnnualPlanPreparation(id, year),
        staffAPI.getProfessionalHealthAssessments(id),
      ]).then(([patRes, planRes, preparationRes, assessmentRes]) => {
        setPatient(patRes.data?.user || patRes.data)
        setProfessionalAssessments(assessmentRes.data || [])
        const preparationData = preparationRes.data || null
        setPreparation(preparationData)
        setPreparationDraft({
          requiredAssessmentDomains: (preparationData?.preparation?.requiredAssessmentDomains || []).join('、'),
          medicationStatus: preparationData?.preparation?.medicationStatus || 'unknown',
          supplementStatus: preparationData?.preparation?.supplementStatus || 'unknown',
          advisorReady: !!preparationData?.preparation?.advisorReadyConfirmedAt,
        })
        // 后端返回该年度全部类型的方案数组，按 updatedAt 降序
        const list = Array.isArray(planRes.data) ? planRes.data : (planRes.data ? [planRes.data] : [])
        const map = {}
        list.forEach(p => { const key = p.servicePlanCode || p.planType; if (key) map[key] = p })
        setPlansByType(map)
        // 从"管理方案"tab点"✨ AI年度管理方案"按钮跳转过来时会带 ?planType=xxx，
        // 优先用它选中对应类型（而不是默认选"最近编辑过的那一份"），让用户选的类型立刻生效
        const queryPlanType = searchParams.get('planType')
        const target = queryPlanType && map[queryPlanType]
          ? map[queryPlanType]
          : (queryPlanType ? null : list.find(p => p.servicePlanCode || p.planType))
        if (target) {
          setPlanType(target.servicePlanCode || target.planType)
          setSelectedTemplateId(target.templateId || '')
          setModuleData(target.moduleData || {})
          setPushedAt(target.pushedAt || null)
          setConfirmedAt(target.confirmedAt || null)
        } else if (queryPlanType) {
          // 该类型还没有任何已保存数据，选中类型但板块留空，等用户点AI生成
          setPlanType(queryPlanType)
          setSelectedTemplateId('')
          setModuleData({})
          setPushedAt(null)
          setConfirmedAt(null)
        } else {
          setPlanType('')
          setSelectedTemplateId('')
          setModuleData({})
          setPushedAt(null)
          setConfirmedAt(null)
        }
        setDirty(false)
      }).catch(err => toast(err.message || '加载失败'))
        .finally(() => setLoading(false))
    } else {
      staffAPI.getPlan(id)
        .then(res => {
          const p = res.data
          setPlan(p)
          const c = p.content || {}
          setPlanType(c.planType || '')
          setModuleData(c.moduleData || {})
          setDirty(false)
        })
        .catch(err => toast(err.message || '加载失败'))
        .finally(() => setLoading(false))
    }
  }, [id, patientMode, year])

  const handleModuleChange = useCallback((moduleKey, fieldKey, value) => {
    setModuleData(prev => ({
      ...prev,
      [moduleKey]: { ...(prev[moduleKey] || {}), [fieldKey]: value },
    }))
    setDirty(true)
  }, [])

  const handlePlanTypeChange = (key, template = null) => {
    // 旧流程（HealthPlan）只有一份数据，保持原行为
    if (!patientMode) { setPlanType(key); setDirty(true); return }
    if (key === planType) return
    if (dirty && !window.confirm('当前方案有未保存的更改，切换类型会丢失这些更改，确认切换？')) return
    // 加载该类型自己的数据（每个类型独立一份）
    const p = plansByType[key]
    setPlanType(key)
    setSelectedTemplateId(template?._id || p?.templateId || '')
    setModuleData(p?.moduleData || {})
    setPushedAt(p?.pushedAt || null)
    setConfirmedAt(p?.confirmedAt || null)
    setDirty(false)
  }

  const handleSave = async () => {
    if (!planType) { toast('请先选择方案类型'); return }
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const personalized = moduleData.personalized_followups?.records || []
    const invalid = personalized.find(item =>
      !item.followUpStaff || !item.executionDate ||
      (item.executionDate && item.executionDate < today) ||
      (item.collaborationDate && item.collaborationDate < today) ||
      (item.collaborator && !item.collaborationDate) ||
      (item.collaborationDate && !item.collaborator)
    )
    if (invalid) { toast('每项随访都要选择主执行人和不早于今天的执行日期；协同执行人和日期需要同时填写'); return }
    setSaving(true)
    try {
      if (patientMode) {
        const selectedTemplate = adminTemplates.find(t => t._id === selectedTemplateId)
        const res = await staffAPI.saveAnnualPlan(id, { planType, servicePlanCode: planType, moduleData, year, templateId: selectedTemplateId || null, templateName: selectedTemplate?.content?.planName || selectedTemplate?.name || '' })
        const saved = res.data
        if (saved) {
          setPlansByType(prev => ({ ...prev, [planType]: saved }))
          setPushedAt(saved.pushedAt || null)
          setConfirmedAt(saved.confirmedAt || null)
        }
        toast('方案草稿已保存；审核并推送后才会生成正式执行任务')
      } else {
        await staffAPI.updatePlan(id, { content: { planType, moduleData } })
        toast('方案已保存')
      }
      setDirty(false)
    } catch (err) {
      toast(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 提取成可复用函数：runAIGenerate(type, skipConfirm) —— 按钮手动点击时 skipConfirm=false
  // （需要用户确认覆盖），从"管理方案"tab跳转过来自动触发时 skipConfirm=true（新建的类型
  // 还没有任何内容，不存在"覆盖"风险，不用弹确认框打断体验）
  const runAIGenerate = async (type, skipConfirm = false) => {
    if (!type) { toast('请先在下方选择一个方案类型，再点AI生成'); return }
    const selectedTemplate = adminTemplates.find(t => t._id === selectedTemplateId)
    if (patientMode && !selectedTemplate) { toast('请先选择从Admin后台调取的健康管理方案模板'); return }
    const ptName = selectedTemplate?.content?.planName || selectedTemplate?.name || PLAN_TYPES.find(pt => pt.key === type)?.name || '该类型'
    if (!skipConfirm && !window.confirm(`AI将基于已审核的汇总分析，生成「${ptName}」对应的方案板块，现有内容将被覆盖，确认继续？`)) return
    setAiPlanLoading(true)
    try {
      const res = await staffAPI.generateAIAnnualPlan(id, type, '', selectedTemplateId, year)
      const aiData = res.data || {}
      // 只填充当前所选方案类型包含的板块，其余类型的板块忽略（一次只生成一个方案）
      const configuredRules = selectedTemplate?.content?.moduleRules || []
      const enabledRuleKeys = new Set(configuredRules.filter(rule => rule.enabled !== false && rule.aiCanGenerate !== false).map(rule => ADMIN_RULE_MODULE_MAP[rule.key]).filter(Boolean))
      const strategyType = strategyOf(type)
      const configuredKeys = configuredRules.length ? (PLAN_TYPE_MODULES[strategyType] || []).filter(key => enabledRuleKeys.has(key) || ![...Object.values(ADMIN_RULE_MODULE_MAP)].includes(key)) : (PLAN_TYPE_MODULES[strategyType] || [])
      const allowedKeys = [...new Set([...configuredKeys, ...BASIC_STANDARD_MODULE_KEYS])]
      setModuleData(prev => {
        const merged = { ...prev }
        // 本次为覆盖式重新筛选。先清掉旧的筛选结果，避免“不适用”的旧方案继续残留。
        ;[...allowedKeys, 'personalized_followups'].forEach(key => { delete merged[key] })
        Object.entries(aiData).forEach(([key, val]) => {
          if (key === 'templateNodes') return
          if (!allowedKeys.includes(key)) return
          if (val && (val.records?.length > 0 || val.enabled)) {
            merged[key] = val
          }
        })
        const personalized = (aiData.templateNodes || []).map(node => ({
          standardPlanId: node.standardPlanId || '', standardPlanName: node.standardPlanName || '',
          sourceCycles: node.sourceCycles || [], items: node.standardPlanName || '',
          standardContent: node.standardContent || '', standardSchedule: node.standardSchedule || '',
          matchReason: node.matchReason || '', personalization: node.personalization || node.content || '', executionDate: node.executionDate || node.time || '',
          frequency: node.frequency || '', precautions: node.precautions || '',
          customerAction: node.customerAction || '', followUpStaff: node.defaultEmployeeId || '',
          reviewStatus: 'pending_family_doctor_review',
        }))
        if (personalized.length) merged.personalized_followups = { records: personalized }
        return merged
      })
      setDirty(true)
      const appliedCount = BASIC_STANDARD_MODULE_KEYS.reduce((total, key) => {
        const value = aiData[key]
        return total + (MODULE_DEFS[key]?.multi ? (value?.records?.length || 0) : (value?.enabled ? 1 : 0))
      }, 0) + (aiData.templateNodes?.length || 0)
      toast(appliedCount
        ? `AI已按「${ptName}」采用 ${appliedCount} 项方案，请检查并保存`
        : `「${ptName}」标准动作筛查完成，当前资料下暂无适用项目`)
    } catch (err) {
      toast(err.message || 'AI生成方案失败')
    } finally {
      setAiPlanLoading(false)
    }
  }
  const handleGenerateAIAnnualPlan = () => runAIGenerate(planType, false)

  const handleSavePreparation = async () => {
    setPreparationSaving(true)
    try {
      const requiredAssessmentDomains = preparationDraft.requiredAssessmentDomains.split(/[、,，;；\n]/).map(item => item.trim()).filter(Boolean)
      const res = await staffAPI.updateAnnualPlanPreparation(id, {
        year,
        requiredAssessmentDomains,
        medicationStatus: preparationDraft.medicationStatus,
        supplementStatus: preparationDraft.supplementStatus,
        advisorReady: preparationDraft.advisorReady,
      })
      setPreparation(res.data || null)
      toast(res.data?.checklist?.ready ? '准备清单已完成，可以生成年度方案' : '准备情况已保存，请继续完成未满足项目')
    } catch (err) {
      toast(err.message || '保存准备清单失败')
    } finally {
      setPreparationSaving(false)
    }
  }

  const splitLines = value => value.split(/[\n；;]/).map(item => item.trim()).filter(Boolean)
  const handleCreateAssessment = async () => {
    if (!assessmentDraft.domain.trim() || !assessmentDraft.title.trim() || !assessmentDraft.facts.trim()) { toast('请填写评估领域、标题和客观评估结论'); return }
    setAssessmentSaving(true)
    try {
      const res = await staffAPI.createProfessionalHealthAssessment(id, {
        purpose: 'annual_input', domain: assessmentDraft.domain.trim(), title: assessmentDraft.title.trim(),
        facts: splitLines(assessmentDraft.facts), risks: splitLines(assessmentDraft.risks), missingInformation: splitLines(assessmentDraft.missingInformation),
        recommendations: { followUps: splitLines(assessmentDraft.recommendations).map(content => ({ content })) },
      })
      setProfessionalAssessments(prev => [res.data, ...prev])
      setAssessmentDraft({ domain: '', title: '', facts: '', risks: '', missingInformation: '', recommendations: '' })
      toast('专业健康评估草稿已建立，需健康顾问终审后才能进入年度方案')
    } catch (err) { toast(err.message || '建立评估失败') } finally { setAssessmentSaving(false) }
  }
  const handleReviewAssessment = async (assessmentId, action) => {
    setAssessmentBusy(true)
    try {
      const current = professionalAssessments.find(item => item._id === assessmentId)
      const res = await staffAPI.reviewProfessionalHealthAssessment(assessmentId, { action, revision: current?.__v, followUpDrafts: action === 'approve_advisor' && current?.status !== 'approved' ? (current?.followUpDrafts || []) : undefined })
      setProfessionalAssessments(prev => prev.map(item => item._id === assessmentId ? res.data : item))
      const prepRes = await staffAPI.getAnnualPlanPreparation(id, year)
      setPreparation(prepRes.data || null)
      toast(res.dynamicFollowUps?.warnings?.length ? res.dynamicFollowUps.warnings.join('；') : action === 'approve_advisor' ? '终审已通过，随访发布完成' : '专业评估已提交健康顾问审核')
    } catch (err) { toast(err.message || '审核失败') } finally { setAssessmentBusy(false) }
  }
  const removeAssessmentFollowUpDraft = (assessmentId, index) => setProfessionalAssessments(prev => prev.map(item => item._id === assessmentId ? { ...item, followUpDrafts: (item.followUpDrafts || []).filter((_, draftIndex) => draftIndex !== index) } : item))
  const updateAssessmentFollowUpDraft = (assessmentId, index, patch) => setProfessionalAssessments(prev => prev.map(item => item._id === assessmentId ? { ...item, followUpDrafts: (item.followUpDrafts || []).map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft) } : item))
  const handleAssessmentFollowUpDraft = async assessmentId => {
    setAssessmentBusy(true)
    try {
      const res = await staffAPI.generateAssessmentFollowUpDraft(assessmentId)
      setProfessionalAssessments(prev => prev.map(item => item._id === assessmentId ? { ...item, followUpDrafts: res.data?.followUpDrafts || [], __v: res.data?.revision } : item))
      toast(res.data?.followUpDrafts?.length ? `AI已生成 ${res.data.followUpDrafts.length} 条随访草稿，请核对后终审` : '当前评估没有明确的后续随访行动')
    } catch (err) { toast(err.message || '生成随访草稿失败') } finally { setAssessmentBusy(false) }
  }

  const handlePush = async () => {
    if (dirty) { toast('有未保存的更改，请先保存再推送'); return }
    if (!planType) { toast('请先选择方案类型并保存'); return }
    if (!window.confirm('确认已完成专业审核并推送给客户？推送后将生成正式执行任务。')) return
    setPushing(true)
    try {
      const res = await staffAPI.pushAnnualPlan(id, year, planType)
      const pushedAtVal = res.data?.pushedAt || new Date().toISOString()
      setPushedAt(pushedAtVal)
      setPlansByType(prev => prev[planType]
        ? { ...prev, [planType]: { ...prev[planType], pushedAt: pushedAtVal } }
        : prev)
      toast('方案已推送给客户')
    } catch (err) {
      toast(err.message || '推送失败，请先保存方案')
    } finally {
      setPushing(false)
    }
  }

  const handleDelete = async () => {
    if (patientMode && !plansByType[planType]) return
    const reason = window.prompt('请输入删除原因（例如：模板类型选择错误）')
    if (reason === null) return
    if (!reason.trim()) { toast('必须填写删除原因'); return }
    if (!window.confirm('确定删除当前年度管理方案？该方案自动生成且尚未完成的随访计划也会一并删除。')) return
    try {
      const res = patientMode
        ? await staffAPI.deleteAnnualPlan(id, year, planType, reason.trim())
        : await staffAPI.deletePlan(id, reason.trim())
      if (!patientMode) { toast('方案已删除'); nav(backPath); return }
      setPlansByType(prev => { const next = { ...prev }; delete next[planType]; return next })
      setModuleData({}); setSelectedTemplateId(''); setPushedAt(null); setConfirmedAt(null); setDirty(false)
      toast(res.relatedFollowUpsDeleted ? `方案已删除，同时删除 ${res.relatedFollowUpsDeleted} 条未完成随访计划` : '方案已删除')
    } catch (err) { toast(err.message || '删除失败') }
  }

  const patientName = patientMode ? (patient?.name || '会员') : (plan?.patientId?.name || '会员')
  const planTitle = patientMode ? '年度健康管理方案' : (plan?.title || '年度管理方案')
  const selectedAdminTemplate = adminTemplates.find(t => t._id === selectedTemplateId)
  const templateModuleEntries = selectedAdminTemplate
    ? templateEntries(selectedAdminTemplate)
    : (PLAN_TYPE_MODULES[strategyOf(planType)] || []).map(key => ({ key, def: MODULE_DEFS[key] }))
  const visibleModuleEntries = templateModuleEntries.filter(entry => {
    const data = moduleData[entry.key]
    if (!data) return false
    return entry.def.multi ? (data.records || []).length > 0 : data.enabled !== false && entry.def.fields.some(field => data[field.key] !== undefined && data[field.key] !== '' && data[field.key] !== false)
  })
  const adoptedStandardPlanIds = new Set(BASIC_STANDARD_MODULE_KEYS.flatMap(key => {
    const data = moduleData[key]
    const records = MODULE_DEFS[key]?.multi ? (data?.records || []) : (data?.enabled === false || !data ? [] : [data])
    return records.map(record => String(record.standardPlanId || '')).filter(Boolean)
  }))
  const standardScreeningGroups = BASIC_STANDARD_MODULE_KEYS.map(key => ({
    key,
    name: MODULE_DEFS[key].name,
    icon: MODULE_DEFS[key].icon,
    plans: (() => {
      const configured = selectedAdminTemplate?.content?.standardActionPlans?.[key]
      if (!configured?.id) return []
      const plan = standardPlans.find(item => String(item._id) === String(configured.id))
      return plan ? [plan] : []
    })(),
  }))
  const activePlanType = selectedAdminTemplate
    ? { ...(PLAN_TYPES.find(pt => pt.key === strategyOf(planType)) || PLAN_TYPES[3]), key: planType, name: selectedAdminTemplate.content?.planName || selectedAdminTemplate.name }
    : PLAN_TYPES.find(pt => pt.key === strategyOf(planType))
  const backPath = patientMode ? '/plans?tab=annual_health_mgmt' : '/plans?type=annual_mgmt'

  const yearOptions = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>加载中...</div>

  return (
    <StaffListContext.Provider value={staffList}>
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => nav(backPath)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#4A6558', padding: 4 }}
        >←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2B24' }}>{planTitle}</div>
          <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 2 }}>
            {patientName}
            {activePlanType && <span style={{ marginLeft: 8, color: activePlanType.color, fontWeight: 600 }}>{activePlanType.icon} {activePlanType.name}</span>}
          </div>
        </div>
        {patientMode && (
          <select
            value={year}
            onChange={e => { setYear(parseInt(e.target.value)); setDirty(false) }}
            style={{ marginLeft: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #E0D9CE', fontSize: 14, background: '#fff', cursor: 'pointer' }}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {pushedAt && !dirty && (
            <span style={{ fontSize: 12, color: '#22A06B', background: '#E8F5EF', padding: '4px 10px', borderRadius: 20 }}>
              ✓ 已推送 {new Date(pushedAt).toLocaleDateString('zh-CN')}
            </span>
          )}
          {confirmedAt ? (
            <span style={{ fontSize: 12, color: '#1E6B50', background: '#D1FAE5', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>
              ✓ 客户已确认 {new Date(confirmedAt).toLocaleDateString('zh-CN')}
            </span>
          ) : pushedAt && !dirty ? (
            <span style={{ fontSize: 12, color: '#D97706', background: '#FEF9EC', padding: '4px 10px', borderRadius: 20 }}>
              待客户确认
            </span>
          ) : null}
          {dirty && <span style={{ fontSize: 12, color: '#D97706', background: '#FEF9EC', padding: '4px 8px', borderRadius: 20 }}>有未保存更改</span>}
          {canEdit && ((!patientMode && plan) || (patientMode && plansByType[planType])) && (
            <button onClick={handleDelete} style={{ background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>删除方案</button>
          )}
          {/* 年度管理方案只归健康顾问负责：营养师等其他角色可以查看，但不显示生成/推送这些编辑入口 */}
          {patientMode && canEdit && (
            <>
              <button
                onClick={handleGenerateAIAnnualPlan}
                disabled={aiPlanLoading || !patient?.aiHealthSummary?.sections || !preparation?.checklist?.ready}
                title={!preparation?.checklist?.ready ? '请先完成首次方案准备清单' : (!patient?.aiHealthSummary?.sections ? '请先在AI信息整理及方案标签页生成健康信息整理结果' : 'AI自动填充方案板块')}
                style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (aiPlanLoading || !patient?.aiHealthSummary?.sections || !preparation?.checklist?.ready) ? 0.5 : 1 }}
              >
                {aiPlanLoading ? 'AI生成中…' : '✨ AI生成方案'}
              </button>
              <button
                onClick={handlePush}
                disabled={pushing || dirty || !planType || !preparation?.checklist?.ready}
                title={!preparation?.checklist?.ready ? '请先完成首次方案准备清单' : ''}
                style={{ background: pushedAt && !dirty ? '#0077B6' : '#1E6B50', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (pushing || dirty || !planType || !preparation?.checklist?.ready) ? 0.5 : 1 }}
              >
                {pushing ? '推送中...' : pushedAt && !dirty ? '重新推送' : '推送给客户'}
              </button>
            </>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: '#1E6B50', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? '保存中...' : '保存方案'}
          </button>
        </div>
      </div>

      {patientMode && preparation?.checklist && (
        <div style={{ background: preparation.checklist.ready ? '#F0FDF4' : '#FFFDF7', border: `1px solid ${preparation.checklist.ready ? '#86EFAC' : '#F3D49A'}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2B24' }}>首次方案准备清单</div>
              <div style={{ fontSize: 13, color: '#6B7F75', marginTop: 4 }}>已完成 {preparation.checklist.progress.completed}/{preparation.checklist.progress.total}；未完成前不能由 AI 生成或正式发布年度方案。</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: preparation.checklist.ready ? '#15803D' : '#B45309' }}>{preparation.checklist.ready ? '✓ 已就绪' : '待完善'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8, marginTop: 14 }}>
            {preparation.checklist.items.map(item => (
              <div key={item.key} style={{ fontSize: 13, color: item.complete ? '#287A50' : '#9A5B13' }}>{item.complete ? '✓' : '○'} {item.label}{item.waived ? '（已说明豁免）' : ''}</div>
            ))}
          </div>
          {canEdit && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end', marginTop: 16 }}>
              <label style={{ fontSize: 12, color: '#4A6558' }}>所需专业评估领域（用顿号分隔）
                <input value={preparationDraft.requiredAssessmentDomains} onChange={e => setPreparationDraft(prev => ({ ...prev, requiredAssessmentDomains: e.target.value }))} placeholder="如：心血管、营养、中医健康" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, padding: '8px 10px', border: '1px solid #D9D4CA', borderRadius: 8 }} />
              </label>
              <label style={{ fontSize: 12, color: '#4A6558' }}>用药档案
                <select value={preparationDraft.medicationStatus} onChange={e => setPreparationDraft(prev => ({ ...prev, medicationStatus: e.target.value }))} style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px', border: '1px solid #D9D4CA', borderRadius: 8 }}><option value="unknown">待完善</option><option value="documented">已完善</option><option value="none">确认无</option></select>
              </label>
              <label style={{ fontSize: 12, color: '#4A6558' }}>营养素档案
                <select value={preparationDraft.supplementStatus} onChange={e => setPreparationDraft(prev => ({ ...prev, supplementStatus: e.target.value }))} style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px', border: '1px solid #D9D4CA', borderRadius: 8 }}><option value="unknown">待完善</option><option value="documented">已完善</option><option value="none">确认无</option></select>
              </label>
              <button onClick={handleSavePreparation} disabled={preparationSaving} style={{ padding: '9px 14px', border: 'none', borderRadius: 8, color: '#fff', background: '#1E6B50', cursor: 'pointer' }}>{preparationSaving ? '保存中…' : '保存准备情况'}</button>
              <label style={{ gridColumn: '1 / -1', fontSize: 13, color: '#4A6558' }}><input type="checkbox" checked={preparationDraft.advisorReady} onChange={e => setPreparationDraft(prev => ({ ...prev, advisorReady: e.target.checked }))} /> 健康顾问已确认资料足够生成本年度方案</label>
            </div>
          )}
        </div>
      )}

      {patientMode && (
        <div id="professional-assessments" style={{ background: '#fff', border: '1px solid #D7E4DD', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2B24' }}>专业健康评估</div>
          <div style={{ fontSize: 13, color: '#6B7F75', marginTop: 4 }}>年度综合评估输入经终审后用于年度方案；后续专项协作生成动态随访，不重建年度方案。</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {professionalAssessments.map(item => <div key={item._id} style={{ border: '1px solid #E8E3DA', borderRadius: 9, padding: 11, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}><b>{item.domain} · {item.title}</b><div style={{ fontSize: 12, color: '#6B7F75', marginTop: 3 }}>{item.purpose === 'annual_input' ? '年度综合评估输入' : '专项协作评估'} · {(item.facts || []).join('；') || '暂无结论摘要'}</div></div>
              <span style={{ fontSize: 12, color: item.status === 'approved' ? '#15803D' : '#B45309' }}>{item.status === 'approved' ? '已终审' : item.status === 'advisor_review' ? '待健康顾问终审' : '待专业审核'}</span>
              {canEdit && item.status === 'advisor_review' && <><button disabled={assessmentBusy} onClick={() => handleAssessmentFollowUpDraft(item._id)} className="btn btn-secondary btn-sm">{assessmentBusy ? '处理中…' : 'AI随访草稿'}</button><button disabled={assessmentBusy} onClick={() => handleReviewAssessment(item._id, 'approve_advisor')} className="btn btn-primary btn-sm">终审通过</button></>}
              {!canEdit && item.status === 'professional_review' && <button disabled={assessmentBusy} onClick={() => handleReviewAssessment(item._id, 'submit_advisor')} className="btn btn-primary btn-sm">提交顾问审核</button>}
              {item.status === 'approved' && item.followUpPublication?.status !== 'published' && !!item.followUpDrafts?.length && <div style={{ flexBasis: '100%', color: '#B45309' }}>
                {item.followUpPublication?.message || '随访尚未完整发布'}
                {canEdit && <button disabled={assessmentBusy} onClick={() => handleReviewAssessment(item._id, 'approve_advisor')} className="btn btn-secondary btn-sm">重试发布</button>}
              </div>}
              {!!item.followUpDrafts?.length && <div style={{ flexBasis: '100%', fontSize: 13, color: '#52685D' }}>
                <b>{item.followUpPublication?.status === 'published' ? '已发布随访' : '随访草稿（终审后发布）'}</b>
                {item.followUpDrafts.map((draft, index) => <fieldset key={index} disabled={assessmentBusy || !canEdit || item.status !== 'advisor_review'} style={{ border: '1px solid #E8E3DA', borderRadius: 8, padding: 10, marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input aria-label={`随访${index + 1}标题`} value={draft.title} maxLength={40} onChange={e => updateAssessmentFollowUpDraft(item._id, index, { title: e.target.value })} style={{ flex: 1, minWidth: 150 }} />
                    <input aria-label={`随访${index + 1}日期`} type="date" value={draft.date} onChange={e => updateAssessmentFollowUpDraft(item._id, index, { date: e.target.value })} />
                    <select aria-label={`随访${index + 1}类型`} value={draft.category} onChange={e => updateAssessmentFollowUpDraft(item._id, index, { category: e.target.value })}>
                      <option value="medical_visit">安排就医</option><option value="examination">完善检查</option><option value="review">复查随访</option><option value="lifestyle">生活方式</option><option value="information">资料核对</option>
                    </select>
                  </div>
                  <textarea aria-label={`随访${index + 1}内容`} value={draft.content} maxLength={3000} rows={3} onChange={e => updateAssessmentFollowUpDraft(item._id, index, { content: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8 }} />
                  <label><input type="checkbox" checked={draft.requiresService === true} onChange={e => updateAssessmentFollowUpDraft(item._id, index, { requiresService: e.target.checked })} />需健康规划师安排服务</label>
                  {canEdit && item.status === 'advisor_review' && <button onClick={() => removeAssessmentFollowUpDraft(item._id, index)} style={{ border: 0, background: 'none', color: '#DC2626', cursor: 'pointer', marginLeft: 12 }}>移除</button>}
                </fieldset>)}
              </div>}
            </div>)}
            {!professionalAssessments.length && <div style={{ color: '#9A6A28', fontSize: 13 }}>尚无年度综合健康评估，年度方案准备清单会保持阻断。</div>}
          </div>
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', color: '#1E6B50', fontWeight: 600 }}>＋ 新建专业评估记录</summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 12 }}>
              <input value={assessmentDraft.domain} onChange={e => setAssessmentDraft(prev => ({ ...prev, domain: e.target.value }))} placeholder="评估领域，如心血管/生长发育/中医健康" className="form-control" />
              <input value={assessmentDraft.title} onChange={e => setAssessmentDraft(prev => ({ ...prev, title: e.target.value }))} placeholder="评估标题" className="form-control" />
              {[['facts','客观评估结论（必填，每行一项）'],['risks','重点关注（每行一项）'],['missingInformation','待补信息（每行一项）'],['recommendations','管理建议：就医、检查、复查或生活方式（每行一项）']].map(([key, label]) => <textarea key={key} value={assessmentDraft[key]} onChange={e => setAssessmentDraft(prev => ({ ...prev, [key]: e.target.value }))} placeholder={label} rows={3} className="form-control" style={{ gridColumn: '1 / -1' }} />)}
              <button onClick={handleCreateAssessment} disabled={assessmentSaving} className="btn btn-primary" style={{ justifySelf: 'start' }}>{assessmentSaving ? '保存中…' : '保存评估草稿'}</button>
            </div>
          </details>
        </div>
      )}

      {/* 方案类型选择 */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #E0D9CE' }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 14 }}>选择方案类型</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {templatesLoading && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#8AA89C' }}>正在从Admin后台加载模板...</div>}
          {!templatesLoading && adminTemplates.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#D97706' }}>该客户所属平台暂无健康管理方案模板，请在Admin后台配置“客户归属”和“方案归类”</div>}
          {!templatesLoading && adminTemplates.length > 1 && !adminTemplates.some(item => item.isRecommended) && !selectedTemplateId && (
            <div style={{ gridColumn: '1/-1', padding: '10px 12px', borderRadius: 8, background: '#FEF9EC', color: '#9A6700', fontSize: 12 }}>
              已读取客户资料：会员类型「{patient?.memberType || '未填写'}」，服务包「{patient?.servicePackage || '未填写'}」；尚未唯一匹配到年度服务版本，请在Admin模板中配置对应的适用会员类型或服务包。
            </div>
          )}
          {adminTemplates.map((tpl, index) => {
            const key = tpl.content?.servicePlanCode || tpl.content?.planType || 'health_prevention'
            const base = PLAN_TYPES.find(pt => pt.key === strategyOf(key)) || PLAN_TYPES[index % PLAN_TYPES.length]
            const pt = { ...base, key, templateId: tpl._id, name: tpl.content?.planName || tpl.name }
            const isSelected = selectedTemplateId === tpl._id
            return (
            <div
              key={tpl._id}
              onClick={() => handlePlanTypeChange(pt.key, tpl)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${isSelected ? pt.color : '#E0D9CE'}`,
                background: isSelected ? pt.bg : '#fff',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 22 }}>{pt.icon}</span>
              <div style={{ fontWeight: 600, fontSize: 14, color: isSelected ? pt.color : '#1A2B24' }}>{pt.name}</div>
              {tpl.isRecommended && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#1E6B50', background: '#E8F5EF', padding: '2px 7px', borderRadius: 10, fontWeight: 600 }}>系统已匹配</span>}
              {patientMode && plansByType[pt.key] && (
                <span style={{
                  marginLeft: planType === pt.key ? 8 : 'auto', fontSize: 11, fontWeight: 600,
                  color: plansByType[pt.key].pushedAt ? '#22A06B' : '#8AA89C',
                  background: plansByType[pt.key].pushedAt ? '#E8F5EF' : '#F2EDE3',
                  padding: '1px 7px', borderRadius: 10,
                }}>{plansByType[pt.key].pushedAt ? '已推送' : '已配置'}</span>
              )}
              {isSelected && <span style={{ marginLeft: plansByType[pt.key] ? 6 : 'auto', color: pt.color, fontSize: 18 }}>✓</span>}
            </div>
          )})}
        </div>
      </div>


      {/* 板块列表 */}
      {planType ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: '#F0F7F4', color: '#4A6558', fontSize: 13, lineHeight: 1.7 }}>
            <strong style={{ color: '#1E6B50' }}>生成依据：</strong>
            已确认健康资料与阶段性评估决定调用哪些Admin标准随访方案；页面完整保留标准内容和周期，AI只能填写“个性化调整”，不能改名或另创方案，最终由健康顾问确认执行人和日期。
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24' }}>方案板块</div>
            <div style={{ fontSize: 12, color: '#8AA89C' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E6B50', display: 'inline-block' }} />
                绿点表示已填写内容
              </span>
              <span style={{ marginLeft: 12, background: '#FEF9EC', color: '#D97706', border: '1px solid #F6D860', borderRadius: 4, padding: '1px 6px' }}>仅内部</span>
              &nbsp;= 不推送给客户
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #CFE3D9', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', background: '#F0F7F4', borderBottom: '1px solid #DDEBE4' }}>
              <div style={{ fontWeight: 700, color: '#1A2B24' }}>标准方案过筛库</div>
              <div style={{ marginTop: 4, color: '#6B8177', fontSize: 12 }}>以下是本次生成实际使用的 Admin 标准方案。系统逐类判断；采用的方案会进入下方客户方案，未采用的不会推送给客户。</div>
            </div>
            {standardScreeningGroups.map(group => (
              <div key={group.key} style={{ padding: '12px 16px', borderBottom: group.key === BASIC_STANDARD_MODULE_KEYS.at(-1) ? 'none' : '1px solid #EEF2EF' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: group.plans.length ? 9 : 0 }}>
                  <span>{group.icon}</span>
                  <strong style={{ fontSize: 14 }}>{group.name}</strong>
                  <span style={{ color: '#8AA89C', fontSize: 12 }}>{group.plans.length ? `${group.plans.length}个标准模板` : '模板库尚未配置'}</span>
                </div>
                {group.plans.map(plan => {
                  const adopted = adoptedStandardPlanIds.has(String(plan._id))
                  return (
                    <details key={plan._id} style={{ margin: '7px 0 0 26px', padding: '9px 11px', border: `1px solid ${adopted ? '#8FD0B2' : '#E0E6E2'}`, borderRadius: 8, background: adopted ? '#F0FAF5' : '#FAFBFA' }}>
                      <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none' }}>
                        <span style={{ flex: 1, fontWeight: 600, color: '#28483A' }}>{plan.name}</span>
                        <span style={{ fontSize: 11, color: adopted ? '#167A55' : '#8A958F', background: adopted ? '#DDF4E8' : '#EEF1EF', borderRadius: 10, padding: '2px 8px' }}>{adopted ? '已采用' : '待筛选'}</span>
                        <span style={{ color: '#8AA89C' }}>⌄</span>
                      </summary>
                      <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid #E5ECE8', color: '#536B60', fontSize: 12, lineHeight: 1.7 }}>
                        <div><strong>固定内容：</strong>{standardPlanContent(plan)}</div>
                        <div><strong>固定周期：</strong>{standardPlanSchedule(plan)}</div>
                        {plan.defaultRole && <div><strong>默认角色：</strong>{plan.defaultRole}</div>}
                      </div>
                    </details>
                  )
                })}
              </div>
            ))}
          </div>
          {visibleModuleEntries.map(entry => (
            <ModulePanel
              key={entry.key}
              moduleKey={entry.key}
              def={entry.def}
              data={moduleData[entry.key] || {}}
              onChange={handleModuleChange}
            />
          ))}
          {visibleModuleEntries.length === 0 && (
            <div style={{ background: '#fff', border: '1px solid #E0D9CE', borderRadius: 12, padding: '30px 20px', textAlign: 'center', color: '#8AA89C' }}>
              尚未生成适用方案。点击“AI生成方案”后，系统会依次筛查就医安排、体检完善、定期复查、疫苗接种和年度体检；无适用内容的板块不会展示。
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, padding: '32px 20px', border: '1px solid #E0D9CE', textAlign: 'center', color: '#aaa', marginBottom: 20 }}>
          请先选择方案类型，然后填写对应板块内容
        </div>
      )}

      {/* 底部保存 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        {canEdit && ((!patientMode && plan) || (patientMode && plansByType[planType])) && (
          <button onClick={handleDelete} style={{ background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            删除方案
          </button>
        )}
        <button
          onClick={() => nav(backPath)}
          style={{ background: '#fff', color: '#666', border: '1px solid #ddd', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
        >
          返回方案列表
        </button>
        {patientMode && canEdit && (
          <button
            onClick={handlePush}
            disabled={pushing || dirty || !planType}
            style={{ background: '#0077B6', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (pushing || dirty || !planType) ? 0.5 : 1 }}
          >
            {pushing ? '推送中...' : '推送给客户'}
          </button>
        )}
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: '#1E6B50', color: '#fff', border: 'none', padding: '10px 28px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? '保存中...' : '保存年度管理方案'}
          </button>
        )}
      </div>
    </div>
    </StaffListContext.Provider>
  )
}
