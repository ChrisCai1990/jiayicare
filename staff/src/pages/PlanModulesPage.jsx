import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'
import { StaffListContext, ModulePanel } from '../components/ModulePanel'

// 营养干预方案 / 就医协助方案的板块化编辑页（2026-07-13新增）。
// 之前这两类方案AI生成后只是扁平items+零散content字段，跟年度管理方案的"选模板→板块折叠面板→
// AI填充→保存/推送"完全不是一套呈现，用户要求三者体验统一。复用 AnnualMgmtPlanPage 抽出的
// ModulePanel 组件，但不需要"4类型选择"和"按年份"——这两类方案本身就是单一类型、一个会员可以
// 有多条独立记录（不像年度管理方案一年一份的强约束），所以用 HealthPlan._id 直接定位，比年度
// 管理方案的交互更简单。

const MODULE_DEFS_BY_TYPE = {
  nutrition: {
    breakfast: {
      name: '早餐方案', icon: '🍳',
      fields: [{ key: 'content', label: '早餐内容', type: 'textarea', placeholder: '食物种类、分量' }],
    },
    lunch: {
      name: '午餐方案', icon: '🍚',
      fields: [{ key: 'content', label: '午餐内容', type: 'textarea', placeholder: '食物种类、分量' }],
    },
    dinner: {
      name: '晚餐方案', icon: '🍲',
      fields: [{ key: 'content', label: '晚餐内容', type: 'textarea', placeholder: '食物种类、分量' }],
    },
    snack: {
      name: '加餐方案', icon: '🍎',
      fields: [{ key: 'content', label: '加餐内容', type: 'textarea', placeholder: '两餐间加餐建议（若需要）' }],
    },
    principle: {
      name: '饮食原则', icon: '📋',
      fields: [
        { key: 'dietPrinciple', label: '膳食总原则', type: 'textarea', placeholder: '如：低盐低脂、高纤维' },
        { key: 'cookingMethod', label: '烹饪方式', type: 'text', placeholder: '推荐：蒸煮炖；避免：油炸' },
        { key: 'mealOrder', label: '进餐顺序', type: 'text', placeholder: '如：汤→蔬菜→肉→主食' },
        { key: 'dailyWater', label: '每日饮水量', type: 'text', placeholder: '如：2000ml' },
      ],
    },
    forbidden: {
      name: '禁忌食物', icon: '🚫',
      fields: [
        { key: 'allowedFoods', label: '推荐食物', type: 'textarea', placeholder: '逗号分隔' },
        { key: 'forbiddenFoods', label: '禁忌食物', type: 'textarea', placeholder: '逗号分隔' },
      ],
    },
    supplement: {
      name: '营养补充信息', icon: '💊',
      fields: [{ key: 'content', label: '现有补充记录', type: 'textarea', placeholder: '仅记录客户已使用信息及来源，不填写推荐或剂量调整建议' }],
    },
    exercise: {
      name: '运动建议', icon: '🏃',
      fields: [{ key: 'content', label: '运动建议', type: 'textarea', placeholder: '运动类型、频率、时长、强度' }],
    },
  },
  medical_assist: {
    visit: {
      name: '就诊安排', icon: '🏥',
      fields: [
        { key: 'hospital', label: '就诊医院', type: 'text' },
        { key: 'consultations', label: '就诊科室 / 专家', type: 'department-experts' },
        { key: 'visitDate', label: '服务日期', type: 'date' },
        { key: 'serviceTime', label: '具体时间', type: 'text', placeholder: '如：09:30 或 上午' },
        { key: 'staffId', label: '就医专员', type: 'staff-select' },
      ],
    },
    logistics: {
      name: '住宿交通', icon: '🚗',
      fields: [
        { key: 'hotel', label: '住宿安排', type: 'textarea' },
        { key: 'transport', label: '交通安排', type: 'textarea' },
      ],
    },
    tasks: {
      name: '本次代办目的', icon: '✅', multi: true, summaryKey: 'task', summaryLabel: '目的',
      description: '一条只写一个可验收结果，明确科室/专家及要开具、预约或领取的具体项目；背景和注意事项不要写在这里。',
      fields: [
        { key: 'task', label: '具体目的', type: 'textarea', rows: 2, placeholder: '如：请妇科王医生开具盆腔MRI检查单' },
        { key: 'notes', label: '备注', type: 'textarea', internal: true },
      ],
    },
    notes: {
      name: '注意事项', icon: '📌',
      fields: [{ key: 'content', label: '注意事项', type: 'textarea' }],
    },
  },
}

