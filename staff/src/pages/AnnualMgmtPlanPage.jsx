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

// ── 板块定义（key → { name, icon, fields }）──────────────────────────
const MODULE_DEFS = {
  medical_treatment: {
    name: '医疗问题解决', icon: '🏥', multi: true, summaryKey: 'hospital', summaryLabel: '就医医院',
    fields: [
      { key: 'visit_time',   label: '就医时间',   type: 'date' },
      { key: 'hospital',     label: '就医医院',   type: 'text', placeholder: '如：省人民医院' },
      { key: 'department',   label: '就诊科室',   type: 'text', placeholder: '如：心内科' },
      { key: 'expert',       label: '专家姓名',   type: 'text' },
      { key: 'reason',       label: '就医原因',   type: 'textarea' },
      { key: 'coordinator',  label: '协调专员',   type: 'staff-select' },
      { key: 'followUpStaff', label: '随访人员',  type: 'staff-select' },
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
      { key: 'notes',        label: '注意事项',     type: 'textarea', internal: true },
    ],
  },
  abnormal_followup: {
    name: '异常复查提醒', icon: '🔔', multi: true, summaryKey: 'items', summaryLabel: '复查项目',
    fields: [
      { key: 'items',           label: '复查项目',       type: 'text' },
      { key: 'reason',          label: '复查原因',       type: 'textarea' },
      { key: 'hospital',        label: '复查医院',       type: 'text' },
      { key: 'time',            label: '复查时间',       type: 'date' },
      { key: 'department',      label: '检查科室',       type: 'text' },
      { key: 'expert',          label: '检查专家',       type: 'text' },
      { key: 'order_dept',      label: '开单科室',       type: 'text' },
      { key: 'order_expert',    label: '开单专家',       type: 'text' },
      { key: 'assist',          label: '是否安排就医协助', type: 'yesno' },
      { key: 'coordinator',     label: '协调专员',       type: 'staff-select' },
      { key: 'followUpStaff',   label: '随访人员',       type: 'staff-select' },
      { key: 'notes',           label: '注意事项',       type: 'textarea', internal: true },
    ],
  },
  vaccine: {
    name: '疫苗接种', icon: '💉', multi: true, summaryKey: 'name', summaryLabel: '疫苗名称',
    fields: [
      { key: 'name',        label: '疫苗名称', type: 'text' },
      { key: 'brand',       label: '品牌',     type: 'text' },
      { key: 'time',        label: '接种时间', type: 'date' },
      { key: 'reason',      label: '接种原因', type: 'textarea' },
      { key: 'institution', label: '接种机构', type: 'text' },
      { key: 'followUpStaff', label: '随访人员', type: 'staff-select' },
      { key: 'notes',       label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  monitoring: {
    name: '日常监测', icon: '📊', multi: true, summaryKey: 'items', summaryLabel: '监测项目',
    fields: [
      { key: 'items',     label: '监测项目', type: 'text' },
      { key: 'time',      label: '监测时间', type: 'text', placeholder: '如：每天早晨' },
      { key: 'purpose',   label: '监测目的', type: 'textarea' },
      { key: 'frequency', label: '监测频率', type: 'text', placeholder: '如：每日一次' },
      { key: 'followUpStaff', label: '随访人员', type: 'staff-select' },
      { key: 'notes',     label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  lifestyle: {
    name: '生活方式评估', icon: '🌿',
    fields: [
      { key: 'time',  label: '评估周期', type: 'text', placeholder: '如：2026年上半年' },
      { key: 'focus', label: '评估重点', type: 'textarea' },
      { key: 'staff', label: '评估人员', type: 'staff-select' },
      { key: 'notes', label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  annual_checkup: {
    name: '年度体检', icon: '🔬',
    fields: [
      { key: 'date',        label: '计划体检日期', type: 'date' },
      { key: 'institution', label: '计划体检机构', type: 'text' },
      { key: 'focus',       label: '重点关注',     type: 'textarea' },
      { key: 'escort',      label: '是否提供陪检服务', type: 'yesno' },
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
    ],
  },
  quarterly_eval: {
    name: '季度评估', icon: '📋',
    fields: [
      { key: 'body_composition', label: '人体成分测量',   type: 'yesno' },
      { key: 'diet_analysis',    label: '膳食调研及分析', type: 'yesno' },
      { key: 'followUpStaff',    label: '随访人员',       type: 'staff-select' },
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
    ],
  },
  personalized_followups: {
    name: '个性化随访方案', icon: '🗓️', multi: true, summaryKey: 'items', summaryLabel: '随访方案',
    fields: [
      { key: 'standardPlanName', label: '来源标准方案', type: 'text' },
      { key: 'items', label: '个性化随访名称', type: 'text' },
      { key: 'matchReason', label: '匹配依据', type: 'textarea' },
      { key: 'content', label: '个性化随访内容', type: 'textarea' },
      { key: 'executionDate', label: '主执行日期', type: 'date' },
      { key: 'frequency', label: '执行频次', type: 'text' },
      { key: 'followUpStaff', label: '主执行人', type: 'staff-select' },
      { key: 'collaborator', label: '协同执行人（可选）', type: 'staff-select' },
      { key: 'collaborationDate', label: '协同执行日期（可选）', type: 'date' },
      { key: 'precautions', label: '注意事项', type: 'textarea' },
      { key: 'customerAction', label: '客户行动', type: 'textarea' },
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

const templateEntries = template => {
  // v3起年度规则统一调用全局随访方案库；模板内旧 followUpPlans 只兼容存量，
  // 不再决定客户页面板块。AI筛选结果统一进入“个性化随访方案”。
  const entries = []
  const usedBaseKeys = new Set(entries.map(entry => entry.key.startsWith('lifestyle_') ? 'lifestyle' : entry.key))
  ;(template?.content?.moduleRules || []).filter(rule => rule.enabled !== false).forEach(rule => {
    const key = ADMIN_RULE_MODULE_MAP[rule.key]
    if (!key || usedBaseKeys.has(key) || !MODULE_DEFS[key]) return
    entries.push({ key, def: MODULE_DEFS[key], source: rule })
    usedBaseKeys.add(key)
  })
  entries.push({ key: 'personalized_followups', def: MODULE_DEFS.personalized_followups, source: { key: 'global_followup_library' } })
  return entries
}

// ── 各方案类型包含的板块（按顺序）──────────────────────────────────
const PLAN_TYPE_MODULES = {
  health_reshape:    ['medical_treatment', 'specialist_collab', 'abnormal_followup', 'vaccine', 'monitoring', 'lifestyle', 'annual_checkup', 'quarterly_eval'],
  young_state:       ['abnormal_followup', 'vaccine', 'monitoring', 'functional_medicine', 'lifestyle', 'annual_checkup', 'quarterly_eval'],
  chronic_stable:    ['abnormal_followup', 'vaccine', 'monitoring', 'lifestyle', 'annual_checkup', 'quarterly_eval'],
  health_prevention: ['abnormal_followup', 'vaccine', 'monitoring', 'annual_checkup'],
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
  const [plansByType, setPlansByType] = useState({}) // patientMode: { planType: plan }，4个类型各存一份
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
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!patientMode || !patient?._id) return
    setTemplatesLoading(true)
    staffAPI.getPlanTemplates('health_management', patient._id)
      .then(r => setAdminTemplates(r.data || []))
      .catch(err => { setAdminTemplates([]); toast(err.message || '加载Admin管理方案模板失败') })
      .finally(() => setTemplatesLoading(false))
  }, [patientMode, patient?._id])

  useEffect(() => {
    setLoading(true)
    if (patientMode) {
      Promise.all([
        staffAPI.getPatient(id),
        staffAPI.getAnnualPlan(id, year),
      ]).then(([patRes, planRes]) => {
        setPatient(patRes.data?.user || patRes.data)
        // 后端返回该年度全部类型的方案数组，按 updatedAt 降序
        const list = Array.isArray(planRes.data) ? planRes.data : (planRes.data ? [planRes.data] : [])
        const map = {}
        list.forEach(p => { if (p.planType) map[p.planType] = p })
        setPlansByType(map)
        // 从"管理方案"tab点"✨ AI年度管理方案"按钮跳转过来时会带 ?planType=xxx，
        // 优先用它选中对应类型（而不是默认选"最近编辑过的那一份"），让用户选的类型立刻生效
        const queryPlanType = searchParams.get('planType')
        const target = queryPlanType && map[queryPlanType]
          ? map[queryPlanType]
          : (queryPlanType ? null : list.find(p => p.planType))
        if (target) {
          setPlanType(target.planType)
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
        const res = await staffAPI.saveAnnualPlan(id, { planType, moduleData, year, templateId: selectedTemplateId || null, templateName: selectedTemplate?.name || '' })
        const saved = res.data
        if (saved) {
          setPlansByType(prev => ({ ...prev, [planType]: saved }))
          setPushedAt(saved.pushedAt || null)
          setConfirmedAt(saved.confirmedAt || null)
        }
        // 保存方案已同步按内容生成/更新随访占位（就医/会诊/复查等各条记录、日常监测/季度评估周期排期），
        // 已被医护审核过的随访不受影响，只有还没处理的自动占位会按最新方案内容重新排期
        toast(res.followUpCount ? `方案已保存，同步生成 ${res.followUpCount} 条随访计划` : '方案已保存')
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
      const res = await staffAPI.generateAIAnnualPlan(id, type, '', selectedTemplateId)
      const aiData = res.data || {}
      // 只填充当前所选方案类型包含的板块，其余类型的板块忽略（一次只生成一个方案）
      const configuredRules = selectedTemplate?.content?.moduleRules || []
      const enabledRuleKeys = new Set(configuredRules.filter(rule => rule.enabled !== false && rule.aiCanGenerate !== false).map(rule => ADMIN_RULE_MODULE_MAP[rule.key]).filter(Boolean))
      const allowedKeys = configuredRules.length ? (PLAN_TYPE_MODULES[type] || []).filter(key => enabledRuleKeys.has(key) || ![...Object.values(ADMIN_RULE_MODULE_MAP)].includes(key)) : (PLAN_TYPE_MODULES[type] || [])
      setModuleData(prev => {
        const merged = { ...prev }
        Object.entries(aiData).forEach(([key, val]) => {
          if (key === 'templateNodes') return
          if (!allowedKeys.includes(key)) return
          if (val && (val.records?.length > 0 || val.enabled)) {
            merged[key] = val
          }
        })
        const personalized = (aiData.templateNodes || []).map(node => ({
          standardPlanId: node.standardPlanId || '', standardPlanName: node.standardPlanName || '',
          sourceCycles: node.sourceCycles || [], items: node.title || node.standardPlanName || '',
          matchReason: node.matchReason || '', content: node.content || '', executionDate: node.executionDate || node.time || '',
          frequency: node.frequency || '', precautions: node.precautions || '',
          customerAction: node.customerAction || '', followUpStaff: node.defaultEmployeeId || '',
          reviewStatus: 'pending_family_doctor_review',
        }))
        if (personalized.length) merged.personalized_followups = { records: personalized }
        return merged
      })
      setDirty(true)
      toast(`AI已按「${ptName}」填充方案内容，请检查并保存`)
    } catch (err) {
      toast(err.message || 'AI生成方案失败')
    } finally {
      setAiPlanLoading(false)
    }
  }
  const handleGenerateAIAnnualPlan = () => runAIGenerate(planType, false)

  const handlePush = async () => {
    if (dirty) { toast('有未保存的更改，请先保存再推送'); return }
    if (!planType) { toast('请先选择方案类型并保存'); return }
    if (!window.confirm('确定将此年度管理方案推送给客户？客户端将立即可见。')) return
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
    : (PLAN_TYPE_MODULES[planType] || []).map(key => ({ key, def: MODULE_DEFS[key] }))
  const activePlanType = selectedAdminTemplate
    ? { ...(PLAN_TYPES.find(pt => pt.key === planType) || PLAN_TYPES[3]), name: selectedAdminTemplate.content?.planName || selectedAdminTemplate.name }
    : PLAN_TYPES.find(pt => pt.key === planType)
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
                disabled={aiPlanLoading || !patient?.aiHealthSummary?.sections}
                title={!patient?.aiHealthSummary?.sections ? '请先在AI信息整理及方案标签页生成健康信息整理结果' : 'AI自动填充方案板块'}
                style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (aiPlanLoading || !patient?.aiHealthSummary?.sections) ? 0.5 : 1 }}
              >
                {aiPlanLoading ? 'AI生成中…' : '✨ AI生成方案'}
              </button>
              <button
                onClick={handlePush}
                disabled={pushing || dirty || !planType}
                style={{ background: pushedAt && !dirty ? '#0077B6' : '#1E6B50', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (pushing || dirty || !planType) ? 0.5 : 1 }}
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

      {/* 方案类型选择 */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #E0D9CE' }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 14 }}>选择方案类型</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {templatesLoading && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#8AA89C' }}>正在从Admin后台加载模板...</div>}
          {!templatesLoading && adminTemplates.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#D97706' }}>该客户所属平台暂无健康管理方案模板，请在Admin后台配置“客户归属”和“方案归类”</div>}
          {adminTemplates.map((tpl, index) => {
            const key = tpl.content?.planType || 'health_prevention'
            const base = PLAN_TYPES.find(pt => pt.key === key) || PLAN_TYPES[index % PLAN_TYPES.length]
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
            已确认健康资料与阶段性评估确定个性化重点；Admin启用的标准随访方案提供体检、疫苗、复查等基础动作和周期；AI只能从标准库中筛选并补充个性化内容，最终由健康顾问确认执行人和日期。
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
          {templateModuleEntries.map(entry => (
            <ModulePanel
              key={entry.key}
              moduleKey={entry.key}
              def={entry.def}
              data={moduleData[entry.key] || {}}
              onChange={handleModuleChange}
            />
          ))}
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
