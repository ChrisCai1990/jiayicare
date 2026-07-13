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
  // 年度管理方案只归家庭医生负责：营养师等其他角色可以查看方案内容，但不该看到能编辑/推送的入口
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
  const [notes, setNotes]           = useState('') // 服务目标：AnnualPlan.notes 字段，AI生成方案时会参考
  const [staffList, setStaffList]   = useState([])

  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data || [])).catch(() => {})
  }, [])

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
          setModuleData(target.moduleData || {})
          setNotes(target.notes || '')
          setPushedAt(target.pushedAt || null)
          setConfirmedAt(target.confirmedAt || null)
        } else if (queryPlanType) {
          // 该类型还没有任何已保存数据，选中类型但板块留空，等用户点AI生成
          setPlanType(queryPlanType)
          setModuleData({})
          setNotes('')
          setPushedAt(null)
          setConfirmedAt(null)
        } else {
          setPlanType('')
          setModuleData({})
          setNotes('')
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

  const handlePlanTypeChange = (key) => {
    // 旧流程（HealthPlan）只有一份数据，保持原行为
    if (!patientMode) { setPlanType(key); setDirty(true); return }
    if (key === planType) return
    if (dirty && !window.confirm('当前方案有未保存的更改，切换类型会丢失这些更改，确认切换？')) return
    // 加载该类型自己的数据（每个类型独立一份）
    const p = plansByType[key]
    setPlanType(key)
    setModuleData(p?.moduleData || {})
    setNotes(p?.notes || '')
    setPushedAt(p?.pushedAt || null)
    setConfirmedAt(p?.confirmedAt || null)
    setDirty(false)
  }

  const handleSave = async () => {
    if (!planType) { toast('请先选择方案类型'); return }
    setSaving(true)
    try {
      if (patientMode) {
        const res = await staffAPI.saveAnnualPlan(id, { planType, moduleData, notes, year })
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
        await staffAPI.updatePlan(id, { content: { planType, moduleData }, description: notes })
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
    const ptName = PLAN_TYPES.find(pt => pt.key === type)?.name || '该类型'
    if (!skipConfirm && !window.confirm(`AI将基于已审核的汇总分析，生成「${ptName}」对应的方案板块，现有内容将被覆盖，确认继续？`)) return
    setAiPlanLoading(true)
    try {
      const res = await staffAPI.generateAIAnnualPlan(id, type, notes)
      const aiData = res.data || {}
      // 只填充当前所选方案类型包含的板块，其余类型的板块忽略（一次只生成一个方案）
      const allowedKeys = PLAN_TYPE_MODULES[type] || []
      setModuleData(prev => {
        const merged = { ...prev }
        Object.entries(aiData).forEach(([key, val]) => {
          if (!allowedKeys.includes(key)) return
          if (val && (val.records?.length > 0 || val.enabled)) {
            merged[key] = val
          }
        })
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

  const currentModuleKeys = PLAN_TYPE_MODULES[planType] || []
  const patientName = patientMode ? (patient?.name || '会员') : (plan?.patientId?.name || '会员')
  const planTitle = patientMode ? '年度健康管理方案' : (plan?.title || '年度管理方案')
  const activePlanType = PLAN_TYPES.find(pt => pt.key === planType)
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
          {/* 年度管理方案只归家庭医生负责：营养师等其他角色可以查看，但不显示生成/推送这些编辑入口 */}
          {patientMode && canEdit && (
            <>
              <button
                onClick={handleGenerateAIAnnualPlan}
                disabled={aiPlanLoading || !patient?.aiHealthSummary?.sections}
                title={!patient?.aiHealthSummary?.sections ? '请先在AI分析及方案标签页生成AI健康分析' : 'AI自动填充方案板块'}
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
          {PLAN_TYPES.map(pt => (
            <div
              key={pt.key}
              onClick={() => handlePlanTypeChange(pt.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${planType === pt.key ? pt.color : '#E0D9CE'}`,
                background: planType === pt.key ? pt.bg : '#fff',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 22 }}>{pt.icon}</span>
              <div style={{ fontWeight: 600, fontSize: 14, color: planType === pt.key ? pt.color : '#1A2B24' }}>{pt.name}</div>
              {patientMode && plansByType[pt.key] && (
                <span style={{
                  marginLeft: planType === pt.key ? 8 : 'auto', fontSize: 11, fontWeight: 600,
                  color: plansByType[pt.key].pushedAt ? '#22A06B' : '#8AA89C',
                  background: plansByType[pt.key].pushedAt ? '#E8F5EF' : '#F2EDE3',
                  padding: '1px 7px', borderRadius: 10,
                }}>{plansByType[pt.key].pushedAt ? '已推送' : '已配置'}</span>
              )}
              {planType === pt.key && <span style={{ marginLeft: plansByType[pt.key] ? 6 : 'auto', color: pt.color, fontSize: 18 }}>✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 服务目标 */}
      {planType && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #E0D9CE' }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 10 }}>服务目标</div>
          <textarea
            rows={2}
            placeholder="如：控制血压平稳、减少并发症风险——AI生成方案时会参考这里的目标"
            value={notes}
            onChange={e => { setNotes(e.target.value); setDirty(true) }}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
      )}

      {/* 板块列表 */}
      {planType ? (
        <div style={{ marginBottom: 20 }}>
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
          {currentModuleKeys.map(mKey => (
            <ModulePanel
              key={mKey}
              moduleKey={mKey}
              def={MODULE_DEFS[mKey]}
              data={moduleData[mKey] || {}}
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