const TITLE_BY_TYPE = { nutrition: '营养干预方案', medical_assist: '就医协助方案' }
const AI_GENERATE_LABEL_BY_TYPE = { nutrition: 'AI膳食信息草稿', medical_assist: 'AI就医协助方案' }

function isCheckupMedicalAssist(content = {}, planTitle = '') {
  const serviceDomain = content.serviceDomain || content.templateSnapshot?.serviceDomain || ''
  if (serviceDomain === 'annual_checkup') return true
  // 兼容模板分类字段上线前已经生成的存量体检方案。这些方案没有 serviceDomain，
  // 但模板名和方案标题仍能明确识别，不应继续展示“就诊医院/科室”等门诊字段。
  return /体检/.test(`${content.templateName || ''} ${planTitle || ''}`)
}

function medicalAssistModuleDefs(content = {}, planTitle = '', assignedReviewerId = '') {
  if (!isCheckupMedicalAssist(content, planTitle)) return MODULE_DEFS_BY_TYPE.medical_assist
  const { tasks: _legacyTasks, ...checkupBaseModules } = MODULE_DEFS_BY_TYPE.medical_assist
  return {
    ...checkupBaseModules,
    visit: {
      name: '体检安排', icon: '🩺',
      fields: [
        { key: 'hospital', label: '体检机构/体检中心', type: 'text' },
        { key: 'department', label: '承接部门/专项检查科室', type: 'text' },
        { key: 'reviewerId', label: '方案审核医生（健康顾问）', type: 'staff-select', roles: ['familyDoctor'], disabled: !!assignedReviewerId },
        { key: 'visitDate', label: '体检日期', type: 'date' },
        { key: 'serviceTime', label: '集合/签到时间', type: 'text', placeholder: '如：08:00前或上午' },
        { key: 'bookingPlannerId', label: '体检预约负责人（健康规划师）', type: 'staff-select', roles: ['healthPlanner'] },
        { key: 'escortStaffId', label: '陪同人员', type: 'staff-select', roles: ['medicalAssistant'] },
      ],
    },
  }
}

