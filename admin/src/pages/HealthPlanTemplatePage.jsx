import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'
import { useToast } from '../App'

const PLAN_TYPES = [
  { key: 'annual_checkup',    label: '年度体检方案',  icon: '🔬' },
  { key: 'health_management', label: '健康管理方案',  icon: '📋' },
  { key: 'nutrition',         label: '营养干预方案',  icon: '🥗' },
  { key: 'medical_assist',    label: '就医协助方案',  icon: '🏥' },
  { key: 'rehab',             label: '运动复健方案',  icon: '🏃' },
  { key: 'tcm',               label: '中医养生方案',  icon: '🍃' },
  { key: 'psychology',        label: '心理咨询方案',  icon: '🧠' },
]

// ── 各类型的默认 content 结构 ─────────────────────────────────
const defaultContent = {
  annual_checkup: {
    packageName: '', packageDesc: '',
    checkItems: [], // [{ type:'lab'|'exam', id, name }]
    addons: [],     // [{ type:'lab'|'exam', id, name, reason }]
  },
  health_management: {
    planType: '',
    planName: '',
    planDesc: '',
    followUpPlans: [],
  },
  nutrition: {
    dailyWater: '',
    breakfastTime: '', breakfast: '',
    lunchTime: '', lunch: '',
    dinnerTime: '', dinner: '',
    snackTime: '', snack: '',
    dietPrinciple: '', cookingMethod: '', mealOrder: '',
    nutritionSupplements: '', exerciseSuggestion: '', allowedFoods: '', forbiddenFoods: '',
  },
  medical_assist: {
    name: '', datetime: '', staffName: '', tasks: '',
    hospital: '', department: '', expert: '', hotel: '', transport: '', notes: '',
  },
  rehab: {
    goal: '', exercises: '', weeklyFreq: '', duration: '',
    precautions: '', progression: '',
  },
  tcm: {
    chineseMedicine: '', acupuncture: '', diet: '', lifestyle: '', other: '',
  },
  psychology: {
    frequency: '', sessionCount: '', duration: '', mode: '线上',
    homework: '', assessmentTools: '',
  },
}

