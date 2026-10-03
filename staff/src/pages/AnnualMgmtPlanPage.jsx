import ProfessionalAssessmentFields from '../components/ProfessionalAssessmentFields'
import DateField from '../../../shared/DateField.jsx'
import '../components/ReportFollowUpDrafts.css'
import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'
import { StaffListContext, ModulePanel, NutritionComparisonMetricPicker } from '../components/ModulePanel'
import AnnualServicePeriodPanel from '../components/AnnualServicePeriodPanel'
import AnnualPlanSupplement from '../components/AnnualPlanSupplement'
import AnnualExecutionReview from '../components/AnnualExecutionReview'
import AnnualServiceRecommendations from '../components/AnnualServiceRecommendations'
import { annualPlanReturnTarget } from '../utils/annualPlanNavigation.mjs'
import assessmentCriteria from '../../../shared/annualAssessmentCriteria.json'
import { annualTemplateCode, matchingAnnualTemplate } from '../utils/annualTemplateSelection.mjs'
import { annualItemLayout } from '../utils/annualItemLayout.mjs'
import { calendarDate } from '../utils/calendarDate'
import { supplementalAssessmentNote } from '../utils/annualAssessmentNote.mjs'
import { targetIssueId, linkedIssueId, actionTitle } from '../utils/annualIssueLink.mjs'

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
const FAMILY_DOCTOR_MODULES = ['medical_treatment', 'specialist_collab', 'checkup_completion', 'abnormal_followup', 'vaccine', 'annual_checkup']
const FAMILY_DOCTOR_GOAL_FIELDS = [
  { key: 'goal', label: '本年度管理目标', type: 'textarea', placeholder: '写清本事项希望解决或明确的问题，由健康顾问核对' },
  { key: 'completionStandard', label: '完成标准', type: 'textarea', placeholder: '写清需要回收的检查、专科意见或复查结果，以及由谁确认' },
]
Object.values(MODULE_DEFS).forEach(def => {
  if (!def.multi) return
  const existing = new Set(def.fields.map(field => field.key))
  def.fields = [...def.fields, ...COMMON_ACTION_FIELDS.filter(field => !existing.has(field.key))]
})
FAMILY_DOCTOR_MODULES.forEach(key => {
  const def = MODULE_DEFS[key]
  const existing = new Set(def.fields.map(field => field.key))
  def.fields = [...def.fields, ...FAMILY_DOCTOR_GOAL_FIELDS.filter(field => !existing.has(field.key))]
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
  const [phaseAssessmentFrequency, setPhaseAssessmentFrequency] = useState('')
  const [lastGenerationKey, setLastGenerationKey] = useState('')
  const [plansByType, setPlansByType] = useState({}) // patientMode: { servicePlanCode: plan }，各服务版本独立保存
  const [year, setYear]             = useState(() => Number(searchParams.get('year')) || new Date().getFullYear())
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [pushing, setPushing]       = useState(false)
  const [dirty, setDirty]           = useState(false)
  const [metricSelectionDirty, setMetricSelectionDirty] = useState(false)
  const [metricSelectionSaving, setMetricSelectionSaving] = useState(false)
  const [nutritionTask, setNutritionTask] = useState(null)
  const [nutritionTaskLoading, setNutritionTaskLoading] = useState(false)
  const [nutritionDispatching, setNutritionDispatching] = useState(false)
  const [remotePlanChanged, setRemotePlanChanged] = useState(false)
  useEffect(() => setRemotePlanChanged(false), [id, year, planType])
  const currentPlanVersion = plansByType[planType]?.updatedAt
  const currentPlanId = plansByType[planType]?._id
  useEffect(() => {
    if (!patientMode || !currentPlanId) { setNutritionTask(null); return }
    let active = true
    setNutritionTask(null)
    setNutritionTaskLoading(true)
    staffAPI.getAnnualNutritionTask(id, currentPlanId)
      .then(res => { if (active) setNutritionTask(res.data || null) })
      .catch(() => { if (active) setNutritionTask(null) })
      .finally(() => { if (active) setNutritionTaskLoading(false) })
    return () => { active = false }
  }, [patientMode, id, currentPlanId])
  useEffect(() => {
    if (!patientMode || !planType || !currentPlanVersion) return
    let active = true, fetching = false
    const refresh = async () => {
      if (fetching || document.visibilityState === 'hidden') return
      fetching = true
      try {
        const res = await staffAPI.getAnnualPlan(id, year)
        if (!active) return
        const list = Array.isArray(res.data) ? res.data : [res.data].filter(Boolean)
        const latest = list.find(p => (p.servicePlanCode || p.planType) === planType)
        if (!latest || latest.updatedAt === currentPlanVersion) return
        if (dirty || metricSelectionDirty) { setRemotePlanChanged(true); return }
        setPlansByType(prev => ({ ...prev, [planType]: latest }))
        setModuleData(latest.moduleData || {})
        setPhaseAssessmentFrequency(latest.phaseAssessmentFrequency || '')
        setPushedAt(latest.pushedAt || null)
        setConfirmedAt(latest.confirmedAt || null)
        setRemotePlanChanged(false)
      } catch { /* Existing content stays visible; saving still checks the server version. */ }
      finally { fetching = false }
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [patientMode, id, year, planType, currentPlanVersion, dirty, metricSelectionDirty])
  const [pushedAt, setPushedAt]     = useState(null)
  const [confirmedAt, setConfirmedAt] = useState(null)
  const [aiPlanLoading, setAiPlanLoading] = useState(false)
  const [generationError, setGenerationError] = useState('')
  useEffect(() => setGenerationError(''), [id, year, planType])
  const [staffList, setStaffList]   = useState([])
  const [adminTemplates, setAdminTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [preparation, setPreparation] = useState(null)
  const [executionReviewData, setExecutionReviewData] = useState(null)
  const [closedLoopEnabled, setClosedLoopEnabled] = useState(true)
  const [monthlyReviewEnabled, setMonthlyReviewEnabled] = useState(false)
  useEffect(() => {
    if (!patientMode) return
    staffAPI.getMonthlyServiceReviews(id).then(result => setMonthlyReviewEnabled(result.enabled === true)).catch(() => setMonthlyReviewEnabled(false))
  }, [patientMode, id])
  const [continuitySource, setContinuitySource] = useState(null)
  const [generationCoverage, setGenerationCoverage] = useState([])
  useEffect(() => { setLastGenerationKey(''); setGenerationCoverage([]) }, [id, year, planType])
  const [preparationSaving, setPreparationSaving] = useState(false)
  const [annualReviewBusy, setAnnualReviewBusy] = useState(false)
  const [preparationDraft, setPreparationDraft] = useState({ assessmentMode: 'required', assessmentConfirmedCriteria: [], assessmentNotRequiredReason: '', requiredAssessmentDomains: '', requiredCaseReviewIds: [], medicationStatus: 'unknown', supplementStatus: 'unknown', advisorReady: false })
  const preparationSelectionChanged = JSON.stringify([...(preparationDraft.requiredCaseReviewIds || [])].sort()) !== JSON.stringify([...(preparation?.preparation?.requiredCaseReviewIds || [])].map(String).sort()) || (preparationDraft.assessmentMode === 'none' && !assessmentCriteria.every(item => preparationDraft.assessmentConfirmedCriteria.includes(item.key)))
  const preparationBlocked = closedLoopEnabled && (!preparation?.checklist?.ready || preparationSelectionChanged)
  const [professionalAssessments, setProfessionalAssessments] = useState([])
  const [assessmentBusy, setAssessmentBusy] = useState(false)
  const [assessmentSaving, setAssessmentSaving] = useState(false)
  const [assessmentDraft, setAssessmentDraft] = useState({ domain: '', title: '', facts: '', risks: '', missingInformation: '', recommendations: '' })

  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!patientMode || !patient?._id) return
    setTemplatesLoading(true)
    staffAPI.getPlanTemplates('health_management', patient._id)
      .then(r => {
        const templates = r.data || []
        setAdminTemplates(templates)
        const recommended = planType ? matchingAnnualTemplate(planType, templates) : templates.find(item => item.isRecommended)
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
    let cancelled = false
    setLoading(true)
    setClosedLoopEnabled(true)
    if (patientMode) {
      Promise.all([
        staffAPI.getPatient(id),
        staffAPI.getAnnualPlan(id, year),
        staffAPI.getAnnualPlanPreparation(id, year),
        staffAPI.getProfessionalHealthAssessments(id),
      ]).then(([patRes, planRes, preparationRes, assessmentRes]) => {
        if (cancelled) return
        setClosedLoopEnabled(preparationRes.enabled !== false)
        setPatient(patRes.data?.user || patRes.data)
        setProfessionalAssessments(assessmentRes.data || [])
        const preparationData = preparationRes.data || null
        setPreparation(preparationData)
        setPreparationDraft({
          assessmentMode: preparationData?.preparation?.assessmentMode || 'required',
          assessmentConfirmedCriteria: preparationData?.preparation?.assessmentCriteriaVersion === 1 ? (preparationData.preparation.assessmentConfirmedCriteria || []) : [],
          assessmentNotRequiredReason: supplementalAssessmentNote(preparationData?.preparation?.assessmentNotRequiredReason, assessmentCriteria),
          requiredCaseReviewIds: preparationData?.preparation?.requiredCaseReviewIds || [],
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
        setContinuitySource(target?.continuitySource || preparationData?.continuity?.source || null)
        if (target) {
          setPlanType(target.servicePlanCode || target.planType)
          setSelectedTemplateId(target.templateId || '')
          setModuleData(target.moduleData || {})
          setPhaseAssessmentFrequency(target.phaseAssessmentFrequency || '')
          setPushedAt(target.pushedAt || null)
          setConfirmedAt(target.confirmedAt || null)
        } else if (queryPlanType) {
          // 该类型还没有任何已保存数据，选中类型但板块留空，等用户点AI生成
          setPlanType(queryPlanType)
          setSelectedTemplateId('')
          setModuleData({})
          setPhaseAssessmentFrequency('')
          setPushedAt(null)
          setConfirmedAt(null)
        } else {
          setPlanType('')
          setSelectedTemplateId('')
          setModuleData({})
          setPhaseAssessmentFrequency('')
          setPushedAt(null)
          setConfirmedAt(null)
        }
        setDirty(false)
        setMetricSelectionDirty(false)
      }).catch(err => { if (!cancelled) toast(err.message || '加载失败') })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      staffAPI.getPlan(id)
        .then(res => {
          if (cancelled) return
          const p = res.data
          setPlan(p)
          const c = p.content || {}
          setPlanType(c.planType || '')
          setModuleData(c.moduleData || {})
          setDirty(false)
        })
        .catch(err => { if (!cancelled) toast(err.message || '加载失败') })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
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
    if ((dirty || metricSelectionDirty) && !window.confirm('当前方案有未保存的更改，切换类型会丢失这些更改，确认切换？')) return
    // 加载该类型自己的数据（每个类型独立一份）
    const p = plansByType[key]
    setContinuitySource(p?.continuitySource || preparation?.continuity?.source || null)
    setPlanType(key)
    setSelectedTemplateId(template?._id || p?.templateId || '')
    setModuleData(p?.moduleData || {})
    setPhaseAssessmentFrequency(p?.phaseAssessmentFrequency || '')
    setPushedAt(p?.pushedAt || null)
    setConfirmedAt(p?.confirmedAt || null)
    setDirty(false)
    setMetricSelectionDirty(false)
  }

  const handleNutritionMetricChange = metrics => {
    if (!pushedAt) { handleModuleChange('nutrition_assessment', 'nutritionComparisonMetrics', metrics); return }
    setModuleData(prev => ({ ...prev, nutrition_assessment: { ...(prev.nutrition_assessment || {}), nutritionComparisonMetrics: metrics } }))
    setMetricSelectionDirty(true)
  }

  const savePublishedNutritionMetrics = async () => {
    const current = plansByType[planType]
    if (!current?._id) return toast('请先打开已保存的年度方案')
    if (remotePlanChanged) return toast('方案已有更新，请刷新后重新核对')
    setMetricSelectionSaving(true)
    try {
      const res = await staffAPI.reviseAnnualNutritionMetrics(id, {
        planId: current._id, baseUpdatedAt: current.updatedAt,
        metrics: moduleData.nutrition_assessment?.nutritionComparisonMetrics || [],
      })
      setPlansByType(prev => ({ ...prev, [planType]: res.data }))
      setModuleData(res.data.moduleData || {})
      setMetricSelectionDirty(false)
      toast('营养对比指标已保存并留痕；营养师打开评估时会读取最新选择')
    } catch (error) { toast(error.message || '保存指标失败') }
    finally { setMetricSelectionSaving(false) }
  }

  const dispatchNutritionTask = async () => {
    const current = plansByType[planType]
    if (!current?._id) return toast('请先保存年度方案草稿')
    if (dirty || metricSelectionDirty || remotePlanChanged) return toast('请先保存指标和方案更改')
    setNutritionDispatching(true)
    try {
      const res = await staffAPI.dispatchAnnualNutritionTask(id, { planId: current._id, baseUpdatedAt: current.updatedAt })
      setNutritionTask(res.data)
      toast(res.reused ? '营养师任务已存在，未重复派发' : '营养评估任务已单独派发给责任营养师')
    } catch (error) { toast(error.message || '派发失败') }
    finally { setNutritionDispatching(false) }
  }

  const reloadManagementTargets = async () => {
    if (pushedAt) return toast('已推送年度方案不能直接覆盖目标')
    const existing = moduleData.management_targets?.records || []
    if (existing.length && !window.confirm('将用当前年度已确认的专项研判目标替换年度草稿中的目标，确认继续？')) return
    try {
      const res = await staffAPI.getAnnualManagementTargets(id, year)
      if (!res.data?.length) return toast('本年度尚无已确认的逐条管理目标')
      setModuleData(prev => ({ ...prev, management_targets: { enabled: true, records: res.data } }))
      setDirty(true)
      toast(`已带入 ${res.data.length} 条目标，请核对并保存草稿`)
    } catch (error) { toast(error.message || '读取研判目标失败') }
  }

  const handleSave = async () => {
    if (remotePlanChanged) { toast('方案已有补录，请先加载最新方案再保存'); return }
    if (!planType) { toast('请先选择方案类型'); return }
    for (const { key, def } of templateModuleEntries) {
      const data = moduleData[key]
      if (!data || data.enabled === false) continue
      for (const record of def.multi ? data.records || [] : [data]) {
        const invalidDate = def.fields.find(field => field.type === 'date' && record[field.key] && !calendarDate(record[field.key]))
        if (invalidDate) { toast(`${def.name}：请填写完整有效的${invalidDate.label}，如 2026-10-01`); return }
      }
    }
    setSaving(true)
    try {
      if (patientMode) {
        const selectedTemplate = adminTemplates.find(t => t._id === selectedTemplateId)
        const servicePlanCode = annualTemplateCode(planType, selectedTemplate)
        const annualModuleData = { ...moduleData, nutrition_assessment: { ...(moduleData.nutrition_assessment || {}), enabled: true, nutritionComparisonMetrics: moduleData.nutrition_assessment?.nutritionComparisonMetrics ?? ['体重'] } }
        const res = await staffAPI.saveAnnualPlan(id, { planType: servicePlanCode, servicePlanCode, saveDraft: true, sourcePlanId: plansByType[planType]?._id || null, baseUpdatedAt: plansByType[planType]?.updatedAt || null, moduleData: annualModuleData, phaseAssessmentFrequency, year, continuitySource, templateId: selectedTemplateId || null, templateName: selectedTemplate?.content?.planName || selectedTemplate?.name || '' })
        const saved = res.data
        if (saved) {
          setModuleData(saved.moduleData || annualModuleData)
          setPlansByType(prev => {
            const next = { ...prev, [servicePlanCode]: saved }
            if (planType !== servicePlanCode) delete next[planType]
            return next
          })
          setPlanType(servicePlanCode)
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
    let requestType = type
    try { if (patientMode) requestType = annualTemplateCode(type, selectedTemplate) }
    catch (error) { toast(error.message); return }
    const ptName = selectedTemplate?.content?.planName || selectedTemplate?.name || PLAN_TYPES.find(pt => pt.key === type)?.name || '该类型'
    if (!skipConfirm && !window.confirm(`AI将基于已审核的汇总分析，生成「${ptName}」对应的方案板块，现有内容将被覆盖，确认继续？`)) return
    setAiPlanLoading(true)
    setGenerationError('')
    try {
      const res = await staffAPI.generateAIAnnualPlan(id, requestType, '', selectedTemplateId, year)
      setGenerationCoverage(res.generation?.evidenceCoverage || [])
      if (res.generation?.fingerprint && (res.generation.fingerprint === lastGenerationKey || (res.generation.reused && dirty))) { toast('依据未变化，保留同一版本及您的编辑，不重复覆盖'); return }
      setLastGenerationKey(res.generation?.fingerprint || '')
      setContinuitySource(res.continuitySource || null)
      const aiData = res.data || {}
      // 只填充当前所选方案类型包含的板块，其余类型的板块忽略（一次只生成一个方案）
      const configuredRules = selectedTemplate?.content?.moduleRules || []
      const enabledRuleKeys = new Set(configuredRules.filter(rule => rule.enabled !== false && rule.aiCanGenerate !== false).map(rule => ADMIN_RULE_MODULE_MAP[rule.key]).filter(Boolean))
      const strategyType = strategyOf(type)
      const configuredKeys = configuredRules.length ? (PLAN_TYPE_MODULES[strategyType] || []).filter(key => enabledRuleKeys.has(key) || ![...Object.values(ADMIN_RULE_MODULE_MAP)].includes(key)) : (PLAN_TYPE_MODULES[strategyType] || [])
      const allowedKeys = [...new Set([...configuredKeys, ...BASIC_STANDARD_MODULE_KEYS])]
      setModuleData(prev => {
        const merged = { ...prev }
        if (Array.isArray(res.managementTargets)) merged.management_targets = { enabled: true, records: res.managementTargets }
        // 本次为覆盖式重新筛选。先清掉旧的筛选结果，避免“不适用”的旧方案继续残留。
        ;[...allowedKeys, 'personalized_followups'].forEach(key => { delete merged[key] })
        Object.entries(aiData).forEach(([key, val]) => {
          if (key === 'templateNodes') return
          if (!allowedKeys.includes(key)) return
          if (val && (val.records?.length > 0 || val.enabled)) {
            merged[key] = val
          }
        })
        const personalized = (aiData.templateNodes || [])
          .filter(node => node.defaultRole !== 'nutritionist' && !/营养评估/.test(node.standardPlanName || node.name || ''))
          .map(node => ({
          standardPlanId: node.standardPlanId || '', standardPlanName: node.standardPlanName || '',
          sourceCycles: node.sourceCycles || [], items: node.standardPlanName || '',
          standardContent: node.standardContent || '', standardSchedule: node.standardSchedule || '',
          matchReason: node.matchReason || '', personalization: node.personalization || node.content || '', executionDate: node.executionDate || node.time || '',
          frequency: node.frequency || '', precautions: node.precautions || '',
          sourceIds: node.sourceIds || [],
          customerAction: node.customerAction || '', followUpStaff: node.defaultEmployeeId || '',
          reviewStatus: 'pending_family_doctor_review',
          }))
        if (personalized.length) merged.personalized_followups = { records: personalized }
        const targets = merged.management_targets?.records || []
        Object.keys(merged).forEach(key => {
          if (!Array.isArray(merged[key]?.records) || key === 'management_targets') return
          merged[key] = { ...merged[key], records: merged[key].records.map(record => ({ ...record, issueId: linkedIssueId(record, targets) || record.issueId || '' })) }
        })
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
      setGenerationError(err.message || 'AI生成方案失败')
      toast(err.message || 'AI生成方案失败')
    } finally {
      setAiPlanLoading(false)
    }
  }
  const handleGenerateAIAnnualPlan = () => runAIGenerate(planType, false)

  const openAnnualComprehensiveReview = async () => {
    setAnnualReviewBusy(true)
    try {
      const result = await staffAPI.prepareAnnualComprehensiveReview(id, year)
      if (!result.data.reused) {
        try { await staffAPI.sendAiCaseReviewMessage(id, result.data._id, { autoStart: true, requestId: `auto_${result.data._id}` }) }
        catch (error) { toast(`年度研判已建立，自动分析未启动：${error.message}`) }
      }
      nav(`/patients/${id}?tab=aiCase&caseReviewId=${result.data._id}`)
    } catch (err) { toast(err.message || '准备年度综合研判失败') }
    finally { setAnnualReviewBusy(false) }
  }

  const handleSavePreparation = async () => {
    if (preparationDraft.assessmentMode === 'none' && !assessmentCriteria.every(item => preparationDraft.assessmentConfirmedCriteria.includes(item.key))) {
      toast('请逐项核对全部五项条件；不符合或不确定时不能选择无需新增专科评估'); return
    }
    setPreparationSaving(true)
    try {
      const requiredAssessmentDomains = preparationDraft.requiredAssessmentDomains.split(/[、,，;；\n]/).map(item => item.trim()).filter(Boolean)
      const res = await staffAPI.updateAnnualPlanPreparation(id, {
        year,
        assessmentMode: preparationDraft.assessmentMode,
        assessmentConfirmedCriteria: preparationDraft.assessmentConfirmedCriteria,
        assessmentNotRequiredReason: preparationDraft.assessmentNotRequiredReason,
        requiredCaseReviewIds: preparationDraft.requiredCaseReviewIds || [],
        requiredAssessmentDomains,
        medicationStatus: preparationDraft.medicationStatus,
        supplementStatus: preparationDraft.supplementStatus,
        advisorReady: preparationDraft.advisorReady,
      })
      setPreparation(res.data || null)
      setContinuitySource(current => current || res.data?.continuity?.source || null)
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
    if (action === 'take_over_followups' && !window.confirm('AI未完成。是否改为由健康顾问人工核对并填写本次随访？确认无新增行动时，可保留空列表再终审。')) return
    setAssessmentBusy(true)
    try {
      const current = professionalAssessments.find(item => item._id === assessmentId)
      const res = await staffAPI.reviewProfessionalHealthAssessment(assessmentId, { action, revision: current?.__v, followUpDrafts: action === 'approve_advisor' && current?.status !== 'approved' ? (current?.followUpDrafts || []) : undefined })
      setProfessionalAssessments(prev => prev.map(item => item._id === assessmentId ? res.data : item))
      const prepRes = await staffAPI.getAnnualPlanPreparation(id, year)
      setPreparation(prepRes.data || null)
      toast(res.dynamicFollowUps?.warnings?.length ? res.dynamicFollowUps.warnings.join('；') : action === 'take_over_followups' ? '已转人工核对，请补充必要随访后终审' : action === 'approve_advisor' ? '终审已通过，随访发布完成' : '专业评估已提交健康顾问审核')
    } catch (err) { toast(err.message || '审核失败') } finally { setAssessmentBusy(false) }
  }
  const removeAssessmentFollowUpDraft = (assessmentId, index) => setProfessionalAssessments(prev => prev.map(item => item._id === assessmentId ? { ...item, followUpDrafts: (item.followUpDrafts || []).filter((_, draftIndex) => draftIndex !== index) } : item))
  const updateAssessmentFollowUpDraft = (assessmentId, index, patch) => setProfessionalAssessments(prev => prev.map(item => item._id === assessmentId ? { ...item, followUpDrafts: (item.followUpDrafts || []).map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft) } : item))
  const handleAssessmentFollowUpDraft = async assessmentId => {
    const current = professionalAssessments.find(item => item._id === assessmentId)
    if (current?.supersedesAssessmentId && !window.confirm('这是修订反馈。请先核对历史随访，生成后仅保留新增或变化的事项；不会自动撤销旧任务。确认继续？')) return
    setAssessmentBusy(true)
    try {
      const res = await staffAPI.generateAssessmentFollowUpDraft(assessmentId, { revision: current?.__v, allowRevision: !!current?.supersedesAssessmentId })
      setProfessionalAssessments(prev => prev.map(item => item._id === assessmentId ? { ...item, followUpDrafts: res.data?.followUpDrafts || [], followUpAutomation: res.data?.automation, __v: res.data?.revision } : item))
      toast(res.data?.automation?.message || '草稿状态已更新')
    } catch (err) { toast(err.message || '生成随访草稿失败') } finally { setAssessmentBusy(false) }
  }
  const refreshAssessments = async () => {
    if (professionalAssessments.some(item => item.followUpDrafts?.length && item.status === 'advisor_review') && !window.confirm('刷新会替换页面尚未终审的草稿编辑，是否继续？')) return
    setAssessmentBusy(true)
    try {
      const res = await staffAPI.getProfessionalHealthAssessments(id)
      setProfessionalAssessments(res.data || [])
    } catch (err) { toast(err.message || '刷新失败') } finally { setAssessmentBusy(false) }
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
        ? { ...prev, [planType]: { ...prev[planType], ...(res.data || {}), pushedAt: pushedAtVal } }
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
  const pendingExecutionChanges = (executionReviewData?.reviews || []).filter(review => review.status === 'pending').flatMap(review => review.changes || [])
  const visibleModuleEntries = templateModuleEntries.filter(entry => {
    if (pendingExecutionChanges.some(change => change.key === entry.key)) return true
    const data = moduleData[entry.key]
    if (!data) return false
    return entry.def.multi ? (data.records || []).length > 0 : data.enabled !== false && entry.def.fields.some(field => data[field.key] !== undefined && data[field.key] !== '' && data[field.key] !== false)
  })
  const managementTargets = moduleData.management_targets?.records || []
  const issueOptions = managementTargets.map((target, index) => ({ id: targetIssueId(target, index), label: (target.goal || target.sourceTitle || `管理问题 ${index + 1}`).slice(0, 60) }))
  const planActions = visibleModuleEntries.flatMap(entry => {
    const data = moduleData[entry.key] || {}
    return (entry.def.multi ? data.records || [] : [data]).map((record, index) => ({
      key: entry.key, index, record, moduleName: entry.def.name,
      issueId: linkedIssueId(record, managementTargets),
      title: actionTitle(record, entry.def.name),
      date: record.executionDate || record.visit_time || record.plan_time || record.time || record.date || '',
    }))
  })
  const setActionIssue = (action, issueId) => {
    const entry = visibleModuleEntries.find(item => item.key === action.key)
    if (!entry) return
    if (!entry.def.multi) return handleModuleChange(action.key, 'issueId', issueId)
    handleModuleChange(action.key, 'records', (moduleData[action.key]?.records || []).map((record, index) => index === action.index ? { ...record, issueId } : record))
  }
  const activePlanType = selectedAdminTemplate
    ? { ...(PLAN_TYPES.find(pt => pt.key === strategyOf(planType)) || PLAN_TYPES[3]), key: planType, name: selectedAdminTemplate.content?.planName || selectedAdminTemplate.name }
    : PLAN_TYPES.find(pt => pt.key === strategyOf(planType))
  const backPath = patientMode ? '/plans?tab=annual_health_mgmt' : '/plans?type=annual_mgmt'
  const goBack = () => nav(annualPlanReturnTarget(window.history.state?.idx, backPath))

  const yearOptions = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>加载中...</div>

  return (
    <StaffListContext.Provider value={staffList}>
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* 顶部导航 */}
      <div id="annual-plan-actions" className="annual-plan-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={goBack}
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
            onChange={e => { if ((dirty || metricSelectionDirty) && !window.confirm('当前有未保存的更改，切换年度会丢失这些更改，确认切换？')) return; setYear(parseInt(e.target.value)); setDirty(false); setMetricSelectionDirty(false) }}
            style={{ marginLeft: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #E0D9CE', fontSize: 14, background: '#fff', cursor: 'pointer' }}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
        )}
        <div className="annual-plan-action-buttons" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {patientMode && monthlyReviewEnabled && <button className="btn btn-secondary btn-sm" onClick={() => nav(`/patients/${id}/monthly-reviews`)}>月度服务复盘</button>}
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
                disabled={aiPlanLoading || !patient?.aiHealthSummary?.sections || preparationBlocked}
                title={preparationBlocked ? '请先完成首次方案准备清单' : (!patient?.aiHealthSummary?.sections ? '请先在AI信息整理及方案标签页生成健康信息整理结果' : 'AI自动填充方案板块')}
                style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (aiPlanLoading || !patient?.aiHealthSummary?.sections || preparationBlocked) ? 0.5 : 1 }}
              >
                {aiPlanLoading ? 'AI生成中…' : '✨ AI生成方案'}
              </button>
              <button
                onClick={handlePush}
                disabled={pushing || dirty || metricSelectionDirty || !planType || preparationBlocked}
                title={preparationBlocked ? '请先完成首次方案准备清单' : ''}
                style={{ background: pushedAt && !dirty ? '#0077B6' : '#1E6B50', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (pushing || dirty || !planType || preparationBlocked) ? 0.5 : 1 }}
              >
                {pushing ? '推送中...' : pushedAt && !dirty ? '重新推送' : '推送给客户'}
              </button>
            </>
          )}
          <button
            onClick={handleSave}
            disabled={saving || Boolean(pushedAt)}
            title={pushedAt ? '已推送方案的营养指标请在下方单独保存并留痕' : ''}
            style={{ background: '#1E6B50', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || pushedAt ? 0.5 : 1 }}
          >
            {saving ? '保存中...' : '暂存草稿'}
          </button>
        </div>
      </div>

      {generationError && <div role="alert" style={{ padding: 16, marginBottom: 16, background: '#FFF1F2', color: '#9F1239', borderRadius: 10 }}>生成未完成：{generationError}。已有方案未被本次生成替换。</div>}
      {remotePlanChanged && <div role="alert" style={{padding:12,background:'#FFF4D6',marginBottom:12}}>方案已有新补录，当前未保存编辑尚未覆盖。<button onClick={() => { if (window.confirm('放弃当前未保存编辑，加载最新方案？')) window.location.reload() }}>加载最新方案</button></div>}
      {patientMode && plansByType[planType]?.updatedAt && <div style={{color:'#65776F',marginBottom:12}}>方案最后更新：{new Date(plansByType[planType].updatedAt).toLocaleString('zh-CN')}</div>}
      <details id="annual-plan-preparation" className="annual-plan-secondary" open={['#professional-assessments', '#annual-execution-review'].includes(window.location.hash) || undefined}>
        <summary>方案准备{preparation?.checklist && ` · ${preparation.checklist.ready ? '已就绪' : `还差 ${preparation.checklist.progress.total - preparation.checklist.progress.completed} 项`}`}{!preparation?.checklist?.ready && preparation?.checklist?.items?.length ? `：${preparation.checklist.items.filter(item => !item.complete).map(item => item.label).slice(0, 2).join('、')}${preparation.checklist.items.filter(item => !item.complete).length > 2 ? '等' : ''}` : ''} · 展开办理</summary>
      {patientMode && closedLoopEnabled && preparation?.checklist && (
        <div style={{ background: preparation.checklist.ready ? '#F0FDF4' : '#FFFDF7', border: `1px solid ${preparation.checklist.ready ? '#86EFAC' : '#F3D49A'}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2B24' }}>{preparation.continuity?.mode === 'renewal' ? '下一年度方案准备清单' : '首次方案准备清单'}</div>
              <div style={{ fontSize: 13, color: '#6B7F75', marginTop: 4 }}>已完成 {preparation.checklist.progress.completed}/{preparation.checklist.progress.total}；未完成前不能由 AI 生成或正式发布年度方案。</div>
              {preparationSelectionChanged && <div style={{ color: '#9A5B13', marginTop: 6 }}>当前选择尚未满足或与已保存记录不同，请核对并保存准备情况。</div>}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: preparation.checklist.ready ? '#15803D' : '#B45309' }}>{preparation.checklist.ready ? '✓ 已就绪' : '待完善'}</span>
          </div>
          {preparation.continuity?.mode === 'renewal' && <div style={{ marginTop: 10, fontSize: 13, color: '#4A6558' }}>引用 {preparation.continuity.previousYear} 年度总评；不重复要求首次会诊。<a href={`/patients/${id}?tab=aiReview${preparation.continuity.source?.annualReviewId ? `&phaseAssessmentId=${preparation.continuity.source.annualReviewId}` : ''}`}>查看/准备年度总评</a>{preparation.continuity.summary && <details style={{ marginTop: 8 }}><summary>已审核总评内容</summary><div style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{preparation.continuity.summary}</div></details>}</div>}
          <div style={{ marginTop: 12, padding: 12, border: '1px solid #DDEAE0', borderRadius: 8, background: '#F7FAF8' }}>
            <div style={{ fontWeight: 700 }}>本年度综合研判 · 固定议题</div>
            <div style={{ fontSize: 13, color: '#4A6558', marginTop: 5 }}>年度研判汇总专项筛查、已审核的5年趋势和AI风险提示；健康顾问核对问题、判断专科或营养师去向，并与客户确认目标后作为本方案依据。具体营养干预方案由营养师单独发出。</div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} disabled={!canEdit || annualReviewBusy} onClick={openAnnualComprehensiveReview}>{annualReviewBusy ? '正在打开…' : preparation.caseReviews?.some(item => item.reviewType === 'annual' && Number(item.annualPlanYear) === Number(year)) ? '继续年度综合研判' : '开始年度综合研判'}</button>
          </div>
          {!!preparation.caseReviews?.length && <details open={preparation.caseReviews.some(item => item.required && item.conclusion?.status !== 'confirmed')} style={{ marginTop: 10 }}><summary>本年度研判依据</summary><div>年度综合研判固定必需。其他专项研判按本次方案需要勾选；已确认结论自动引用，草稿不引用。</div>{preparation.caseReviews.map(item => <label key={item._id} style={{ display: 'block', marginTop: 6 }}><input type="checkbox" disabled={!canEdit || !!item.annualPlanYear} checked={!!item.annualPlanYear || (preparationDraft.requiredCaseReviewIds || []).includes(String(item._id))} onChange={e => setPreparationDraft(prev => ({ ...prev, requiredCaseReviewIds: e.target.checked ? [...(prev.requiredCaseReviewIds || []), String(item._id)] : (prev.requiredCaseReviewIds || []).filter(id => id !== String(item._id)), advisorReady: false }))} /> {item.annualPlanYear ? '固定必需：' : '本次必需：'}{item.title}（{item.conclusion?.status === 'confirmed' ? '已确认，将引用' : item.annualPlanYear || item.required ? '待确认，阻断生成' : '未引用，不阻断'}）</label>)}<a href={`/patients/${id}?tab=aiCase`}>查看研判</a></details>}
          {!!generationCoverage.length && <details style={{ marginTop: 10 }}><summary>本次来源核对（含待确认及未采用原因）</summary>{generationCoverage.map(item => <div key={item.sourceId}>{item.sourceId}：{{ included: '已纳入', deferred: '待确认', not_applicable: '未采用' }[item.status]}；{item.reason}</div>)}</details>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8, marginTop: 14 }}>
            {preparation.checklist.items.filter(item => !item.complete).map(item => (
              <div key={item.key} style={{ fontSize: 13, color: item.complete ? '#287A50' : '#9A5B13' }}>{item.complete ? '✓' : '○'} {item.label}{item.waived ? '（已说明豁免）' : ''}</div>
            ))}
          </div>
          <details style={{ marginTop: 8, fontSize: 12, color: '#62776A' }}><summary>已完成 {preparation.checklist.progress.completed} 项</summary><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{preparation.checklist.items.filter(item => item.complete).map(item => <span key={item.key}>✓ {item.label}</span>)}</div></details>
          {canEdit && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end', marginTop: 16 }}>
              <label style={{ gridColumn: '1 / -1', fontSize: 13 }}>本年度专科评估需求
                <select aria-label="本年度专科评估需求" value={preparationDraft.assessmentMode} onChange={e => setPreparationDraft(prev => ({ ...prev, assessmentMode: e.target.value, assessmentConfirmedCriteria: [], advisorReady: false }))} className="form-control">
                  <option value="required">需要专科评估</option><option value="none">本次无需新增专科评估（健康顾问确认）</option>
                </select>
              </label>
              {preparationDraft.assessmentMode === 'none' && <div style={{ gridColumn: '1 / -1', fontSize: 13 }}>
                <div>以下五项必须全部符合并由顾问确认，仅适用于本年度本次判断：</div>
                {assessmentCriteria.map(item => <label key={item.key} style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={preparationDraft.assessmentConfirmedCriteria.includes(item.key)} onChange={e => setPreparationDraft(prev => ({ ...prev, assessmentConfirmedCriteria: e.target.checked ? [...prev.assessmentConfirmedCriteria, item.key] : prev.assessmentConfirmedCriteria.filter(key => key !== item.key), advisorReady: false }))} /> {item.label}</label>)}
                <div style={{ marginTop: 8, color: '#9A5B13' }}>任一项不符合或不确定，不得确认无需新增。客户拒绝、时间或费用原因属于暂缓/未完成，不代表无需；出现新情况应重新核对。本清单不替代医生判断。</div>
                <label>补充说明（选填，仅填写额外说明）<textarea aria-label="无需专科评估补充说明" className="form-control" rows={Math.max(3, String(preparationDraft.assessmentNotRequiredReason || '').split('\n').length + 1)} style={{ lineHeight: 1.8, resize: 'vertical' }} value={preparationDraft.assessmentNotRequiredReason} onChange={e => setPreparationDraft(prev => ({ ...prev, assessmentNotRequiredReason: e.target.value, advisorReady: false }))} /></label>
              </div>}
              <label style={{ fontSize: 12, color: '#4A6558' }}>{preparation.continuity?.mode === 'renewal' ? '按需补充的专业评估领域（可留空）' : '所需专业评估领域（用顿号分隔）'}
                <input disabled={preparationDraft.assessmentMode === 'none'} value={preparationDraft.assessmentMode === 'none' ? '' : preparationDraft.requiredAssessmentDomains} onChange={e => setPreparationDraft(prev => ({ ...prev, requiredAssessmentDomains: e.target.value }))} placeholder="如：心血管、营养、中医健康" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, padding: '8px 10px', border: '1px solid #D9D4CA', borderRadius: 8 }} />
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
      {patientMode && plansByType[planType]?._id && <AnnualExecutionReview key={`${id}:${plansByType[planType]._id}`} patientId={id} planId={plansByType[planType]._id} planVersion={currentPlanVersion} canEdit={canEdit} onDataChange={setExecutionReviewData} />}
      {patientMode && closedLoopEnabled && canEdit && <AnnualPlanSupplement key={`${id}:${year}:${planType}:${selectedTemplateId}`} patientId={id} year={year} planType={planType} template={adminTemplates.find(t => t._id === selectedTemplateId)} templateId={selectedTemplateId} plan={plansByType[planType]} moduleData={moduleData} canEdit={canEdit} blocked={preparationBlocked} toast={toast} onApply={data => { setModuleData(data); setDirty(true) }} />}
      {patientMode && ['superadmin', 'healthPlanner', 'familyDoctor', 'healthManager'].includes(staff?.role) && preparation?.continuity?.mode === 'renewal' && <AnnualServicePeriodPanel key={`${year}:${planType}`} planId={plansByType[planType]?._id} staff={staff} />}

      {patientMode && closedLoopEnabled && (
        <div id="professional-assessments" style={{ background: '#fff', border: '1px solid #D7E4DD', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2B24' }}>专业健康评估</div>
          <button disabled={assessmentBusy} onClick={refreshAssessments} className="btn btn-secondary btn-sm">刷新评估与草稿状态</button>
          <div style={{ fontSize: 13, color: '#6B7F75', marginTop: 4 }}>年度综合评估输入经终审后用于年度方案；后续专项协作生成动态随访，不重建年度方案。</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {professionalAssessments.map(item => <div key={item._id} style={{ border: '1px solid #E8E3DA', borderRadius: 9, padding: 11, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}><b>{item.domain} · {item.title}</b><div style={{ fontSize: 12, color: '#6B7F75', marginTop: 3 }}>{item.purpose === 'annual_input' ? '年度综合评估输入' : '专项协作评估'} · {(item.facts || []).join('；') || '暂无结论摘要'}</div></div>
              <span style={{ fontSize: 12, color: item.status === 'approved' ? '#15803D' : '#B45309' }}>{{ approved: '已终审', advisor_review: '待健康顾问终审', superseded: '已被修订版本替代', rejected: '已退回' }[item.status] || '待专业审核'}</span>
              {item.followUpAutomation?.message && <div style={{ flexBasis: '100%', color: item.followUpAutomation.status === 'failed' ? '#DC2626' : '#6B7F75', fontSize: 13 }}>{item.followUpAutomation.message}</div>}
              {canEdit && item.status === 'advisor_review' && <>
                {item.purpose !== 'annual_input' && item.followUpAutomation?.status !== 'ready' && <button disabled={assessmentBusy || ['queued', 'running'].includes(item.followUpAutomation?.status)} onClick={() => handleAssessmentFollowUpDraft(item._id)} className="btn btn-secondary btn-sm">{item.followUpAutomation?.status === 'failed' ? '重试生成草稿' : 'AI随访草稿'}</button>}
                {item.followUpAutomation?.status === 'failed' && <button disabled={assessmentBusy} onClick={() => handleReviewAssessment(item._id, 'take_over_followups')} className="btn btn-secondary btn-sm">改为人工核对</button>}
                {item.purpose !== 'annual_input' && !['queued', 'running', 'failed'].includes(item.followUpAutomation?.status) && <button disabled={assessmentBusy} className="btn btn-secondary btn-sm" onClick={() => setProfessionalAssessments(prev => prev.map(row => row._id === item._id ? { ...row, followUpDrafts: [...(row.followUpDrafts || []), { title: '', content: '', date: '', category: 'information', requiresService: false }] } : row))}>补充随访草稿</button>}
                <button disabled={assessmentBusy || ['queued', 'running', 'failed'].includes(item.followUpAutomation?.status)} onClick={() => handleReviewAssessment(item._id, 'approve_advisor')} className="btn btn-primary btn-sm">终审通过</button>
              </>}
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
                    <DateField aria-label={`随访${index + 1}日期`} type="date" value={draft.date} onChange={e => updateAssessmentFollowUpDraft(item._id, index, { date: e.target.value })} />
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
            {!professionalAssessments.length && <div style={{ color: '#9A6A28', fontSize: 13 }}>暂无专业评估记录；请完成所需评估，或由健康顾问在准备清单中确认“无需新增专科评估”的全部五项条件。其余准备要求仍保留。</div>}
          </div>
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', color: '#1E6B50', fontWeight: 600 }}>＋ 新建专业评估记录</summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 12 }}>
              <div style={{gridColumn:"1 / -1"}}><ProfessionalAssessmentFields value={assessmentDraft} onChange={setAssessmentDraft}/></div>
              <button onClick={handleCreateAssessment} disabled={assessmentSaving} className="btn btn-primary" style={{ justifySelf: 'start' }}>{assessmentSaving ? '保存中…' : '保存评估草稿'}</button>
            </div>
          </details>
        </div>
      )}

      </details>


      <details open={!selectedTemplateId || undefined} style={{ background: '#fff', border: '1px solid #E0D9CE', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#4A6558' }}>方案设置 · {activePlanType?.name || '待选服务版本'}</summary>
      {patientMode && planType && <details style={{ background: '#F4F8F5', border: '1px solid #DDEAE0', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#4A6558' }}>正式阶段评估：{{ biweekly: '每 2 周', monthly: '每月', quarterly: '每季度' }[phaseAssessmentFrequency] || '按服务包周期'}</summary>
        <label htmlFor="phase-assessment-frequency" style={{ display: 'block', fontSize: 13, margin: '12px 0 8px' }}>调整评估周期</label>
        <select id="phase-assessment-frequency" className="form-input" value={phaseAssessmentFrequency} disabled={!canEdit || !!pushedAt || !!confirmedAt} onChange={e => { setPhaseAssessmentFrequency(e.target.value); setDirty(true) }}>
          <option value="">按服务包已配置周期；若服务包写“按计划阶段安排”，请在此选择</option>
          <option value="biweekly">方案约定：每 2 周</option><option value="monthly">方案约定：每月</option><option value="quarterly">方案约定：每季度</option>
        </select>
        <div style={{ fontSize: 12, color: '#65776F', marginTop: 8 }}>服务包已有固定周期时，以服务包为准；未配置周期时，以客户确认的本方案安排自动生成待审核评估。</div>
      </details>}
      {/* 方案类型选择 */}
      <details open={!selectedTemplateId || undefined} style={{ background: '#fff', borderRadius: 12, padding: '12px 20px', marginBottom: 20, border: '1px solid #E0D9CE' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#4A6558' }}>方案版本：{activePlanType?.name || '请选择方案类型'}{selectedTemplateId ? ' · 点击更换' : ''}</summary>
        <div style={{ marginTop: 14 }} />
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
      </details>
      </details>


      {/* 板块列表 */}
      {planType ? (
        <div id="annual-plan-content" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: '#1A2B24' }}>本年度管理方案</h2>
            <div style={{ marginTop: 5, fontSize: 13, color: '#62776A' }}>
              {(moduleData.management_targets?.records || []).length} 项管理目标 · {visibleModuleEntries.reduce((count, entry) => count + (entry.def.multi ? (moduleData[entry.key]?.records || []).length : 1), 0)} 项服务与行动
              {preparation?.checklist && <button type="button" onClick={() => { const panel = document.getElementById('annual-plan-preparation'); if (panel) { panel.open = true; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }} style={{ marginLeft: 10, padding: 0, border: 0, background: 'none', color: preparation.checklist.ready ? '#287A50' : '#9A5B13', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>准备情况：{preparation.checklist.progress.completed}/{preparation.checklist.progress.total} · 查看</button>}
              {pendingExecutionChanges.length > 0 && <button type="button" onClick={() => { const panel = document.getElementById('annual-plan-preparation'); if (panel) { panel.open = true; document.getElementById('annual-execution-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }} style={{ marginLeft: 10, padding: 0, border: 0, background: 'none', color: '#9A5B13', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>{pendingExecutionChanges.length} 项执行待核对 · 处理</button>}
            </div>
          </div>
          {patientMode && <section style={{ marginBottom: 16 }} aria-label="按问题查看年度管理方案">
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2B24', marginBottom: 8 }}>按问题查看方案</div>
            {canEdit && !pushedAt && <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 10 }} onClick={reloadManagementTargets}>更新已确认研判目标</button>}
            {!moduleData.management_targets?.records?.length && <div style={{ fontSize: 12, color: '#62776A', marginTop: 8 }}>暂无逐条管理目标。请先在专项研判中确认，保存年度草稿时也会自动带入。</div>}
            {managementTargets.map((row, index) => <div key={targetIssueId(row, index)} style={{ background: '#fff', border: '1px solid #B9D8C8', borderRadius: 12, padding: 16, marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1A2B24', marginBottom: 5 }}>{index + 1}. {row.goal || row.sourceTitle || '管理问题'}</div>
              <div style={{ fontSize: 12, color: '#62776A', marginBottom: 10 }}>来源：{row.sourceTitle || '年度方案补充'}{row.sourceConfirmedAt ? ` · ${new Date(row.sourceConfirmedAt).toLocaleDateString('zh-CN')}` : ''}{row.sourceGoal && (row.goal !== row.sourceGoal || row.focus !== row.sourceFocus) ? ' · 年度草稿已调整' : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                <label style={{ fontSize: 12, color: '#62776A' }}>管理目标<textarea className="form-input" aria-label={`管理目标 ${index + 1}`} rows={2} style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical' }} value={row.goal || ''} disabled={!canEdit || !!pushedAt} onChange={e => handleModuleChange('management_targets', 'records', moduleData.management_targets.records.map((item, i) => i === index ? { ...item, goal: e.target.value } : item))} /></label>
                <label style={{ fontSize: 12, color: '#62776A' }}>干预重点<textarea className="form-input" aria-label={`干预重点 ${index + 1}`} rows={2} style={{ display: 'block', width: '100%', boxSizing: 'border-box', resize: 'vertical' }} value={row.focus || ''} disabled={!canEdit || !!pushedAt} onChange={e => handleModuleChange('management_targets', 'records', moduleData.management_targets.records.map((item, i) => i === index ? { ...item, focus: e.target.value } : item))} /></label>
              </div>
              <label style={{ fontSize: 13, display: 'inline-block', marginTop: 7 }}><input type="checkbox" checked={row.nutritionRelevant === true} disabled={!canEdit || !!pushedAt} onChange={e => handleModuleChange('management_targets', 'records', moduleData.management_targets.records.map((item, i) => i === index ? { ...item, nutritionRelevant: e.target.checked } : item))} /> 营养相关，带给营养师</label>
              <div style={{ borderTop: '1px solid #E5ECE7', marginTop: 12, paddingTop: 10 }}>
                <b style={{ fontSize: 13 }}>对应行动</b>
                {planActions.filter(action => action.issueId === targetIssueId(row, index)).map(action => <div key={`${action.key}-${action.index}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 0', fontSize: 13 }}><span style={{ color: '#62776A', minWidth: 90 }}>{action.moduleName}</span><span style={{ flex: 1 }}>{action.title}</span><span style={{ color: '#62776A' }}>{action.date || '时间待确认'}</span></div>)}
                {!planActions.some(action => action.issueId === targetIssueId(row, index)) && <div style={{ color: '#789087', fontSize: 12, marginTop: 5 }}>暂无已关联行动，可在下方为方案事项选择管理问题。</div>}
              </div>
            </div>)}
          </section>}
          {patientMode && <details style={{ background: '#fff', border: '1px solid #B9D8C8', borderRadius: 12, padding: 16, marginBottom: 12 }} aria-label="年度标准营养评估">
            <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#1A2B24' }}>🥗 营养评估 · {(moduleData.nutrition_assessment?.nutritionComparisonMetrics || []).length} 项对比指标{nutritionTask ? ' · 已派发营养师' : ' · 待派发'}{pendingExecutionChanges.some(change => change.key === 'nutrition_assessment') && <span style={{ marginLeft: 8, color: '#9A5B13', fontSize: 12 }}>执行待核对</span>}</summary>
            <div style={{ fontSize: 12, color: '#62776A', margin: '5px 0 12px' }}>每位客户均保留营养评估。健康顾问勾选本年度需要前后对比的客观数据与主观感受；体重也在此选择。骨骼肌、体脂率和内脏脂肪由营养方案固定提供。</div>
            <label style={{ display: 'block', fontSize: 13, color: '#4A6558' }}>计划评估日期（可留空；单独派发时留空按当天安排）<DateField type="date" className="form-input" value={moduleData.nutrition_assessment?.executionDate || ''} disabled={!canEdit || Boolean(pushedAt)} onChange={e => handleModuleChange('nutrition_assessment', 'executionDate', e.target.value)} style={{ display: 'block', maxWidth: 240, marginTop: 5 }} /></label>
            <div style={{ fontSize: 13, marginTop: 12, color: '#4A6558' }}>责任营养师：{patient?.assignedNutritionist?.name || staffList.find(s => String(s._id) === String(patient?.assignedNutritionist?._id || patient?.assignedNutritionist))?.name || '待分配'}</div>
            <div style={{ fontSize: 13, color: '#4A6558', marginTop: 12 }}>本年度营养干预前后对比指标</div>
            <NutritionComparisonMetricPicker value={moduleData.nutrition_assessment?.nutritionComparisonMetrics ?? (plansByType[planType] ? [] : ['体重'])} onChange={handleNutritionMetricChange} disabled={!canEdit} />
            {!!moduleData.nutrition_assessment?.records?.length && <div style={{marginTop:12}}><strong>专项评估重点</strong>{moduleData.nutrition_assessment.records.map((row,index)=><div key={index} style={{padding:'9px 0',borderBottom:'1px solid #E5ECE7'}}><div>{row.items}{pendingExecutionChanges.some(change => change.key === 'nutrition_assessment' && change.after?.title === row.items) && <span style={{ marginLeft: 8, color: '#9A5B13', fontSize: 12 }}>执行待核对</span>}</div><div style={{fontSize:12,color:'#62776A',whiteSpace:'pre-wrap'}}>依据：{row.basisSummary||row.reason||'待核对'}</div><div style={{fontSize:12,color:'#62776A',whiteSpace:'pre-wrap'}}>评估建议：{row.personalizedAdvice||'待确认'}</div></div>)}</div>}
            {pendingExecutionChanges.filter(change => change.key === 'nutrition_assessment').map((change, index) => <details key={`nutrition-review-${index}`} style={{ marginTop: 8, color: '#9A5B13', fontSize: 12 }}><summary style={{ cursor: 'pointer' }}>{change.action}：{change.title} · 查看本项修订</summary><div style={{ whiteSpace: 'pre-wrap' }}>原方案：{change.before?.title || '无'} · {change.before?.date || '日期待确认'} · {change.before?.advice || ''}</div><div style={{ whiteSpace: 'pre-wrap' }}>当前方案：{change.after?.title || '无'} · {change.after?.datePending ? '日期待确认' : change.after?.date || '日期待确认'} · {change.after?.advice || ''}</div></details>)}
            {pushedAt && canEdit && <button type="button" className="btn btn-secondary btn-sm" disabled={!metricSelectionDirty || metricSelectionSaving} onClick={savePublishedNutritionMetrics}>{metricSelectionSaving ? '保存中…' : '保存指标调整（留痕）'}</button>}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {nutritionTask ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => nav(`/patients/${id}?tab=followups&followUpId=${nutritionTask._id}`)}>营养师任务已派发 · 查看{nutritionTask.status === 'completed' ? '结果' : '任务'}</button>
                : canEdit && <button type="button" className="btn btn-primary btn-sm" disabled={!currentPlanId || dirty || metricSelectionDirty || remotePlanChanged || nutritionDispatching || nutritionTaskLoading || !patient?.assignedNutritionist} onClick={dispatchNutritionTask}>{nutritionDispatching ? '派发中…' : '单独派发给营养师'}</button>}
              <span style={{ fontSize: 12, color: '#62776A' }}>{nutritionTask ? '已有任务不会因年度方案确认再次派发。' : !patient?.assignedNutritionist ? '请先为客户分配责任营养师。' : '保存草稿后即可派发，无需先推送整个年度方案；仅生成营养师内部任务。'}</span>
            </div>
            {!!plansByType[planType]?.nutritionMetricHistory?.length && <details style={{ marginTop: 10, fontSize: 12, color: '#52675D' }}><summary>指标调整记录（{plansByType[planType].nutritionMetricHistory.length}次）</summary>{plansByType[planType].nutritionMetricHistory.map((entry, index) => <div key={index} style={{ padding: '6px 0' }}>{new Date(entry.changedAt).toLocaleString('zh-CN')} · {entry.changedByName || '健康顾问'}：{(entry.before || []).join('、') || '未选'} → {(entry.after || []).join('、') || '未选'}</div>)}</details>}
          </details>}
          {planActions.filter(action => !action.issueId).length > 0 && <section style={{ background: '#fff', border: '1px solid #E0D9CE', borderRadius: 12, padding: 16, marginBottom: 12 }} aria-label="年度固定服务与待关联行动">
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1A2B24' }}>年度固定服务与待关联行动</div>
            <div style={{ fontSize: 12, color: '#62776A', margin: '4px 0 8px' }}>固定服务保留在年度方案；与具体问题有关的行动，请选择关联问题。</div>
            {planActions.filter(action => !action.issueId).map(action => <div key={`${action.key}-${action.index}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #EDF1EE', fontSize: 13 }}>
              <span style={{ minWidth: 95, color: '#62776A' }}>{action.moduleName}</span><span style={{ flex: 1, minWidth: 150 }}>{action.title}{action.date ? ` · ${action.date}` : ''}</span>
              {canEdit && !pushedAt && issueOptions.length > 0 && <select aria-label={`关联问题 ${action.title}`} className="form-input" style={{ width: 'auto', maxWidth: 230 }} value={action.record.issueId || ''} onChange={e => setActionIssue(action, e.target.value)}><option value="">待关联</option><option value="fixed">年度固定服务</option>{issueOptions.map(issue => <option key={issue.id} value={issue.id}>{issue.label}</option>)}</select>}
            </div>)}
          </section>}
          <details style={{ background: '#fff', border: '1px solid #E0D9CE', borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#1A2B24' }}>编辑服务安排与行动细节 · {planActions.length} 项</summary>
            <div style={{ marginTop: 12, fontSize: 12, color: '#62776A' }}>按服务类别编辑执行时间、人员和服务方式；上方按问题汇总的内容会同步更新。</div>
          {visibleModuleEntries.map(entry => (
            <ModulePanel
              key={entry.key}
              moduleKey={entry.key}
              def={entry.key === 'personalized_followups' || (patientMode && closedLoopEnabled) ? annualItemLayout(entry.key, entry.def, patient?.assignedHealthManager?.name || staffList.find(s => String(s._id) === String(patient?.assignedHealthManager?._id || patient?.assignedHealthManager))?.name, patient?.assignedNutritionist?.name || staffList.find(s => String(s._id) === String(patient?.assignedNutritionist?._id || patient?.assignedNutritionist))?.name, patientMode ? plansByType[planType]?._id : plan?._id, dirty) : entry.def}
              data={moduleData[entry.key] || {}}
              onChange={handleModuleChange}
              showPlanSummary
              issues={issueOptions}
              executionReviewChanges={pendingExecutionChanges.filter(change => change.key === entry.key)}
            />
          ))}
          </details>
          {patientMode && <AnnualServiceRecommendations patient={patient} staffList={staffList} planId={plansByType[planType]?._id} pushedAt={pushedAt} canEdit={canEdit} toast={toast} />}
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

      <div className="annual-plan-footer">
        <button className="btn btn-secondary" onClick={goBack}>返回方案列表</button>
      </div>
    </div>
    </StaffListContext.Provider>
  )
}
