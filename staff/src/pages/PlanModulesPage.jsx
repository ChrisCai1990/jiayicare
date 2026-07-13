import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'
import { StaffListContext, ModulePanel } from '../components/ModulePanel'

// 营养干预方案 / 就医协助方案的板块化编辑页（2026-07-13新增）。
// 之前这两类方案AI生成后只是扁平items+零散content字段，跟年度管理方案的"选模板→板块折叠面板→
// AI填充→保存/推送"完全不是一套呈现，用户要求三者体验统一。复用 AnnualMgmtPlanPage 抽出的
// ModulePanel 组件，但不需要"4类型选择"和"按年份"——这两类方案本身就是单一类型、一个患者可以
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
      name: '营养素补充', icon: '💊',
      fields: [{ key: 'content', label: '补充建议', type: 'textarea', placeholder: '营养素名称、剂量、用法' }],
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
        { key: 'department', label: '就诊科室', type: 'text' },
        { key: 'expert', label: '建议专家', type: 'text' },
        { key: 'visitDate', label: '就诊时间', type: 'date' },
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
      name: '执行任务', icon: '✅', multi: true, summaryKey: 'task', summaryLabel: '任务',
      fields: [
        { key: 'task', label: '任务内容', type: 'text' },
        { key: 'staff', label: '负责人', type: 'staff-select' },
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
const AI_GENERATE_LABEL_BY_TYPE = { nutrition: 'AI营养方案', medical_assist: 'AI就医协助方案' }

export default function PlanModulesPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { staff } = useStaff()

  const [plan, setPlan] = useState(null)
  const [moduleData, setModuleData] = useState({})
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [staffList, setStaffList] = useState([])

  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    staffAPI.getPlan(id)
      .then(res => {
        const p = res.data
        setPlan(p)
        const c = p.content || {}
        setModuleData(c.moduleData || {})
        setGoal(c.goal || p.description || '')
        setDirty(false)
      })
      .catch(err => toast(err.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [id])

  const canEdit = plan && ['nutritionist', 'medicalAssistant', 'superadmin'].includes(staff?.role)

  const handleModuleChange = useCallback((moduleKey, fieldKey, value) => {
    setModuleData(prev => ({
      ...prev,
      [moduleKey]: { ...(prev[moduleKey] || {}), [fieldKey]: value },
    }))
    setDirty(true)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await staffAPI.updatePlan(id, { content: { ...(plan.content || {}), moduleData, goal }, description: goal })
      toast('方案已保存')
      setDirty(false)
    } catch (err) {
      toast(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePush = async () => {
    if (dirty) { toast('有未保存的更改，请先保存再推送'); return }
    if (!window.confirm('确定将此方案推送给客户？客户端将立即可见。')) return
    setPushing(true)
    try {
      const res = await staffAPI.pushPlan(id)
      setPlan(p => ({ ...p, pushedAt: res.data?.pushedAt || new Date().toISOString(), status: 'active' }))
      toast('方案已推送给客户')
    } catch (err) {
      toast(err.message || '推送失败')
    } finally {
      setPushing(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>加载中...</div>
  if (!plan) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>方案不存在</div>

  const moduleDefs = MODULE_DEFS_BY_TYPE[plan.type] || {}
  const moduleKeys = Object.keys(moduleDefs)
  const title = TITLE_BY_TYPE[plan.type] || plan.title
  const aiLabel = AI_GENERATE_LABEL_BY_TYPE[plan.type] || 'AI生成'

  return (
    <StaffListContext.Provider value={staffList}>
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => nav('/plans?type=' + plan.type)}
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
        </div>
      </div>

      {/* 服务目标 */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #E0D9CE' }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 10 }}>服务目标</div>
        <textarea
          className="form-input"
          rows={2}
          placeholder="如：控制血糖、三个月内减重5公斤——AI生成方案时会参考这里的目标"
          value={goal}
          onChange={e => { setGoal(e.target.value); setDirty(true) }}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      {/* 板块列表 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24' }}>方案板块</div>
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
        <button
          onClick={() => nav('/plans?type=' + plan.type)}
          style={{ background: '#fff', color: '#666', border: '1px solid #ddd', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
        >
          返回方案列表
        </button>
        {canEdit && (
          <button
            onClick={handlePush}
            disabled={pushing || dirty}
            style={{ background: '#0077B6', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (pushing || dirty) ? 0.5 : 1 }}
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
            {saving ? '保存中...' : '保存方案'}
          </button>
        )}
      </div>
    </div>
    </StaffListContext.Provider>
  )
}