function splitVisitEntries(value = '') {
  const result = []
  let current = ''
  let depth = 0
  for (const char of String(value)) {
    if ('（(['.includes(char)) depth += 1
    if ('）)]'.includes(char)) depth = Math.max(0, depth - 1)
    if (depth === 0 && '、,，;；'.includes(char)) {
      if (current.trim()) result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) result.push(current.trim())
  return result
}

function medicalAssistModuleData(content = {}) {
  const existing = content.moduleData || {}
  const existingConsultations = existing.visit?.consultations || content.consultations
  const legacyDepartments = splitVisitEntries(existing.visit?.department || content.department || '')
  const legacyExperts = splitVisitEntries(existing.visit?.expert || content.expert || '')
  const consultations = Array.isArray(existingConsultations) && existingConsultations.length
    ? existingConsultations
    : (legacyDepartments.length || legacyExperts.length)
      ? Array.from({ length: Math.max(legacyDepartments.length, legacyExperts.length) }, (_, index) => ({
          department: legacyDepartments[index] || '',
          expert: legacyExperts[index] || '',
        }))
      : []
  const taskRecords = existing.tasks?.records?.length
    ? existing.tasks.records
    : String(content.tasks || '')
        .split(/\r?\n/)
        .map(task => task.replace(/^\s*\d+[.、]\s*/, '').trim())
        .filter(Boolean)
        .map(task => ({ task, staff: content.staffId || '', notes: '' }))

  return {
    ...existing,
    visit: {
      ...(existing.visit || {}),
      hospital: existing.visit?.hospital || content.hospital || '',
      consultations,
      department: existing.visit?.department || content.department || '',
      expert: existing.visit?.expert || content.expert || '',
      reviewerId: existing.visit?.reviewerId || content.reviewerId || '',
      visitDate: existing.visit?.visitDate || content.serviceDate || '',
      serviceTime: existing.visit?.serviceTime || content.serviceTime || '',
      staffId: existing.visit?.staffId || content.staffId || '',
      bookingPlannerId: existing.visit?.bookingPlannerId || content.bookingPlannerId || existing.visit?.staffId || content.staffId || '',
      escortStaffId: existing.visit?.escortStaffId || content.escortStaffId || '',
      supervisorId: existing.visit?.supervisorId || content.supervisorId || '',
      followUpPlanId: existing.visit?.followUpPlanId || content.followUpPlanId || '',
      followUpPlans: existing.visit?.followUpPlans?.length ? existing.visit.followUpPlans : (content.followUpPlans || []),
    },
    logistics: {
      ...(existing.logistics || {}),
      hotel: existing.logistics?.hotel || content.hotel || '',
      transport: existing.logistics?.transport || content.transport || '',
    },
    tasks: {
      ...(existing.tasks || {}),
      records: taskRecords,
    },
    notes: {
      ...(existing.notes || {}),
      content: existing.notes?.content || content.notes || '',
    },
  }
}

function contentFromModules(plan, moduleData, goal, staffList = []) {
  const content = { ...(plan.content || {}), moduleData, goal }
  if (plan.type !== 'medical_assist') return content

  if (isCheckupMedicalAssist(content, plan.title)) {
    // 存量方案保存一次后补齐正式分类，后续不再依赖标题兼容判断。
    content.serviceDomain = 'annual_checkup'
  }

  const visit = moduleData.visit || {}
  const logistics = moduleData.logistics || {}
  const records = moduleData.tasks?.records || []
  const consultations = (Array.isArray(visit.consultations) ? visit.consultations : [])
    .map(item => ({ department: String(item?.department || '').trim(), expert: String(item?.expert || '').trim() }))
    .filter(item => item.department || item.expert)
  const selectedAssistantId = visit.staffId || content.staffId || records.find(r => r.staff)?.staff || ''
  const checkupService = isCheckupMedicalAssist(content, plan.title)

  return {
    ...content,
    hospital: visit.hospital || '',
    consultations,
    // 旧版展示及任务生成仍读取 department/expert；结构化配对关系保存在 consultations。
    department: consultations.map(item => item.department).filter(Boolean).join('、'),
    expert: consultations.map(item => item.expert).filter(Boolean).join('、'),
    reviewerId: visit.reviewerId || '',
    reviewerName: staffList.find(s => String(s._id) === String(visit.reviewerId || ''))?.name || content.reviewerName || '',
    serviceDate: visit.visitDate || '',
    serviceTime: visit.serviceTime || content.serviceTime || '',
    staffId: checkupService ? (visit.bookingPlannerId || '') : selectedAssistantId,
    bookingPlannerId: checkupService ? (visit.bookingPlannerId || '') : (content.bookingPlannerId || ''),
    escortStaffId: checkupService ? (visit.escortStaffId || '') : (content.escortStaffId || ''),
    supervisorId: checkupService ? '' : (visit.supervisorId || content.supervisorId || ''),
    followUpPlanId: visit.followUpPlanId || content.followUpPlanId || '',
    followUpPlans: visit.followUpPlans?.length ? visit.followUpPlans : (content.followUpPlans || []),
    hotel: logistics.hotel || '',
    transport: logistics.transport || '',
    tasks: records.map(r => r.task).filter(Boolean).join('\n'),
    notes: moduleData.notes?.content || '',
  }
}

function CheckupServiceWorkspace({ plan, moduleData, onOpenPatient }) {
  const content = plan.content || {}
  const questionnaire = plan.checkupQuestionnaire || {}
  const questionnaireAnswers = questionnaire.answers || []
  const coreNeeds = questionnaireAnswers.filter(item => item.coreNeed)
  const archiveChanges = questionnaireAnswers.filter(item => item.archiveField && item.changed)
  const otherAnswers = questionnaireAnswers.filter(item => !item.coreNeed && !item.archiveField)
  const formatAnswer = value => {
    if (Array.isArray(value)) return value.join('、')
    if (value && typeof value === 'object') {
      const selected = Array.isArray(value.values) ? value.values.join('、') : (value.value || '')
      const inputs = Object.entries(value.inputs || {}).map(([key, text]) => `${key}：${text}`).join('；')
      return [selected, inputs].filter(Boolean).join('（') + (selected && inputs ? '）' : '')
    }
    return String(value ?? '')
  }
  const year = plan.year || new Date(plan.createdAt || Date.now()).getFullYear()
  const serviceMode = /一站式/.test(`${content.templateName || ''} ${plan.title || ''}`) ? '体检一站式服务' : '单独体检服务'
  const intake = content.checkupIntake || {}
  const questionnaireState = intake.submittedAt ? '已填写' : intake.questionnaireId ? '待客户填写' : '待关联'
  const reviewerName = content.reviewerName || plan.patientId?.assignedFamilyDoctor?.name || '客户所属健康顾问'
  const bookingName = content.bookingPlannerName || '已选健康规划师'
  const escortName = content.escortStaffName || '已选陪同人员'
  const steps = [
    { name: '体检定制问卷', owner: '客户', state: questionnaireState },
    { name: '定制体检方案', owner: reviewerName, state: intake.submittedAt ? '待处理' : '等待问卷' },
    { name: '预约与行前确认', owner: bookingName, state: plan.pushedAt ? '已下发' : '等待方案' },
    { name: '现场陪同', owner: escortName, state: '等待预约' },
    { name: '报告回收与审核', owner: '健管专员', state: '等待体检完成' },
  ]
  const card = { background: '#fff', border: '1px solid #E0D9CE', borderRadius: 14, padding: 18 }
  const muted = { color: '#789087', fontSize: 12, lineHeight: 1.7 }

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ ...card, padding: 0, overflow: 'hidden', borderColor: '#CFE2D9' }}>
        <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg,#EDF7F2 0%,#F8F4EA 100%)', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: '#1E6B50', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 26 }}>🩺</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 20, fontWeight: 750, color: '#173B2E' }}>{year}年度体检服务档案</div>
            <div style={{ marginTop: 5, color: '#5E786D', fontSize: 13 }}>{plan.patientId?.name || '会员'} · {serviceMode} · 每年独立留档，可与历年方案和报告连续对照</div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenPatient}>查看健康档案与历年体检</button>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto', padding: '12px 18px', gap: 8 }}>
          {steps.map((step, index) => <div key={step.name} style={{ minWidth: 155, flex: 1, padding: '8px 10px', borderRadius: 9, background: index === 1 ? '#FFF8E8' : '#F8FAF9', border: `1px solid ${index === 1 ? '#EACB88' : '#E1EAE5'}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A2B24' }}>{index + 1}. {step.name}</div>
            <div style={{ fontSize: 11, color: step.state === '已填写' ? '#16835D' : '#7B725F', marginTop: 3 }}>{step.state} · {step.owner}</div>
          </div>)}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div><div style={{ fontWeight: 700, color: '#1A2B24' }}>本次体检需求</div><div style={muted}>只属于本年度、本次订单，不直接覆盖长期健康档案</div></div>
            <span style={{ fontSize: 12, color: '#1E6B50', background: '#EAF5F0', borderRadius: 20, padding: '4px 9px' }}>{serviceMode}</span>
          </div>
          {coreNeeds.length > 0 ? <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {coreNeeds.map(item => <div key={item.questionId} style={{ padding: 12, borderRadius: 10, background: '#F0F8F4', border: '1px solid #D6EADF' }}>
              <div style={{ fontSize: 12, color: '#638174' }}>{item.questionText}</div>
              <div style={{ marginTop: 5, color: '#173B2E', fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>{formatAnswer(item.answer)}</div>
            </div>)}
          </div> : <div style={{ marginTop: 12, padding: 13, borderRadius: 10, background: '#F8FAF9', color: '#334A40', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{plan.description || content.goal || '尚未填写本次体检需求'}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {[content.hospital && `机构：${content.hospital}`, content.serviceDate && `体检日期：${content.serviceDate}`, content.serviceTime && `时间：${content.serviceTime}`].filter(Boolean).map(text => <span key={text} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, background: '#F6F1E8', color: '#6F5B35' }}>{text}</span>)}
          </div>
        </div>

      </div>

      {questionnaireAnswers.length > 0 && <details style={{ ...card, marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', color: '#29483C', fontSize: 13, fontWeight: 700 }}>
          查看问卷与档案差异（{questionnaireAnswers.length}项{archiveChanges.length ? `，${archiveChanges.length}项变化待核对` : ''}）
        </summary>
        <div style={{ marginTop: 8, ...muted }}>仅供核对，默认不展开；基础档案不会被本次问卷自动覆盖。</div>
        {archiveChanges.length > 0 ? <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 9 }}>
          {archiveChanges.map(item => <div key={item.questionId} style={{ padding: 11, borderRadius: 9, background: item.confirmed ? '#F0F8F4' : '#FFF9EF', border: `1px solid ${item.confirmed ? '#CDE5D8' : '#F2D9A6'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 13, color: '#29483C' }}>{item.questionText}</strong><span style={{ fontSize: 11, color: item.confirmed ? '#16835D' : '#A36800' }}>{item.confirmed ? '已确认记录' : '待人工确认'}</span></div>
            <div style={{ marginTop: 7, fontSize: 12, color: '#6E8178' }}>基础档案：{item.baselineValue || '未填写'}</div>
            <div style={{ marginTop: 3, fontSize: 13, color: '#173B2E', fontWeight: 650 }}>本次问卷：{item.normalizedValue || formatAnswer(item.answer)}</div>
          </div>)}
        </div> : <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: '#F7FAF8', color: '#638174', fontSize: 12 }}>本次问卷未发现需要人工确认的档案变化。</div>}
        {otherAnswers.length > 0 && <details style={{ marginTop: 12, borderTop: '1px solid #E5EAE7', paddingTop: 10 }}>
          <summary style={{ cursor: 'pointer', color: '#4A6558', fontSize: 13, fontWeight: 650 }}>查看其余本次问答（{otherAnswers.length}项）</summary>
          <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {otherAnswers.map(item => <div key={item.questionId} style={{ padding: '8px 10px', borderRadius: 8, background: '#F8FAF9', fontSize: 12 }}><span style={{ color: '#789087' }}>{item.questionText}：</span><strong style={{ color: '#31493E' }}>{formatAnswer(item.answer)}</strong></div>)}
          </div>
        </details>}
      </details>}
    </div>
  )
}

