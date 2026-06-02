import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

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
    name: '医疗问题解决', icon: '🏥',
    fields: [
      { key: 'visit_time',   label: '就医时间',   type: 'date' },
      { key: 'hospital',     label: '就医医院',   type: 'text', placeholder: '如：省人民医院' },
      { key: 'department',   label: '就诊科室',   type: 'text', placeholder: '如：心内科' },
      { key: 'expert',       label: '专家姓名',   type: 'text' },
      { key: 'reason',       label: '就医原因',   type: 'textarea' },
      { key: 'coordinator',  label: '协调专员',   type: 'text' },
      { key: 'notes',        label: '注意事项',   type: 'textarea', internal: true },
    ],
  },
  specialist_collab: {
    name: '全专联合会诊', icon: '👨‍⚕️',
    fields: [
      { key: 'plan_time',    label: '计划会诊时间', type: 'date' },
      { key: 'plan_method',  label: '计划会诊方式', type: 'text', placeholder: '如：线上/线下' },
      { key: 'hospital',     label: '会诊医院',     type: 'text' },
      { key: 'department',   label: '会诊科室',     type: 'text' },
      { key: 'expert',       label: '会诊专家',     type: 'text' },
      { key: 'purpose',      label: '会诊目的',     type: 'textarea' },
      { key: 'coordinator',  label: '协调专员',     type: 'text' },
      { key: 'notes',        label: '注意事项',     type: 'textarea', internal: true },
    ],
  },
  abnormal_followup: {
    name: '异常复查提醒', icon: '🔔',
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
      { key: 'coordinator',     label: '协调专员',       type: 'text' },
      { key: 'notes',           label: '注意事项',       type: 'textarea', internal: true },
    ],
  },
  vaccine: {
    name: '疫苗接种', icon: '💉',
    fields: [
      { key: 'name',        label: '疫苗名称', type: 'text' },
      { key: 'brand',       label: '品牌',     type: 'text' },
      { key: 'time',        label: '接种时间', type: 'date' },
      { key: 'reason',      label: '接种原因', type: 'textarea' },
      { key: 'institution', label: '接种机构', type: 'text' },
      { key: 'notes',       label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  monitoring: {
    name: '日常监测', icon: '📊',
    fields: [
      { key: 'items',     label: '监测项目', type: 'text' },
      { key: 'time',      label: '监测时间', type: 'text', placeholder: '如：每天早晨' },
      { key: 'purpose',   label: '监测目的', type: 'textarea' },
      { key: 'frequency', label: '监测频率', type: 'text', placeholder: '如：每日一次' },
      { key: 'notes',     label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  lifestyle: {
    name: '生活方式评估', icon: '🌿',
    fields: [
      { key: 'time',  label: '评估时间', type: 'date' },
      { key: 'focus', label: '评估重点', type: 'textarea' },
      { key: 'staff', label: '评估人员', type: 'text' },
      { key: 'notes', label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  medication: {
    name: '药物服用', icon: '💊',
    fields: [
      { key: 'chemical_name', label: '药品名称（化学名）', type: 'text' },
      { key: 'brand_name',    label: '商品名',     type: 'text' },
      { key: 'reason',        label: '服用原因',   type: 'textarea' },
      { key: 'dose',          label: '服用剂量',   type: 'text', placeholder: '如：10mg' },
      { key: 'frequency',     label: '服用频次',   type: 'text', placeholder: '如：每日一次' },
      { key: 'duration',      label: '服用时长',   type: 'text', placeholder: '如：3个月' },
      { key: 'notes',         label: '注意事项',   type: 'textarea', internal: true },
    ],
  },
  nutrition_supplement: {
    name: '营养素补充', icon: '🥗',
    fields: [
      { key: 'name',      label: '营养素名称', type: 'text' },
      { key: 'brand',     label: '品牌',       type: 'text' },
      { key: 'reason',    label: '服用原因',   type: 'textarea' },
      { key: 'dose',      label: '服用剂量',   type: 'text' },
      { key: 'frequency', label: '服用频次',   type: 'text' },
      { key: 'duration',  label: '服用时长',   type: 'text' },
      { key: 'notes',     label: '注意事项',   type: 'textarea', internal: true },
    ],
  },
  annual_checkup: {
    name: '年度体检', icon: '🔬',
    fields: [
      { key: 'date',        label: '计划体检日期', type: 'date' },
      { key: 'institution', label: '计划体检机构', type: 'text' },
      { key: 'focus',       label: '重点关注',     type: 'textarea' },
      { key: 'escort',      label: '是否提供陪检服务', type: 'yesno' },
    ],
  },
  functional_medicine: {
    name: '功能医学检测', icon: '🧪',
    fields: [
      { key: 'items',       label: '检测项目', type: 'text' },
      { key: 'institution', label: '检测机构', type: 'text' },
      { key: 'reason',      label: '检测原因', type: 'textarea' },
      { key: 'time',        label: '检测时间', type: 'date' },
      { key: 'notes',       label: '注意事项', type: 'textarea', internal: true },
    ],
  },
  quarterly_eval: {
    name: '季度评估', icon: '📋',
    fields: [
      { key: 'body_composition', label: '人体成分测量',   type: 'yesno' },
      { key: 'diet_analysis',    label: '膳食调研及分析', type: 'yesno' },
    ],
  },
}

// ── 各方案类型包含的板块（按顺序）──────────────────────────────────
const PLAN_TYPE_MODULES = {
  health_reshape:    ['medical_treatment', 'specialist_collab', 'abnormal_followup', 'vaccine', 'monitoring', 'lifestyle', 'medication', 'nutrition_supplement', 'annual_checkup', 'quarterly_eval'],
  young_state:       ['abnormal_followup', 'vaccine', 'monitoring', 'functional_medicine', 'lifestyle', 'nutrition_supplement', 'annual_checkup', 'quarterly_eval'],
  chronic_stable:    ['abnormal_followup', 'vaccine', 'monitoring', 'lifestyle', 'nutrition_supplement', 'annual_checkup', 'quarterly_eval'],
  health_prevention: ['abnormal_followup', 'vaccine', 'monitoring', 'nutrition_supplement', 'annual_checkup'],
}

// ── 小组件 ────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div
      onClick={onChange ? () => onChange(!value) : undefined}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: value ? '#1E6B50' : '#ddd',
        position: 'relative', cursor: onChange ? 'pointer' : 'default',
        transition: 'background 0.2s', flexShrink: 0, display: 'inline-block',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

function FieldRow({ label, internal, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid #F5F2EC', gap: 12 }}>
      <span style={{ width: 140, flexShrink: 0, fontSize: 13, color: '#4A6558', paddingTop: 8, lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        {label}
        {internal && (
          <span style={{ fontSize: 10, background: '#FEF9EC', color: '#D97706', border: '1px solid #F6D860', borderRadius: 4, padding: '1px 4px', flexShrink: 0, marginTop: 1 }}>
            仅内部
          </span>
        )}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }

function FieldInput({ field, value, onChange }) {
  if (field.type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || `请填写${field.label}`}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
    )
  }
  if (field.type === 'date') {
    return (
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
    )
  }
  if (field.type === 'yesno') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6 }}>
        <Toggle value={!!value} onChange={onChange} />
        <span style={{ fontSize: 13, color: value ? '#1E6B50' : '#aaa' }}>{value ? '是' : '否'}</span>
      </div>
    )
  }
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || `请填写${field.label}`}
      style={inputStyle}
    />
  )
}

// ── 板块折叠面板 ───────────────────────────────────────────────────────
function ModulePanel({ moduleKey, data, onChange }) {
  const [open, setOpen] = useState(false)
  const def = MODULE_DEFS[moduleKey]
  const enabled = data.enabled !== false

  const set = (fieldKey, val) => onChange(moduleKey, fieldKey, val)

  // 判断是否有已填写的字段（用于显示小圆点提示）
  const hasContent = def.fields.some(f => f.key !== 'notes' && data[f.key] !== undefined && data[f.key] !== '' && data[f.key] !== false)

  return (
    <div style={{ border: '1px solid #E0D9CE', borderRadius: 12, marginBottom: 12, background: '#fff', overflow: 'hidden' }}>
      {/* 模块头 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', padding: '14px 18px',
          cursor: 'pointer', userSelect: 'none',
          background: open ? '#F9F6F0' : '#fff',
        }}
        onClick={() => setOpen(v => !v)}
      >
        <span style={{ fontSize: 20, marginRight: 10 }}>{def.icon}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: '#1A2B24', display: 'flex', alignItems: 'center', gap: 8 }}>
          {def.name}
          {hasContent && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E6B50', flexShrink: 0 }} title="已有内容" />}
        </span>
        <div style={{ marginRight: 14 }} onClick={e => { e.stopPropagation(); set('enabled', !enabled) }}>
          <Toggle value={enabled} onChange={() => set('enabled', !enabled)} />
        </div>
        <span style={{ color: '#aaa', fontSize: 13, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
      </div>

      {/* 板块内容 */}
      {open && (
        <div style={{ padding: '4px 18px 18px', borderTop: '1px solid #F0EDE7' }}>
          {!enabled ? (
            <div style={{ padding: '14px 0', color: '#aaa', fontSize: 13, textAlign: 'center' }}>此板块已停用，点击开关启用</div>
          ) : (
            def.fields.map(field => (
              <FieldRow key={field.key} label={field.label} internal={field.internal}>
                <FieldInput field={field} value={data[field.key]} onChange={val => set(field.key, val)} />
              </FieldRow>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────
export default function AnnualMgmtPlanPage() {
  const { id } = useParams()   // plan._id (HealthPlan)
  const nav = useNavigate()
  const toast = useToast()

  const [plan, setPlan]           = useState(null)
  const [planType, setPlanType]   = useState('')
  const [moduleData, setModuleData] = useState({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [dirty, setDirty]         = useState(false)

  // 加载方案
  useEffect(() => {
    setLoading(true)
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
  }, [id])

  const handleModuleChange = useCallback((moduleKey, fieldKey, value) => {
    setModuleData(prev => ({
      ...prev,
      [moduleKey]: { ...(prev[moduleKey] || {}), [fieldKey]: value },
    }))
    setDirty(true)
  }, [])

  const handlePlanTypeChange = (key) => {
    setPlanType(key)
    setDirty(true)
  }

  const handleSave = async () => {
    if (!planType) { toast('请先选择方案类型'); return }
    setSaving(true)
    try {
      await staffAPI.updatePlan(id, {
        content: { planType, moduleData },
      })
      toast('方案已保存')
      setDirty(false)
    } catch (err) {
      toast(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const currentModuleKeys = PLAN_TYPE_MODULES[planType] || []
  const patientName = plan?.patientId?.name || '会员'
  const planTitle = plan?.title || '年度管理方案'
  const activePlanType = PLAN_TYPES.find(pt => pt.key === planType)

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>加载中...</div>

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => nav('/plans?type=annual_mgmt')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#4A6558', padding: 4 }}
        >←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2B24' }}>{planTitle}</div>
          <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 2 }}>
            {patientName}
            {activePlanType && <span style={{ marginLeft: 8, color: activePlanType.color, fontWeight: 600 }}>{activePlanType.icon} {activePlanType.name}</span>}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {dirty && <span style={{ fontSize: 12, color: '#D97706', background: '#FEF9EC', padding: '4px 8px', borderRadius: 20 }}>有未保存更改</span>}
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
              {planType === pt.key && <span style={{ marginLeft: 'auto', color: pt.color, fontSize: 18 }}>✓</span>}
            </div>
          ))}
        </div>
      </div>

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
          onClick={() => nav('/plans?type=annual_mgmt')}
          style={{ background: '#fff', color: '#666', border: '1px solid #ddd', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
        >
          返回方案列表
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: '#1E6B50', color: '#fff', border: 'none', padding: '10px 28px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? '保存中...' : '保存年度管理方案'}
        </button>
      </div>
    </div>
  )
}