// 随访方案选择器（从随访方案库选择）
function FollowUpPlanSelector({ value, onChange, allPlans, loading }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = Array.isArray(value) ? value : []

  const options = allPlans.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    !selected.some(s => s.id === p._id)
  )

  const add = (plan) => {
    onChange([...selected, { id: plan._id, name: plan.name }])
    setSearch('')
  }

  const remove = (idx) => onChange(selected.filter((_, i) => i !== idx))

  return (
    <div className="form-group" style={{ gridColumn: '1/-1' }}>
      <label className="form-label">具体方案</label>
      <div style={{ border: '1px solid #d0c9be', borderRadius: 8, padding: 12, background: '#faf8f5' }}>
        {selected.length === 0 && <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>暂未添加随访方案</div>}
        {selected.map((s, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e0d9ce' }}>
            <span style={{ fontSize: 13, flex: 1, color: '#1A2B24', fontWeight: 500 }}>{s.name}</span>
            <button type="button" onClick={() => remove(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', marginTop: 4 }}
          onClick={() => setOpen(o => !o)}>
          {open ? '▲ 收起' : '＋ 添加方案'}
        </button>
        {open && (
          <div style={{ marginTop: 10, border: '1px solid #e0d9ce', borderRadius: 6, background: '#fff', maxHeight: 240, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0ece4' }}>
              <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="搜索随访方案名称..." style={{ fontSize: 12 }} autoFocus />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading && <div style={{ padding: 16, color: '#aaa', fontSize: 12, textAlign: 'center' }}>加载中...</div>}
              {!loading && options.length === 0 && <div style={{ padding: 16, color: '#aaa', fontSize: 12, textAlign: 'center' }}>{search ? '无匹配结果' : '暂无可选随访方案'}</div>}
              {options.map(p => (
                <div key={p._id} onClick={() => add(p)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', cursor: 'pointer',
                  borderBottom: '1px solid #f8f6f2', fontSize: 13,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9f4'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: '#1E6B50' }}>＋ 添加</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 医嘱选择器（检验医嘱 + 检查医嘱 + 功能医学检测，可附带"推荐原因"）
const TYPE_META = {
  lab:      { label: '检验', color: '#0077B6', bg: '#E8F4FD' },
  exam:     { label: '检查', color: '#1E6B50', bg: '#E8F5EF' },
  func:     { label: '功能医学', color: '#8B5CF6', bg: '#F3EEFF' },
}
function OrderSelector({ label, value, onChange, labOrders, examOrders, functionalTests, showReason }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = Array.isArray(value) ? value : []

  const allOptions = [
    ...labOrders.map(o => ({ ...o, _type: 'lab', _label: '[检验]' })),
    ...examOrders.map(o => ({ ...o, _type: 'exam', _label: '[检查]' })),
    ...(functionalTests || []).map(o => ({ ...o, _type: 'func', _label: '[功能医学]' })),
  ].filter(o => o.status === 'active' && o.name.toLowerCase().includes(search.toLowerCase()))

  const isSelected = id => selected.some(s => s.id === id)

  const toggle = item => {
    if (isSelected(item._id)) {
      onChange(selected.filter(s => s.id !== item._id))
    } else {
      onChange([...selected, { type: item._type, id: item._id, name: item.name, ...(showReason ? { reason: '' } : {}) }])
    }
  }

  const remove = idx => onChange(selected.filter((_, i) => i !== idx))

  const setReason = (idx, reason) => {
    const next = [...selected]
    next[idx] = { ...next[idx], reason }
    onChange(next)
  }

  return (
    <div className="form-group" style={{ gridColumn: '1/-1' }}>
      <label className="form-label">{label}</label>
      <div style={{ border: '1px solid #d0c9be', borderRadius: 8, padding: 12, background: '#faf8f5' }}>
        {selected.length === 0 && <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>暂未添加项目</div>}
        {selected.map((s, idx) => (
          <div key={idx} style={{ marginBottom: showReason ? 10 : 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: (TYPE_META[s.type] || TYPE_META.exam).color, background: (TYPE_META[s.type] || TYPE_META.exam).bg, padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                {(TYPE_META[s.type] || TYPE_META.exam).label}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
              <button type="button" onClick={() => remove(idx)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
            {showReason && (
              <input className="form-input" value={s.reason || ''} onChange={e => setReason(idx, e.target.value)}
                placeholder="推荐原因或说明（选填）"
                style={{ marginTop: 4, marginLeft: 50, width: 'calc(100% - 50px)', fontSize: 12 }} />
            )}
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', marginTop: 4 }}
          onClick={() => setOpen(o => !o)}>
          {open ? '▲ 收起' : '＋ 添加项目'}
        </button>
        {open && (
          <div style={{ marginTop: 10, border: '1px solid #e0d9ce', borderRadius: 6, background: '#fff', maxHeight: 260, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0ece4' }}>
              <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="搜索检验/检查医嘱/功能医学检测名称..." style={{ fontSize: 12 }} autoFocus />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {allOptions.length === 0 && <div style={{ padding: 16, color: '#aaa', fontSize: 12, textAlign: 'center' }}>无匹配结果</div>}
              {allOptions.map(o => (
                <div key={o._id} onClick={() => toggle(o)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                  background: isSelected(o._id) ? '#f0f9f4' : 'transparent',
                  borderBottom: '1px solid #f8f6f2',
                }}>
                  <input type="checkbox" readOnly checked={isSelected(o._id)} style={{ accentColor: '#1E6B50', cursor: 'pointer' }} />
                  <span style={{ fontSize: 11, color: (TYPE_META[o._type] || TYPE_META.exam).color, background: (TYPE_META[o._type] || TYPE_META.exam).bg, padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>{o._label}</span>
                  <span style={{ fontSize: 13 }}>{o.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 表单字段行（必须定义在 PlanContentForm 外部，避免每次渲染产生新引用导致输入框失焦）──
function FieldRow({ label, fieldKey, placeholder, rows, half, content, set }) {
  return (
    <div className="form-group" style={half ? {} : { gridColumn: '1/-1' }}>
      <label className="form-label">{label}</label>
      {rows ? (
        <textarea className="form-input" rows={rows} value={content[fieldKey] || ''}
          onChange={e => set(fieldKey, e.target.value)} placeholder={placeholder} />
      ) : (
        <input className="form-input" value={content[fieldKey] || ''}
          onChange={e => set(fieldKey, e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

// ── 各类型的表单字段定义 ──────────────────────────────────────
function PlanContentForm({ type, initialContent, contentRef }) {
  const [content, setContent] = useState(initialContent || defaultContent[type] || {})
  const [labOrders, setLabOrders] = useState([])
  const [examOrders, setExamOrders] = useState([])
  const [functionalTests, setFunctionalTests] = useState([])
  const [followUpPlans, setFollowUpPlans] = useState([])
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const set = useCallback((k, v) => setContent(prev => {
    const next = { ...prev, [k]: v }
    contentRef.current = next
    return next
  }), [contentRef])

  useEffect(() => {
    if (type === 'annual_checkup') {
      // 2026-07-02：补充功能医学检测这一路，此前体检方案模板只能选检验医嘱/检查医嘱
      Promise.all([
        adminAPI.labTestOrders({ status: 'active', limit: 500 }),
        adminAPI.specialExams({ status: 'active', limit: 500 }),
        adminAPI.functionalMedicineTests({ status: 'active', limit: 500 }),
      ]).then(([labRes, examRes, funcRes]) => {
        setLabOrders(labRes.data || [])
        setExamOrders(examRes.data || [])
        setFunctionalTests(funcRes.data || [])
      }).catch(() => {})
    }
    if (type === 'health_management') {
      setFollowUpLoading(true)
      adminAPI.followUpPlans()
        .then(res => setFollowUpPlans(res.data || []))
        .catch(() => {})
        .finally(() => setFollowUpLoading(false))
    }
  }, [type])

  if (type === 'annual_checkup') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div className="form-group">
        <label className="form-label">套餐名称 *</label>
        <input className="form-input" value={content.packageName || ''} onChange={e => set('packageName', e.target.value)} placeholder="如：心脑血管深度筛查套餐" />
      </div>
      <FieldRow label="状态说明" fieldKey="packageDesc" placeholder="套餐描述" half content={content} set={set} />
      <OrderSelector label="包含检查项目" value={content.checkItems} onChange={v => set('checkItems', v)} labOrders={labOrders} examOrders={examOrders} functionalTests={functionalTests} showReason={false} />
      <OrderSelector label="可选加项库" value={content.addons} onChange={v => set('addons', v)} labOrders={labOrders} examOrders={examOrders} functionalTests={functionalTests} showReason={true} />
    </div>
  )

  if (type === 'health_management') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div className="form-group">
        <label className="form-label">方案类型 *</label>
        <select className="form-input" value={content.planType || ''} onChange={e => set('planType', e.target.value)}>
          <option value="">请选择方案类型</option>
          <option value="health_reshape">健康重塑方案</option>
          <option value="young_state">健康年轻态方案</option>
          <option value="chronic_stable">慢病维稳方案</option>
          <option value="health_prevention">健康预防方案</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">方案名称 *</label>
        <input className="form-input" value={content.planName || ''} onChange={e => set('planName', e.target.value)} placeholder="如：慢病管理标准方案" />
      </div>
      <FieldRow label="状态说明" fieldKey="planDesc" placeholder="方案适用场景或说明" half content={content} set={set} />
      <FollowUpPlanSelector
        value={content.followUpPlans}
        onChange={v => set('followUpPlans', v)}
        allPlans={followUpPlans}
        loading={followUpLoading}
      />
    </div>
  )

  if (type === 'nutrition') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <FieldRow label="每日饮水量（毫升）" fieldKey="dailyWater" placeholder="如：2000" half content={content} set={set} />
      <div style={{ gridColumn: '1/-1' }} />
      {[
        { timeKey: 'breakfastTime', contentKey: 'breakfast', label: '早餐', timePlaceholder: '如：07:00' },
        { timeKey: 'lunchTime',     contentKey: 'lunch',     label: '午餐', timePlaceholder: '如：12:00' },
        { timeKey: 'dinnerTime',    contentKey: 'dinner',    label: '晚餐', timePlaceholder: '如：18:30' },
        { timeKey: 'snackTime',     contentKey: 'snack',     label: '加餐', timePlaceholder: '如：15:00（选填）' },
      ].map(({ timeKey, contentKey, label, timePlaceholder }) => (
        <div key={contentKey} className="form-group" style={{ gridColumn: '1/-1', border: '1px solid #ece8e0', borderRadius: 8, padding: 12, background: '#faf8f5' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#333', marginBottom: 8 }}>{label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'start' }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>进餐时间</label>
              <input className="form-input" value={content[timeKey] || ''} onChange={e => set(timeKey, e.target.value)} placeholder={timePlaceholder} style={{ fontSize: 13 }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>食物内容</label>
              <textarea className="form-input" rows={contentKey === 'snack' ? 2 : 3} value={content[contentKey] || ''} onChange={e => set(contentKey, e.target.value)} placeholder="食物种类、份量描述" style={{ fontSize: 13 }} />
            </div>
          </div>
        </div>
      ))}
      <FieldRow label="烹饪方式" fieldKey="cookingMethod" placeholder="推荐：蒸煮炖；避免：油炸" half content={content} set={set} />
      <FieldRow label="进餐顺序" fieldKey="mealOrder" placeholder="如：汤→蔬菜→肉→主食" half content={content} set={set} />
      <FieldRow label="膳食总原则" fieldKey="dietPrinciple" placeholder="如：低盐低脂、高纤维" half content={content} set={set} />
      <FieldRow label="营养素补充建议" fieldKey="nutritionSupplements" rows={3} placeholder="营养素名称、剂量、用法" content={content} set={set} />
      <FieldRow label="运动建议" fieldKey="exerciseSuggestion" rows={3} placeholder="运动类型、频率、时长、强度" content={content} set={set} />
      <FieldRow label="推荐食物" fieldKey="allowedFoods" rows={2} placeholder="逗号分隔" content={content} set={set} />
      <FieldRow label="禁忌食物" fieldKey="forbiddenFoods" rows={2} placeholder="逗号分隔" content={content} set={set} />
    </div>
  )

  if (type === 'medical_assist') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <FieldRow label="医院" fieldKey="hospital" placeholder="医院名称" half content={content} set={set} />
      <FieldRow label="科室" fieldKey="department" placeholder="科室名称" half content={content} set={set} />
      <FieldRow label="专家" fieldKey="expert" placeholder="专家姓名（可选）" half content={content} set={set} />
      <FieldRow label="就医专员" fieldKey="staffName" placeholder="专员姓名（可选）" half content={content} set={set} />
      <FieldRow label="服务时间" fieldKey="datetime" placeholder="日期和时间段" half content={content} set={set} />
      <FieldRow label="交通接送安排" fieldKey="transport" placeholder="是否专车、集合地点" half content={content} set={set} />
      <FieldRow label="具体服务事项" fieldKey="tasks" rows={3} placeholder="如：代取报告、陪同检查" content={content} set={set} />
      <FieldRow label="酒店安排" fieldKey="hotel" rows={2} placeholder="是否需要住宿及酒店信息" content={content} set={set} />
      <FieldRow label="备注" fieldKey="notes" rows={2} placeholder="其他注意事项" content={content} set={set} />
    </div>
  )

  if (type === 'rehab') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <FieldRow label="复健目标" fieldKey="goal" placeholder="文字描述" half content={content} set={set} />
      <FieldRow label="每周频次" fieldKey="weeklyFreq" placeholder="如：每周3次" half content={content} set={set} />
      <FieldRow label="每次时长（分钟）" fieldKey="duration" placeholder="如：45" half content={content} set={set} />
      <FieldRow label="运动项目" fieldKey="exercises" rows={4} placeholder="具体动作/器械/活动，每行一项" content={content} set={set} />
      <FieldRow label="注意事项" fieldKey="precautions" rows={3} placeholder="禁忌、需监护事项等" content={content} set={set} />
      <FieldRow label="进阶计划" fieldKey="progression" rows={2} placeholder="如：每两周增加强度" content={content} set={set} />
    </div>
  )

  if (type === 'tcm') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <FieldRow label="中药调理（方剂/中成药）" fieldKey="chineseMedicine" rows={3} placeholder="方剂或中成药建议" content={content} set={set} />
      <FieldRow label="针灸/推拿" fieldKey="acupuncture" rows={3} placeholder="建议频次、主要穴位" content={content} set={set} />
      <FieldRow label="饮食宜忌" fieldKey="diet" rows={3} placeholder="推荐食物、禁忌食物" content={content} set={set} />
      <FieldRow label="起居建议" fieldKey="lifestyle" rows={3} placeholder="作息、睡眠、情绪调节" content={content} set={set} />
      <FieldRow label="其他（八段锦/太极等）" fieldKey="other" rows={2} placeholder="其他养生建议" content={content} set={set} />
    </div>
  )

  if (type === 'psychology') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <FieldRow label="咨询频次" fieldKey="frequency" placeholder="如：每周一次，共8次" half content={content} set={set} />
      <FieldRow label="每次时长（分钟）" fieldKey="duration" placeholder="如：50" half content={content} set={set} />
      <div className="form-group">
        <label className="form-label">咨询方式</label>
        <select className="form-input" value={content.mode || '线上'} onChange={e => set('mode', e.target.value)}>
          {['线上', '线下', '电话'].map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <FieldRow label="作业建议（日常练习）" fieldKey="homework" rows={3} placeholder="如：正念冥想、情绪日记" content={content} set={set} />
      <FieldRow label="评估工具/量表" fieldKey="assessmentTools" rows={3} placeholder="如：GAD-7（焦虑）、PHQ-9（抑郁）" content={content} set={set} />
    </div>
  )

  return null
}

// ── 模板新增/编辑 Modal ──────────────────────────────────────
function TemplateModal({ template, planType, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!template?._id
  const [name, setName] = useState(template?.name || '')
  const [status, setStatus] = useState(template?.status || 'active')
  const [loading, setLoading] = useState(false)
  const contentRef = useRef(template?.content || defaultContent[planType] || {})

  const typeLabel = PLAN_TYPES.find(t => t.key === planType)?.label || planType

  const save = async () => {
    if (!name.trim()) { toast('❌ 模板名称不能为空'); return }
    const content = contentRef.current
    setLoading(true)
    try {
      if (isEdit) {
        await adminAPI.updatePlanTemplate(template._id, { name, status, content })
      } else {
        await adminAPI.createPlanTemplate({ type: planType, name, status, content })
      }
      toast(`✅ 模板${isEdit ? '更新' : '创建'}成功`)
      onSaved()
      onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, width: '96%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑' : '➕ 新增'}{typeLabel}模板</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">模板名称 *</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)}
                placeholder={`如：${planType === 'annual_checkup' ? '心脑血管深度筛查套餐' : planType === 'nutrition' ? '糖尿病饮食管理方案' : '方案模板名称'}`} />
            </div>
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="active">启用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e0d9ce', paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 12 }}>模板内容</div>
            <PlanContentForm type={planType} initialContent={contentRef.current} contentRef={contentRef} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 年度管理方案列表（只读 + 入口跳转） ──────────────────────────────────
const ANNUAL_PLAN_TYPE_LABEL = {
  health_reshape:    '健康重塑',
  young_state:       '年轻态',
  chronic_stable:    '慢病维稳',
  health_prevention: '健康预防',
}

// 会员搜索组件
function PatientSearchInput({ value, onChange }) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const timerRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInput = e => {
    const kw = e.target.value
    setKeyword(kw)
    setOpen(true)
    if (!kw.trim()) { setResults([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await adminAPI.patients({ q: kw, limit: 20 })
        setResults(Array.isArray(res.data) ? res.data : [])
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelect = patient => {
    onChange(patient._id)
    setSelectedName(`${patient.name}  ${patient.phone}`)
    setKeyword(''); setResults([]); setOpen(false)
  }

  const handleClear = () => {
    onChange(''); setSelectedName(''); setKeyword(''); setResults([])
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {value && selectedName ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid #1E6B50', borderRadius: 8, background: '#E8F5EF', fontSize: 14 }}>
          <span>
            <span style={{ fontWeight: 600, color: '#1A2B24' }}>{selectedName.split('  ')[0]}</span>
            <span style={{ color: '#8AA89C', marginLeft: 8, fontSize: 13 }}>{selectedName.split('  ')[1]}</span>
          </span>
          <button type="button" onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input className="form-input" type="text" value={keyword} onChange={handleInput}
            onFocus={() => keyword && setOpen(true)} placeholder="输入姓名或手机号搜索会员..." autoComplete="off" />
          {searching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa' }}>搜索中...</span>}
        </div>
      )}
      {open && !value && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
          {results.length === 0 && keyword && !searching && <div style={{ padding: '12px 16px', color: '#aaa', fontSize: 13 }}>未找到匹配会员</div>}
          {results.length === 0 && !keyword && <div style={{ padding: '12px 16px', color: '#aaa', fontSize: 13 }}>请输入姓名或手机号</div>}
          {results.map(p => (
            <div key={p._id} onMouseDown={() => handleSelect(p)}
              style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #F5F2EC' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F6F0'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1E6B50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                {p.name?.[0] || '?'}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1A2B24' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#8AA89C' }}>{p.phone}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AnnualPlanEntryModal({ onClose, nav }) {
  const [patientId, setPatientId] = useState('')

  const handleGo = () => {
    if (!patientId) return
    onClose()
    nav(`/patients/${patientId}/annual-plan`)
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title">📅 新建年度管理方案</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#0077B6' }}>
            💡 年度管理方案为每位会员每年独立配置，包含医疗问题、全专联合、日常监测、疫苗接种、生活方式、体检方案六大模块
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">搜索会员 *</label>
            <PatientSearchInput value={patientId} onChange={setPatientId} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleGo} disabled={!patientId} style={{ opacity: patientId ? 1 : 0.5 }}>
            进入年度方案配置 →
          </button>
        </div>
      </div>
    </div>
  )
}

function AnnualPlanView({ nav }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    setLoading(true)
    adminAPI.listAnnualPlans()
      .then(res => setPlans(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 600 }}>📅 年度管理方案</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>共 {plans.length} 份</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ 新建年度管理方案</button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>会员</th>
                <th>年度</th>
                <th>方案类型</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: 32 }}>
                  暂无年度管理方案，点击「新建年度管理方案」添加
                </td></tr>
              )}
              {plans.map(p => (
                <tr key={p._id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{p.patientId?.name || '-'}</span>
                    <span style={{ color: '#aaa', fontSize: 12, marginLeft: 6 }}>{p.patientId?.phone}</span>
                  </td>
                  <td>{p.year} 年</td>
                  <td>
                    {p.planType ? (
                      <span className="badge badge-info">{ANNUAL_PLAN_TYPE_LABEL[p.planType] || p.planType}</span>
                    ) : (
                      <span style={{ color: '#aaa', fontSize: 12 }}>未设置</span>
                    )}
                  </td>
                  <td style={{ color: '#888', fontSize: 12 }}>
                    {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => p.patientId && nav(`/patients/${p.patientId._id}/annual-plan`)}
                    >配置方案</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <AnnualPlanEntryModal nav={nav} onClose={() => setShowModal(false)} />}
    </>
  )
}

// ── 主页面 ──────────────────────────────────────────────────────
export default function HealthPlanTemplatePage() {
  const nav = useNavigate()
  const toast = useToast()
  const [activeType, setActiveType] = useState('annual_mgmt')
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    if (activeType === 'annual_mgmt') return
    setLoading(true)
    try {
      const res = await adminAPI.planTemplates(activeType, q)
      setTemplates(res.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally {
      setLoading(false)
    }
  }, [activeType, q])

  useEffect(() => { load() }, [load])

  const toggle = async (tpl) => {
    try {
      await adminAPI.togglePlanTemplate(tpl._id)
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const copy = async (tpl) => {
    try {
      await adminAPI.copyPlanTemplate(tpl._id)
      toast('✅ 模板已复制')
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const del = async (tpl) => {
    if (!window.confirm(`确定删除「${tpl.name}」？`)) return
    try {
      await adminAPI.deletePlanTemplate(tpl._id)
      toast('✅ 已删除')
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const activeTypeMeta = PLAN_TYPES.find(t => t.key === activeType)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📚 健康方案模板管理</div>
          <div className="page-subtitle">配置七类健康方案的标准模板，医护人员可快速选用并为客户生成个性化方案</div>
        </div>
      </div>

      {/* 方案类型标签页 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e0d9ce', overflowX: 'auto' }}>
        {/* 年度管理方案 — 特殊 tab */}
        <button type="button" onClick={() => setActiveType('annual_mgmt')} style={{
          padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: activeType === 'annual_mgmt' ? 600 : 400, whiteSpace: 'nowrap',
          color: activeType === 'annual_mgmt' ? '#1E6B50' : '#666',
          borderBottom: activeType === 'annual_mgmt' ? '2px solid #1E6B50' : '2px solid transparent',
          marginBottom: -1,
        }}>
          📅 年度管理方案
        </button>

        {PLAN_TYPES.map(t => (
          <button key={t.key} type="button" onClick={() => setActiveType(t.key)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: activeType === t.key ? 600 : 400, whiteSpace: 'nowrap',
            color: activeType === t.key ? '#1E6B50' : '#666',
            borderBottom: activeType === t.key ? '2px solid #1E6B50' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 年度管理方案：独立视图 */}
      {activeType === 'annual_mgmt' && <AnnualPlanView nav={nav} />}

      {/* 其他 7 种方案类型：模板 CRUD */}
      {activeType !== 'annual_mgmt' && (
        <>
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{activeTypeMeta?.icon} {activeTypeMeta?.label}</span>
              <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>共 {templates.length} 个模板</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="search-input"
                placeholder="🔍  搜索模板名称..."
                value={q}
                onChange={e => setQ(e.target.value)}
                style={{ width: 220 }}
              />
              <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
                ＋ 新增模板
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading">加载中...</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>模板名称</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888', padding: 32 }}>
                      暂无{activeTypeMeta?.label}模板，点击「新增模板」添加
                    </td></tr>
                  )}
                  {templates.map(tpl => (
                    <tr key={tpl._id}>
                      <td style={{ fontWeight: 600 }}>{tpl.name}</td>
                      <td>
                        <span className={`badge ${tpl.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                          {tpl.status === 'active' ? '启用' : '停用'}
                        </span>
                      </td>
                      <td style={{ color: '#888', fontSize: 12 }}>
                        {new Date(tpl.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(tpl); setShowModal(true) }}>编辑</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => toggle(tpl)}>
                            {tpl.status === 'active' ? '停用' : '启用'}
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => copy(tpl)}>复制</button>
                          <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => del(tpl)}>删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showModal && (
            <TemplateModal
              template={editing}
              planType={activeType}
              onClose={() => setShowModal(false)}
              onSaved={load}
            />
          )}
        </>
      )}
    </div>
  )
}
