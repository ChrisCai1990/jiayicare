import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'
import { useToast } from '../App'

const PLAN_TYPES = [
  { key: 'annual_checkup',    label: '年度体检方案',  icon: '🔬' },
  { key: 'health_management', label: '年度管理规则',  icon: '📋' },
  { key: 'nutrition',         label: '营养干预方案',  icon: '🥗' },
  { key: 'medical_assist',    label: '就医协助方案',  icon: '🏥' },
  { key: 'rehab',             label: '运动复健方案',  icon: '🏃' },
  { key: 'tcm',               label: '中医养生方案',  icon: '🍃' },
  { key: 'psychology',        label: '心理咨询方案',  icon: '🧠' },
  { key: 'phase_assessment',  label: '阶段性评估',    icon: '📊' },
]

const ANNUAL_MODULE_RULES = [
  { key: 'goals', label: '年度管理目标', reviewer: '健康顾问', desc: '承接已确认综合研判，明确目标、依据和优先级' },
  { key: 'monitoring', label: '日常健康监测', reviewer: '健康顾问', desc: '指标、目标范围、频率、时段和异常触发规则' },
  { key: 'abnormal_followup', label: '检查与异常复查', reviewer: '健康顾问', desc: '项目名称、依据、建议时间和检查注意事项' },
  { key: 'lifestyle', label: '生活方式管理', reviewer: '营养师', desc: '饮食、运动、睡眠等行动要求及评估周期' },
  { key: 'medication', label: '用药与营养素管理', reviewer: '健康顾问/营养师', desc: '只承接已确认用药或营养素信息，不自动调整' },
  { key: 'medical_service', label: '就医及专业服务', reviewer: '健康顾问', desc: '就医目的、科室方向、协调要求和待确认安排' },
  { key: 'stage_assessment', label: '阶段性健康评估', reviewer: '营养师', desc: '常规管理或12周强化干预的评估节奏' },
  { key: 'annual_checkup', label: '年度体检', reviewer: '健康顾问', desc: '体检月份、重点项目、套餐及可选加项' },
]

const DEFAULT_REQUIRED_FIELDS = ['项目名称', '设置依据', '建议时间/时间范围', '执行频率', '注意事项', '客户行动', '责任角色', '审核状态']

const STANDARD_ACTION_DEFS = [
  { key: 'medical_treatment', label: '需要安排就医', hint: '客户存在明确就医需求时采用' },
  { key: 'checkup_completion', label: '需要完善体检', hint: '现有健康资料存在必要检查缺口时采用' },
  { key: 'abnormal_followup', label: '需要定期复查', hint: '已确认异常或慢病需要复查时采用' },
  { key: 'vaccine', label: '疫苗接种', hint: '符合接种依据且需要纳入年度管理时采用' },
  { key: 'annual_checkup', label: '年度体检', hint: '需要安排下一年度体检时采用' },
]