export default function PlanModulesPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { staff } = useStaff()

  const [plan, setPlan] = useState(null)
  const [moduleData, setModuleData] = useState({})
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [regeneratingPurposes, setRegeneratingPurposes] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [followUpPlans, setFollowUpPlans] = useState([])
  const [followUpPlanSearch, setFollowUpPlanSearch] = useState('')
  const [supervisorSearch, setSupervisorSearch] = useState('')

  useEffect(() => {
    Promise.all([staffAPI.getStaffList(), staffAPI.getFollowUpPlans()])
      .then(([staffRes, planRes]) => { setStaffList(staffRes.data || []); setFollowUpPlans(planRes.data || []) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    staffAPI.getPlan(id)
      .then(res => {
        const p = res.data
        setPlan(p)
        const c = p.content || {}
        const nextModuleData = p.type === 'medical_assist' ? medicalAssistModuleData(c) : (c.moduleData || {})
        const assignedReviewerId = p.patientId?.assignedFamilyDoctor?._id || p.patientId?.assignedFamilyDoctor || ''
        if (p.type === 'medical_assist' && isCheckupMedicalAssist(c, p.title) && assignedReviewerId && !nextModuleData.visit?.reviewerId) {
          nextModuleData.visit = { ...(nextModuleData.visit || {}), reviewerId: assignedReviewerId }
        }
        setModuleData(nextModuleData)
        setGoal(c.goal || p.description || '')
        setDirty(false)
      })
      .catch(err => toast(err.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    const selectedId = moduleData.visit?.supervisorId
    if (!selectedId) return
    const selected = staffList.find(item => String(item._id) === String(selectedId))
    if (selected) setSupervisorSearch(`${selected.name} · ${selected.roleLabel || selected.role}`)
  }, [moduleData.visit?.supervisorId, staffList])

  const canEdit = !!plan?.canManage
  const canDelete = !!plan?.canDelete

  const handleModuleChange = useCallback((moduleKey, fieldKey, value) => {
    setModuleData(prev => ({
      ...prev,
      [moduleKey]: { ...(prev[moduleKey] || {}), [fieldKey]: value },
    }))
    setDirty(true)
  }, [])

  const handleSave = async () => {
    if (plan.type === 'medical_assist') {
      const visit = moduleData.visit || {}
      const checkupService = isCheckupMedicalAssist(plan.content || {}, plan.title)
      if (!visit.visitDate) { toast('请选择服务日期'); return }
      if (checkupService && !visit.bookingPlannerId) { toast('请选择体检预约负责人（健康规划师）'); return }
      if (checkupService && !visit.escortStaffId) { toast('请选择陪同人员'); return }
      if (!checkupService && !visit.staffId) { toast('请选择就医专员'); return }
      if (checkupService && !visit.reviewerId) { toast('客户尚未归属健康顾问，请先选择方案审核医生'); return }
      if (!checkupService && !visit.supervisorId) { toast('请选择督办人'); return }
      if (!checkupService && !(moduleData.tasks?.records || []).some(item => item.task?.trim())) { toast('请至少填写一条明确、可验收的本次代办目的'); return }
      if (!(visit.followUpPlans?.length || visit.followUpPlanId)) { toast('该服务尚未配置标准岗位任务，请先在 Admin 服务流程中配置'); return }
    }
    setSaving(true)
    try {
      const content = contentFromModules(plan, moduleData, goal, staffList)
      await staffAPI.updatePlan(id, { content, description: goal })
      setPlan(p => ({ ...p, content, description: goal }))
      toast('方案已保存')
      setDirty(false)
    } catch (err) {
      toast(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRegeneratePurposes = async () => {
    if (dirty) { toast('请先保存当前修改，再重新生成代办目的'); return }
    if (!window.confirm(plan.pushedAt
      ? '将重新整理“本次代办目的”并同步到尚未开始的执行、督办任务；医院、人员和服务时间不会改变。是否继续？'
      : '仅重新整理“本次代办目的”，医院、人员和服务时间不会改变。是否继续？')) return
    setRegeneratingPurposes(true)
    try {
      const res = await staffAPI.regenerateMedicalAssistPurposes(id)
      const nextPlan = res.data
      setPlan(prev => ({ ...prev, ...nextPlan }))
      setModuleData(medicalAssistModuleData(nextPlan.content || {}))
      setDirty(false)
      toast(`已重新生成 ${res.purposes?.length || 0} 条简洁目的，请核对`)
    } catch (err) {
      toast(err.message || '重新生成失败')
    } finally {
      setRegeneratingPurposes(false)
    }
  }

  const handlePush = async () => {
    if (dirty) { toast('有未保存的更改，请先保存再推送'); return }
    const pendingReview = plan.content?.aiStatus === 'pending'
    if (!window.confirm(pendingReview
      ? '确认已完整核对本方案？审核通过后将立即推送给客户，并按 Admin 标准生成岗位任务。'
      : '确定将此方案推送给客户？客户端将立即可见。')) return
    setPushing(true)
    try {
      if (pendingReview) {
        const approvedContent = { ...(plan.content || {}), aiStatus: 'adopted' }
        const reviewed = await staffAPI.updatePlan(id, { content: approvedContent })
        setPlan(p => ({ ...p, content: reviewed.data?.content || { ...approvedContent, aiStatus: 'approved' } }))
      }
      const res = await staffAPI.pushPlan(id)
      setPlan(p => ({ ...p, content: res.data?.content || p.content, pushedAt: res.data?.pushedAt || new Date().toISOString(), status: 'active' }))
      toast(pendingReview ? '方案已审核推送，岗位任务已生成' : '方案已推送给客户')
    } catch (err) {
      toast(err.message || '推送失败')
    } finally {
      setPushing(false)
    }
  }

  const handleDelete = async () => {
    const reason = window.prompt('请输入删除原因（例如：模板类型选择错误）')
    if (reason === null) return
    if (!reason.trim()) { toast('必须填写删除原因'); return }
    if (!window.confirm('确定删除此方案？该方案自动生成且尚未完成的随访计划也会一并删除。')) return
    try {
      const res = await staffAPI.deletePlan(id, reason.trim())
      toast(res.relatedFollowUpsDeleted ? `方案已删除，同时删除 ${res.relatedFollowUpsDeleted} 条未完成随访计划` : '方案已删除')
      nav('/plans?type=' + plan.type)
    } catch (err) { toast(err.message || '删除失败') }
  }

  const handleModuleDecision = async (item, decision) => {
    const evidence = window.prompt(decision === 'needed' ? '请填写启动该节点的依据' : decision === 'not_needed' ? '请填写跳过该节点的依据' : '请记录仍需确认的信息', item.evidence || '')
    if (evidence === null) return
    try {
      const res = await staffAPI.decideWorkflowModule(id, item.id || item._id, { decision, evidence })
      setPlan(prev => ({ ...prev, content: { ...(prev.content || {}), workflowModuleDecisions: (prev.content?.workflowModuleDecisions || []).map(old => String(old.id || old._id) === String(item.id || item._id) ? res.data : old) } }))
      toast(res.message)
    } catch (err) { toast(err.message || '审核失败') }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>加载中...</div>
  if (!plan) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>方案不存在</div>

  const moduleDefs = plan.type === 'medical_assist'
    ? medicalAssistModuleDefs(plan.content || {}, plan.title, plan.patientId?.assignedFamilyDoctor?._id || plan.patientId?.assignedFamilyDoctor || '')
    : (MODULE_DEFS_BY_TYPE[plan.type] || {})
  const moduleKeys = Object.keys(moduleDefs)
  const isCheckupService = plan.type === 'medical_assist'
    && isCheckupMedicalAssist(plan.content || {}, plan.title)
  const title = isCheckupService ? '体检服务方案' : (TITLE_BY_TYPE[plan.type] || plan.title)
  const aiLabel = AI_GENERATE_LABEL_BY_TYPE[plan.type] || 'AI生成'
  const normalizedPlanSearch = followUpPlanSearch.trim().toLowerCase()
  const searchableFollowUpPlans = normalizedPlanSearch
    ? followUpPlans.filter(item => `${item.name || ''} ${item.executorRole || ''} ${item.supervisorRole || ''}`.toLowerCase().includes(normalizedPlanSearch))
    : followUpPlans
  const supervisors = staffList.filter(item => ['healthManager', 'familyDoctor', 'superadmin'].includes(item.role))
  const handleBack = () => {
    if (location.state?.returnTo) {
      nav(location.state.returnTo)
      return
    }
    if (location.key && location.key !== 'default') {
      nav(-1)
      return
    }
    nav('/plans?type=' + plan.type)
  }

  return (
    <StaffListContext.Provider value={staffList}>
    <div style={{ maxWidth: isCheckupService ? 1180 : 860, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={handleBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#4A6558', padding: 4 }}
        >←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2B24' }}>{title}</div>
          <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 2 }}>{plan.patientId?.name || '会员'} · {plan.title}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {plan.pushedAt && !dirty && (
            <span style={{ fontSize: 12, color: '#22A06B', background: '#E8F5EF', padding: '4px 10px', borderRadius: 20 }}>
              ✓ 已推送 {new Date(plan.pushedAt).toLocaleDateString('zh-CN')}
            </span>
          )}
          {dirty && <span style={{ fontSize: 12, color: '#D97706', background: '#FEF9EC', padding: '4px 8px', borderRadius: 20 }}>有未保存更改</span>}
          {canEdit && plan.type === 'medical_assist' && !isCheckupService && (
            <button
              onClick={handleRegeneratePurposes}
              disabled={regeneratingPurposes || dirty}
              title={dirty ? '请先保存当前修改' : '仅重写本次代办目的'}
              style={{ background: '#fff', color: '#1E6B50', border: '1px solid #9FD8C1', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, opacity: (regeneratingPurposes || dirty) ? 0.5 : 1 }}
            >{regeneratingPurposes ? '重新生成中…' : 'AI重新生成代办目的'}</button>
          )}
          {canDelete && <button onClick={handleDelete} style={{ background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>删除方案</button>}
          {canEdit && (
            <button
              onClick={handlePush}
              disabled={pushing || dirty}
              title={dirty ? '请先保存更改，再推送给客户' : ''}
              style={{ background: '#0077B6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (pushing || dirty) ? 0.5 : 1 }}
            >
              {pushing ? '推送中...' : plan.content?.aiStatus === 'pending' ? '审核通过并推送' : plan.pushedAt ? '重新推送' : '推送给客户'}
            </button>
          )}
        </div>
      </div>

      {isCheckupService && <CheckupServiceWorkspace plan={plan} moduleData={moduleData} onOpenPatient={() => nav(`/patients/${plan.patientId?._id}`)} />}

      {/* 体检订单的核心需求已在上方展示，避免健康规划师重复维护“服务目标”。 */}
      {!isCheckupService && <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #E0D9CE' }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 10 }}>{plan.type === 'medical_assist' ? '本次代办总目标（简述）' : '服务目标'}</div>
        <textarea
          className="form-input"
          rows={2}
          placeholder={plan.type === 'medical_assist' ? '用一句话说明本次代办要解决什么问题' : '如：控制血糖、三个月内减重5公斤——AI生成方案时会参考这里的目标'}
          value={goal}
          onChange={e => { setGoal(e.target.value); setDirty(true) }}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>}

      {/* 板块列表 */}
      {plan.type === 'medical_assist' && !isCheckupService && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #E0D9CE' }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 4 }}>岗位任务流转</div>
          <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 14 }}>{isCheckupService ? '岗位、时间和完成标准由 Admin 统一配置；预约负责人和陪同人员在下方体检安排中指定。' : '执行人完成就医安排；督办人核对结果并推动客户整体方案闭环。'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: isCheckupService ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">标准岗位任务</label>
              {(moduleData.visit?.followUpPlans?.length || plan.content?.followUpPlans?.length) ? (
                <div className="form-input" style={{ minHeight: 38, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {(moduleData.visit?.followUpPlans?.length ? moduleData.visit.followUpPlans : plan.content.followUpPlans).map(item => {
                    const linked = followUpPlans.find(p => String(p._id) === String(item.id || item._id || ''))
                    const roleLabels = { familyDoctor: '健康顾问', healthPlanner: '健康规划师', medicalAssistant: '就医专员', healthManager: '健管专员', nutritionist: '营养师' }
                    return <span key={item.id || item._id} style={{ padding: '3px 8px', borderRadius: 12, background: '#E8F5EF', color: '#1E6B50', fontSize: 12 }}>{item.name}{linked?.executorRole ? ` · ${roleLabels[linked.executorRole] || linked.executorRole}执行` : ''}</span>
                  })}
                </div>
              ) : (
                <>
                  <input className="form-input" value={followUpPlanSearch} onChange={e => setFollowUpPlanSearch(e.target.value)} placeholder="搜索任务类型/方案名称" style={{ marginBottom: 6 }} />
                  <select className="form-input" value={moduleData.visit?.followUpPlanId || plan.content?.followUpPlanId || ''} onChange={e => handleModuleChange('visit', 'followUpPlanId', e.target.value)}><option value="">请选择任务方案</option>{searchableFollowUpPlans.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select>
                </>
              )}
            </div>
            {!isCheckupService && <div>
              <label className="form-label">督办人 *</label>
              <input
                className="form-input"
                list="medical-assist-supervisors"
                value={supervisorSearch}
                onChange={e => {
                  const value = e.target.value
                  setSupervisorSearch(value)
                  const selected = supervisors.find(item => value === `${item.name} · ${item.roleLabel || item.role}`)
                  handleModuleChange('visit', 'supervisorId', selected?._id || '')
                }}
                placeholder="输入姓名、岗位后选择"
              />
              <datalist id="medical-assist-supervisors">{supervisors.map(s => <option key={s._id} value={`${s.name} · ${s.roleLabel || s.role}`}>{s.department || s.title || ''}</option>)}</datalist>
            </div>}
          </div>
        </div>
      )}
      {plan.type === 'medical_assist' && !!plan.content?.workflowModuleDecisions?.length && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #E0D9CE' }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 4 }}>按需节点审核</div>
          <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 14 }}>AI只整理依据；对应岗位审核“需要／不需要”，系统再生成或跳过任务。</div>
          <div style={{ display: 'grid', gap: 10 }}>{plan.content.workflowModuleDecisions.map(item => {
            const reviewerRole = item.reviewerRole || (item.trigger === 'exam_order_found' ? 'healthPlanner' : 'familyDoctor')
            const roleName = reviewerRole === 'familyDoctor' ? '健康顾问' : '健康规划师'
            const canReview = ['superadmin', reviewerRole].includes(staff?.role)
            return <div key={item.id || item._id} style={{ padding: 12, borderRadius: 10, background: '#F7FAF8', border: '1px solid #E3EAE6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{item.name || '按需服务节点'}</strong><span style={{ fontSize: 12, color: '#6B7D74' }}>{roleName}审核</span></div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#6B7D74' }}>当前：{item.decision === 'needed' ? '需要' : item.decision === 'not_needed' ? '不需要' : '待确认'}{item.aiSuggestion ? ` · AI建议：${item.aiSuggestion === 'needed' ? '需要' : item.aiSuggestion === 'not_needed' ? '不需要' : '信息不足'}` : ''}</div>
              {item.evidence && <div style={{ marginTop: 5, fontSize: 12, color: '#4A6558' }}>依据：{item.evidence}</div>}
              {canReview && <div style={{ display: 'flex', gap: 7, marginTop: 9 }}><button className="btn btn-primary btn-sm" onClick={() => handleModuleDecision(item, 'needed')}>需要，生成任务</button><button className="btn btn-secondary btn-sm" onClick={() => handleModuleDecision(item, 'not_needed')}>不需要，跳过</button><button className="btn btn-secondary btn-sm" onClick={() => handleModuleDecision(item, 'uncertain')}>信息不足</button></div>}
            </div>
          })}</div>
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24' }}>{isCheckupService ? '填写体检安排' : '方案板块'}</div>
          <div style={{ fontSize: 12, color: '#8AA89C' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E6B50', display: 'inline-block' }} />
              绿点表示已填写内容
            </span>
          </div>
        </div>
        {moduleKeys.map(mKey => (
          <ModulePanel
            key={mKey}
            moduleKey={mKey}
            def={moduleDefs[mKey]}
            data={moduleData[mKey] || {}}
            onChange={handleModuleChange}
          />
        ))}
      </div>

      {/* 底部保存 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        {canEdit && (
          <button onClick={handleDelete} style={{ background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            删除方案
          </button>
        )}
        <button
          onClick={handleBack}
          style={{ background: '#fff', color: '#666', border: '1px solid #ddd', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
        >
          返回上一页
        </button>
        {canEdit && (
          <button
            onClick={handlePush}
            disabled={pushing || dirty}
            style={{ background: '#0077B6', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (pushing || dirty) ? 0.5 : 1 }}
          >
            {pushing ? '推送中...' : plan.content?.aiStatus === 'pending' ? '审核通过并推送' : '推送给客户'}
          </button>
        )}
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: '#1E6B50', color: '#fff', border: 'none', padding: '10px 28px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? '保存中...' : '保存方案'}
          </button>
        )}
      </div>
    </div>
    </StaffListContext.Provider>
  )
}