// ── 各类型的默认 content 结构 ─────────────────────────────────
const defaultContent = {
  annual_checkup: {
    packageName: '', packageDesc: '',
    checkItems: [], // [{ type:'lab'|'exam', id, name }]
    addons: [],     // [{ type:'lab'|'exam', id, name, reason }]
  },
  health_management: {
    templateVersion: 2,
    planType: 'health_prevention',
    planName: '',
    planDesc: '',
    strategyFocus: '',
    strategyEvidence: '',
    managementCycle: '12个月',
    sourceRule: '仅使用已确认的年度管理研判结论',
    requiredItemFields: DEFAULT_REQUIRED_FIELDS,
    moduleRules: ANNUAL_MODULE_RULES.map(item => ({ key: item.key, enabled: true, aiCanGenerate: true, reviewer: item.reviewer, customerConfirmationRequired: true })),
    standardActionPlans: {},
    personalizedFollowUpPlans: [],
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
    description: '',
  },
  medical_assist: {
    serviceDomain: 'medical_assist', assistanceType: '', serviceMode: 'remote', applicableScenario: '', standardSteps: '',
    requiredMaterials: '', completionStandard: '', requiresDoctorConfirm: true,
    requiresExecutor: true, requiresSupervisor: true, followUpPlanId: '', followUpPlanName: '', followUpPlans: [],
    optionalLogistics: '', riskNotes: '', tasks: '', notes: '',
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
  phase_assessment: {
    frequency: 'monthly', triggerRule: '', minimumData: '', focus: '', instructions: '', outputSections: [], contextScopes: ['healthProfile', 'reports', 'healthRecords', 'followups', 'plans'],
  },
}

// 单选岗位任务方案也可能有几十条；使用原生 datalist 保留键盘输入、模糊检索和下拉选择，
// 同时仍按方案 id 保存，避免重名或改名后关联丢失。
function SearchablePlanSelect({ value, plans, onChange }) {
  const selected = plans.find(plan => plan._id === value)
  const [query, setQuery] = useState(selected?.name || '')
  const listId = useRef(`followup-plan-options-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    setQuery(selected?.name || '')
  }, [value, selected?.name])

  const handleChange = (text) => {
    setQuery(text)
    if (!text) return onChange(null)
    const exact = plans.find(plan => plan.name === text)
    if (exact) onChange(exact)
  }

  return (
    <>
      <input
        className="form-input"
        list={listId.current}
        value={query}
        placeholder="输入方案名称搜索或点击选择"
        onChange={e => handleChange(e.target.value)}
        onBlur={() => {
          if (query && !plans.some(plan => plan.name === query)) setQuery(selected?.name || '')
        }}
        autoComplete="off"
      />
      <datalist id={listId.current}>
        {plans.map(plan => <option key={plan._id} value={plan.name}>{plan.category || '通用'}</option>)}
      </datalist>
    </>
  )
}

// 随访方案选择器（从随访方案库选择）
function FollowUpPlanSelector({ value, onChange, allPlans, loading, label = '可调用的标准随访方案', description = '限定AI可以匹配的标准执行方案；客户确认年度总方案后，系统据此直接生成随访计划。', emptyText = '未限定随访方案：AI只能形成管理要求，不得编造可执行随访计划。' }) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 7 }}>
        <div>
          <label className="form-label" style={{ marginBottom: 2 }}>{label}</label>
          <div style={{ color: '#738078', fontSize: 12 }}>{description}</div>
        </div>
        <a className="btn btn-ghost" href="/projects/followup-plans" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>管理随访方案库 →</a>
      </div>
      <div style={{ border: '1px solid #d0c9be', borderRadius: 8, padding: 12, background: '#faf8f5' }}>
        {selected.length === 0 && <div style={{ color: '#A15C18', fontSize: 12, marginBottom: 8 }}>{emptyText}</div>}
        {selected.map((s, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e0d9ce' }}>
            <span style={{ fontSize: 13, flex: 1, color: '#1A2B24', fontWeight: 500 }}>{s.name}</span>
            <button type="button" onClick={() => remove(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', marginTop: 4 }}
          onClick={() => setOpen(o => !o)}>
          {open ? '▲ 收起' : '＋ 选择标准随访方案'}
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
    if (['health_management', 'medical_assist'].includes(type)) {
      adminAPI.followUpPlans()
        .then(res => setFollowUpPlans((res.data || []).filter(plan => plan.status === 'active')))
        .catch(() => setFollowUpPlans([]))
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
      <div style={{ gridColumn: '1/-1', padding: '13px 15px', borderRadius: 10, background: '#EEF7F2', border: '1px solid #CFE4D8', color: '#28483B', fontSize: 13, lineHeight: 1.7 }}>
        <strong>年度管理规则只规定边界，不保存客户个性化内容。</strong><br />
        AI依据已确认综合研判，在下方启用模块和标准随访方案范围内组装客户年度总方案；健康顾问审核、客户确认后，系统自动生成随访计划及专业岗位指令。
      </div>
      <div className="form-group">
        <label className="form-label">适用管理模式 *</label>
        <select className="form-input" value={content.planType || 'health_prevention'} onChange={e => set('planType', e.target.value)}>
          <option value="health_reshape">健康重塑类</option>
          <option value="young_state">健康年轻态类</option>
          <option value="chronic_stable">慢病维稳类</option>
          <option value="health_prevention">健康预防类</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">规则名称 *</label>
        <input className="form-input" value={content.planName || ''} onChange={e => set('planName', e.target.value)} placeholder="如：年度健康管理统一规则" />
      </div>
      <FieldRow label="状态说明" fieldKey="planDesc" placeholder="方案适用场景或说明" half content={content} set={set} />
      <FieldRow label="策略侧重点 *" fieldKey="strategyFocus" rows={3} placeholder="说明本策略优先解决的方向，例如：体重与代谢重塑、睡眠和运动能力、慢病稳定与风险预警" content={content} set={set} />
      <FieldRow label="AI优先研判依据" fieldKey="strategyEvidence" rows={3} placeholder="说明AI优先关注的已确认资料，例如：阶段性评估、体成分趋势、血压血糖、睡眠打卡、慢病复查结果" content={content} set={set} />
      <div className="form-group">
        <label className="form-label">管理周期</label>
        <select className="form-input" value={content.managementCycle || '12个月'} onChange={e => set('managementCycle', e.target.value)}>
          <option value="12个月">12个月</option><option value="6个月">6个月</option><option value="自定义">自定义</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">方案生成依据</label>
        <input className="form-input" value={content.sourceRule || '仅使用已确认的年度管理研判结论'} onChange={e => set('sourceRule', e.target.value)} />
      </div>
      <div style={{ gridColumn: '1/-1', border: '1px solid #DDE8E2', borderRadius: 12, padding: 16, background: '#FAFCFB' }}>
        <div style={{ fontWeight: 700, color: '#155E48' }}>统一事项结构</div>
        <div style={{ color: '#65776F', fontSize: 12, marginTop: 4 }}>AI生成的每个项目都必须具备以下字段，健康顾问审核后才能推送和生成任务。</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
          {(content.requiredItemFields?.length ? content.requiredItemFields : DEFAULT_REQUIRED_FIELDS).map(field => <span key={field} style={{ padding: '5px 9px', borderRadius: 14, background: '#EEF7F2', color: '#1E6B50', fontSize: 12, fontWeight: 600 }}>{field}</span>)}
        </div>
      </div>
      <div style={{ gridColumn: '1/-1', border: '1px solid #E5E0D8', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700 }}>年度总方案模块与审核规则</div>
        <div style={{ color: '#777', fontSize: 12, marginTop: 4 }}>通常只需一套统一规则；确有流程差异时，再按管理模式调整模块、审核角色和AI权限。</div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {ANNUAL_MODULE_RULES.map(mod => {
            const rules = content.moduleRules?.length ? content.moduleRules : defaultContent.health_management.moduleRules
            const rule = rules.find(item => item.key === mod.key) || { key: mod.key, enabled: false, aiCanGenerate: true, reviewer: mod.reviewer, customerConfirmationRequired: true }
            const updateRule = changes => set('moduleRules', rules.some(item => item.key === mod.key) ? rules.map(item => item.key === mod.key ? { ...item, ...changes } : item) : [...rules, { ...rule, ...changes }])
            return <div key={mod.key} style={{ display: 'grid', gridTemplateColumns: '28px minmax(180px,1fr) 130px 110px', gap: 10, alignItems: 'center', padding: '10px 11px', border: '1px solid #ECE8E0', borderRadius: 9, background: rule.enabled ? '#fff' : '#F7F7F6' }}>
              <input type="checkbox" checked={rule.enabled !== false} onChange={e => updateRule({ enabled: e.target.checked })} />
              <div><div style={{ fontWeight: 650, fontSize: 13 }}>{mod.label}</div><div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{mod.desc}</div></div>
              <select className="form-input" style={{ padding: '6px 7px', fontSize: 12 }} value={rule.reviewer || mod.reviewer} onChange={e => updateRule({ reviewer: e.target.value })}><option>健康顾问</option><option>营养师</option><option>健康顾问/营养师</option></select>
              <label style={{ fontSize: 12, color: '#555' }}><input type="checkbox" checked={rule.aiCanGenerate !== false} onChange={e => updateRule({ aiCanGenerate: e.target.checked })} style={{ marginRight: 5 }} />AI可生成</label>
            </div>
          })}
        </div>
      </div>
      <div style={{ gridColumn: '1/-1', border: '1px solid #D9D2C7', borderRadius: 12, padding: 16, background: '#FAF8F5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>年度基础动作模板</div>
            <div style={{ color: '#65776F', fontSize: 12, marginTop: 4 }}>为当前管理策略指定五类标准入口。医护端展示和AI生成都只读取这里保存的模板，不在前端自行设定。</div>
          </div>
          <a className="btn btn-ghost" href="/projects/followup-plans" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>管理随访方案库 →</a>
        </div>
        <div style={{ display: 'grid', gap: 9, marginTop: 13 }}>
          {STANDARD_ACTION_DEFS.map(action => {
            const selected = content.standardActionPlans?.[action.key] || {}
            return <div key={action.key} style={{ display: 'grid', gridTemplateColumns: '150px minmax(220px,1fr)', gap: 12, alignItems: 'center', padding: '10px 11px', border: '1px solid #E6E1D8', borderRadius: 9, background: '#fff' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 650, color: '#28483B' }}>{action.label}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#88958F' }}>{action.hint}</div>
              </div>
              <select className="form-input" value={selected.id || ''} onChange={e => {
                const plan = followUpPlans.find(item => item._id === e.target.value)
                set('standardActionPlans', {
                  ...(content.standardActionPlans || {}),
                  [action.key]: plan ? { id: plan._id, name: plan.name } : null,
                })
              }}>
                <option value="">不配置（该动作不参与本策略筛选）</option>
                {followUpPlans.map(plan => <option key={plan._id} value={plan._id}>{plan.name}</option>)}
              </select>
            </div>
          })}
        </div>
        <div style={{ marginTop: 11, padding: '8px 10px', borderRadius: 7, background: '#EEF7F2', color: '#426457', fontSize: 12 }}>
          疾病、具体复查项目和疫苗品种等细分模板仍在随访方案库维护，只用于后续单次随访计划，不在年度总方案中整库筛选。
        </div>
      </div>
      <FollowUpPlanSelector
        value={content.personalizedFollowUpPlans || []}
        onChange={value => set('personalizedFollowUpPlans', value)}
        allPlans={followUpPlans.filter(plan => !Object.values(content.standardActionPlans || {}).some(selected => selected?.id === plan._id))}
        loading={false}
        label="可调用的个性化方案"
        description="限定当前年度策略可以调用的差异化模板；可按策略选择睡眠、体重、代谢、慢病监测、设备维护等方案。"
        emptyText="尚未配置个性化方案：AI完成五类基础动作后不会继续生成策略专属内容。"
      />
      <div style={{ gridColumn: '1/-1', marginTop: -5, padding: '9px 11px', borderRadius: 8, background: '#F3EEFF', color: '#65489A', fontSize: 12 }}>
        上述方案是当前年度策略专属的AI候选范围。AI完成五类基础动作过筛后，只能从这里勾选的模板中继续选择；未勾选模板不得调用。
      </div>
    </div>
  )

  if (type === 'nutrition') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <FieldRow label="方案说明" fieldKey="description" rows={3} placeholder="标准化方案说明，创建方案时会自动带出，可再修改" content={content} set={set} />
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
      <FieldRow label="现有营养补充信息（仅记录）" fieldKey="nutritionSupplements" rows={3} placeholder="记录客户已使用产品及信息来源；不得填写推荐、治疗用途或剂量调整建议" content={content} set={set} />
      <FieldRow label="运动建议" fieldKey="exerciseSuggestion" rows={3} placeholder="运动类型、频率、时长、强度" content={content} set={set} />
      <FieldRow label="推荐食物" fieldKey="allowedFoods" rows={2} placeholder="逗号分隔" content={content} set={set} />
      <FieldRow label="禁忌食物" fieldKey="forbiddenFoods" rows={2} placeholder="逗号分隔" content={content} set={set} />
    </div>
  )

  if (type === 'medical_assist') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div className="form-group">
        <label className="form-label">所属专业子方案</label>
        <select className="form-input" value={content.serviceDomain || 'medical_assist'} onChange={e => set('serviceDomain', e.target.value)}>
          <option value="medical_assist">就医协助子方案</option><option value="annual_checkup">体检子方案</option><option value="professional_consultation">专业咨询子方案</option>
        </select>
      </div>
      <div className="form-group">
        <FollowUpPlanSelector
          value={(content.followUpPlans?.length ? content.followUpPlans : (content.followUpPlanId ? [{ id: content.followUpPlanId, name: content.followUpPlanName || followUpPlans.find(p => p._id === content.followUpPlanId)?.name || '已关联方案' }] : []))}
          allPlans={followUpPlans}
          loading={false}
          label="关联岗位任务方案 *"
          description="可搜索并多选；子方案推送后，每个选中方案分别生成执行任务和督办任务。"
          emptyText="至少关联一个岗位任务方案。"
          onChange={plans => {
            set('followUpPlans', plans)
            set('followUpPlanId', plans[0]?.id || '')
            set('followUpPlanName', plans[0]?.name || '')
          }}
        />
      </div>
      <div className="form-group">
        <label className="form-label">就医协助类型</label>
        <select className="form-input" value={content.assistanceType || ''} onChange={e => set('assistanceType', e.target.value)}>
          <option value="">请选择</option><option value="consultation">健康咨询</option><option value="agency">代办服务</option><option value="proxy_visit">代诊服务</option><option value="medication">代配药</option><option value="escort">陪诊/陪检</option><option value="treatment">陪同治疗</option><option value="checkup">体检协调</option><option value="one_stop">一站式服务</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">服务方式</label>
        <select className="form-input" value={content.serviceMode || 'remote'} onChange={e => set('serviceMode', e.target.value)}>
          <option value="remote">远程协调</option><option value="onsite">现场陪同</option><option value="hybrid">远程＋现场</option>
        </select>
        <div style={{ color: '#7C8B84', fontSize: 11, marginTop: 4 }}>远程服务不生成陪同任务；现场或混合服务可另行关联陪诊、陪检岗位任务。</div>
      </div>
      <FieldRow label="适用场景" fieldKey="applicableScenario" rows={3} placeholder="说明什么情况下采用本模板" content={content} set={set} />
      <FieldRow label="标准服务步骤" fieldKey="standardSteps" rows={6} placeholder="每行一个标准动作；不填写具体客户、医院、专家和日期" content={content} set={set} />
      <FieldRow label="客户需准备资料" fieldKey="requiredMaterials" rows={3} placeholder="如：身份证、医保卡、既往报告、处方或医生医嘱" content={content} set={set} />
      <FieldRow label="完成标准" fieldKey="completionStandard" rows={3} placeholder="说明执行人完成到什么程度才可提交" content={content} set={set} />
      <FieldRow label="可选住宿/交通服务" fieldKey="optionalLogistics" rows={2} placeholder="仅说明可提供的协助，不固定具体酒店和车辆" content={content} set={set} />
      <FieldRow label="风险与注意事项" fieldKey="riskNotes" rows={3} placeholder="涉及停药、检查准备或治疗事项时，统一要求向开单医生确认" content={content} set={set} />
      <div style={{ gridColumn: '1/-1', display: 'flex', flexWrap: 'wrap', gap: 18, padding: '11px 13px', border: '1px solid #E6E1D8', borderRadius: 9, background: '#FAF8F5' }}>
        {[['requiresDoctorConfirm','需要家庭医生确认'],['requiresExecutor','需要专业人员执行'],['requiresSupervisor','需要健管/家庭医生督办']].map(([key,label]) => <label key={key} style={{ fontSize: 13 }}><input type="checkbox" checked={content[key] !== false} onChange={e => set(key, e.target.checked)} style={{ marginRight: 6 }} />{label}</label>)}
      </div>
      <div style={{ gridColumn: '1/-1', padding: '9px 11px', borderRadius: 8, background: '#EEF7F2', color: '#426457', fontSize: 12 }}>医院、科室、专家、具体日期、就医专员和督办人均在客户子方案中填写，不在 Admin 标准模板中写死。</div>
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

  if (type === 'phase_assessment') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div className="form-group"><label className="form-label">触发周期 *</label><select className="form-input" value={content.frequency || 'monthly'} onChange={e => set('frequency', e.target.value)}><option value="monthly">每月</option><option value="quarterly">每季度</option><option value="yearly">每年</option></select></div>
      <FieldRow label="生成规则" fieldKey="triggerRule" placeholder="如：年度方案确认日起满12个月后生成" rows={2} content={content} set={set} />
      <FieldRow label="最低数据要求" fieldKey="minimumData" placeholder="如：检查、健康记录或随访缺失时，列为待补数据，不得推断" rows={2} content={content} set={set} />
      <FieldRow label="评估重点" fieldKey="focus" placeholder="如：目标达成、方案执行与依从性、指标趋势、复查和风险变化" rows={3} content={content} set={set} />
      <FieldRow label="评估要求" fieldKey="instructions" placeholder="如：分析管理成效与未达成原因；提出下一阶段待审核计划；不得自动改方案" rows={3} content={content} set={set} />
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
  const [clientBrand, setClientBrand] = useState(template?.clientBrand || template?.content?.clientBrand || 'jiayiguanjia')
  const [loading, setLoading] = useState(false)
  const contentRef = useRef(template?.content || defaultContent[planType] || {})

  const typeLabel = PLAN_TYPES.find(t => t.key === planType)?.label || planType

  const save = async () => {
    if (!name.trim()) { toast('❌ 模板名称不能为空'); return }
    const content = { ...contentRef.current, clientBrand }
    if (planType === 'health_management' && !Object.values(content.standardActionPlans || {}).some(item => item?.id)) {
      toast('❌ 请至少配置一项年度基础动作模板')
      return
    }
    if (planType === 'health_management' && !String(content.strategyFocus || '').trim()) {
      toast('❌ 请填写策略侧重点，避免不同年度策略只有名称不同')
      return
    }
    if (planType === 'medical_assist' && !(content.followUpPlans?.length || content.followUpPlanId)) {
      toast('❌ 请选择关联岗位任务方案')
      return
    }
    setLoading(true)
    try {
      if (isEdit) {
        await adminAPI.updatePlanTemplate(template._id, { name, status, clientBrand, content })
      } else {
        await adminAPI.createPlanTemplate({ type: planType, name, status, clientBrand, content })
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
            <div className="form-group">
              <label className="form-label">客户归属 *</label>
              <select className="form-input" value={clientBrand} onChange={e => setClientBrand(e.target.value)}>
                <option value="jiayiguanjia">嘉医管家</option>
                <option value="jinyisen">金伊森</option>
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
  const [q, setQ] = useState('')

  useEffect(() => {
    setLoading(true)
    adminAPI.listAnnualPlans(q)
      .then(res => setPlans(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [q])

  return (
    <>
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontWeight: 600 }}>📅 年度管理方案</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>共 {plans.length} 份</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="search-input"
            placeholder="🔍  搜索会员姓名或手机号..."
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ width: 220 }}
          />
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ 新建年度管理方案</button>
        </div>
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
          <div className="page-subtitle">年度规则控制AI边界；专业方案模板和标准随访方案分别维护，最终由医护人员审核形成客户个性化方案</div>
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
                    <th>客户归属</th>
                    {activeType === 'health_management' && <th>适用管理模式</th>}
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 && (
                    <tr><td colSpan={activeType === 'health_management' ? 6 : 5} style={{ textAlign: 'center', color: '#888', padding: 32 }}>
                      暂无{activeTypeMeta?.label}模板，点击「新增模板」添加
                    </td></tr>
                  )}
                  {templates.map(tpl => (
                    <tr key={tpl._id}>
                      <td style={{ fontWeight: 600 }}>{tpl.name}</td>
                      <td>{tpl.clientBrand === 'jinyisen' ? '金伊森' : tpl.clientBrand === 'jiayiguanjia' ? '嘉医管家' : '两平台共用（历史）'}</td>
                      {activeType === 'health_management' && <td>{{ health_reshape: '健康重塑类', young_state: '健康年轻态类', chronic_stable: '慢病维稳类', health_prevention: '健康预防类' }[tpl.content?.planType] || '待归类'}</td>}
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
