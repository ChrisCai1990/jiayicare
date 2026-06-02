import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const TYPE_LABEL = {
  annual_checkup:  '年度体检方案',
  annual_mgmt:     '年度管理方案',
  nutrition:       '营养干预方案',
  medical_assist:  '就医协助方案',
  tcm:             '中医调理方案',
  rehab:           '运动复健方案',
  psychology:      '心理咨询方案',
  // 旧类型兼容展示
  checkup:'体检方案', health:'健康管理方案', followup:'随访计划',
}
const STATUS_LABEL = { draft:'草稿', active:'已推送', completed:'已完成', cancelled:'已取消' }
const STATUS_COLOR = { draft:'#8AA89C', active:'#1E6B50', completed:'#22A06B', cancelled:'#DC3545' }

export default function PlansPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showCheckupModal, setShowCheckupModal] = useState(false)
  const [showMedicalModal, setShowMedicalModal] = useState(false)
  const [showNutritionModal, setShowNutritionModal] = useState(false)
  const [showAnnualMgmtModal, setShowAnnualMgmtModal] = useState(false)
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPlans({ type: typeFilter, limit: 50 })
      setPlans(res.data.plans)
      setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">健康方案</h1>
          <p className="page-subtitle">共 {total} 个方案</p>
        </div>
      </div>

      {/* 类型筛选 + 新建按钮同行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { v: '', l: '全部' },
          { v: 'annual_checkup', l: '年度体检方案' },
          { v: 'annual_mgmt',    l: '年度管理方案' },
          { v: 'nutrition',      l: '营养干预方案' },
          { v: 'medical_assist', l: '就医协助方案' },
          { v: 'tcm',            l: '中医调理方案' },
          { v: 'rehab',          l: '运动复健方案' },
          { v: 'psychology',     l: '心理咨询方案' },
        ].map(opt => (
          <button key={opt.v}
            className={`btn btn-sm ${typeFilter === opt.v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTypeFilter(opt.v); setSearchParams(opt.v ? { type: opt.v } : {}) }}>{opt.l}</button>
        ))}

        {/* 新建按钮跟随当前 Tab */}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary btn-sm" onClick={() => {
            if      (typeFilter === 'annual_checkup') setShowCheckupModal(true)
            else if (typeFilter === 'medical_assist') setShowMedicalModal(true)
            else if (typeFilter === 'nutrition')      setShowNutritionModal(true)
            else if (typeFilter === 'annual_mgmt')    setShowAnnualMgmtModal(true)
            else setShowModal(true)
          }}>
            ＋ {TYPE_LABEL[typeFilter] ? `新建${TYPE_LABEL[typeFilter]}` : '新建方案'}
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : plans.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无方案</div>
        : <table className="table">
            <thead><tr>
              <th>方案名称</th><th>类型</th><th>会员</th><th>状态</th><th>项目数</th><th>创建时间</th><th>操作</th>
            </tr></thead>
            <tbody>
              {plans.map(p => (
                <tr key={p._id} onClick={() => nav(p.type === 'annual_mgmt' ? `/plans/mgmt/${p._id}` : `/plans/${p._id}`)} style={{ cursor: 'pointer' }}>
                  <td><strong>{p.title}</strong></td>
                  <td><span className="badge badge-info">{TYPE_LABEL[p.type]}</span></td>
                  <td>{p.patientId?.name || '-'} <span style={{ color: '#aaa', fontSize: 12 }}>{p.patientId?.phone}</span></td>
                  <td><span style={{ color: STATUS_COLOR[p.status], fontWeight: 500 }}>{STATUS_LABEL[p.status]}</span></td>
                  <td>{p.items?.length || 0} 项</td>
                  <td style={{ color: '#8AA89C', fontSize: 12 }}>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); nav(p.type === 'annual_mgmt' ? `/plans/mgmt/${p._id}` : `/plans/${p._id}`) }}>查看</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>

      {showCheckupModal    && <AnnualCheckupPlanModal  onClose={() => setShowCheckupModal(false)}    onSaved={() => { setShowCheckupModal(false);    load(); toast('体检方案已创建') }} />}
      {showMedicalModal    && <MedicalAssistPlanModal  onClose={() => setShowMedicalModal(false)}    onSaved={() => { setShowMedicalModal(false);    load(); toast('就医协助方案已创建') }} />}
      {showNutritionModal  && <NutritionPlanModal      onClose={() => setShowNutritionModal(false)}  onSaved={() => { setShowNutritionModal(false);  load(); toast('营养干预方案已创建') }} />}
      {showAnnualMgmtModal && <AnnualMgmtPlanModal     onClose={() => setShowAnnualMgmtModal(false)} onSaved={() => { setShowAnnualMgmtModal(false); load(); toast('年度管理方案已创建') }} />}
      {showModal && <NewPlanModal type={typeFilter || 'annual_checkup'} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); toast('方案已创建') }} />}
    </div>
  )
}

// ── 会员搜索组件（按姓名或手机号实时搜索） ────────────────────────────
function PatientSearchInput({ value, onChange }) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const timerRef = useRef(null)
  const wrapRef = useRef(null)

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 防抖搜索
  const handleInput = e => {
    const kw = e.target.value
    setKeyword(kw)
    setOpen(true)
    if (!kw.trim()) { setResults([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await staffAPI.getPatients({ search: kw, limit: 20 })
        setResults(res.data.patients || [])
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelect = patient => {
    onChange(patient._id)
    setSelectedName(`${patient.name}  ${patient.phone}`)
    setKeyword('')
    setResults([])
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setSelectedName('')
    setKeyword('')
    setResults([])
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {value && selectedName ? (
        // 已选中态
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', border: '1px solid #1E6B50', borderRadius: 8,
          background: '#E8F5EF', fontSize: 14,
        }}>
          <span>
            <span style={{ fontWeight: 600, color: '#1A2B24' }}>{selectedName.split('  ')[0]}</span>
            <span style={{ color: '#8AA89C', marginLeft: 8, fontSize: 13 }}>{selectedName.split('  ')[1]}</span>
          </span>
          <button
            type="button"
            onClick={handleClear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, lineHeight: 1, padding: 0 }}
          >✕</button>
        </div>
      ) : (
        // 搜索输入态
        <div style={{ position: 'relative' }}>
          <input
            className="form-input"
            type="text"
            value={keyword}
            onChange={handleInput}
            onFocus={() => keyword && setOpen(true)}
            placeholder="输入姓名或手机号搜索会员..."
            autoComplete="off"
          />
          {searching && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa' }}>搜索中...</span>
          )}
        </div>
      )}

      {/* 搜索结果下拉 */}
      {open && !value && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
          marginTop: 4,
        }}>
          {results.length === 0 && keyword && !searching && (
            <div style={{ padding: '12px 16px', color: '#aaa', fontSize: 13 }}>未找到匹配会员</div>
          )}
          {results.length === 0 && !keyword && (
            <div style={{ padding: '12px 16px', color: '#aaa', fontSize: 13 }}>请输入姓名或手机号</div>
          )}
          {results.map(p => (
            <div
              key={p._id}
              onMouseDown={() => handleSelect(p)}
              style={{
                padding: '10px 16px', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid #F5F2EC',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F6F0'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: '#1E6B50',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, flexShrink: 0,
              }}>{p.name?.[0] || '?'}</div>
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

// ── 弹窗标题 & 模板类型映射 ────────────────────────────────────────────
const MODAL_TITLE = {
  annual_checkup: '新建体检方案',
  annual_mgmt:    '新建管理方案',
  nutrition:      '新建营养干预方案',
  medical_assist: '新建就医协助方案',
  tcm:            '新建中医调理方案',
  rehab:          '新建运动复健方案',
  psychology:     '新建心理咨询方案',
}

// plan type → admin 后台模板 type
const TEMPLATE_TYPE_MAP = {
  annual_checkup: 'annual_checkup',
  annual_mgmt:    'health_management',
  nutrition:      'nutrition',
  medical_assist: 'medical_assist',
  tcm:            'tcm',
  rehab:          'rehab',
  psychology:     'psychology',
}

// 从选中的模板推导方案名称
function getTemplateTitle(tpl) {
  if (!tpl) return ''
  const c = tpl.content || {}
  return c.packageName || c.planName || tpl.name || ''
}

// 从选中的模板生成方案 items
function templateToItems(tpl) {
  if (!tpl) return []
  const c = tpl.content || {}

  // ── 年度体检方案 ──────────────────────────────────────────
  if (tpl.type === 'annual_checkup') {
    return (c.checkItems || []).map(ci => ({
      name:     ci.name,
      category: ci.type === 'lab' ? '检验检查' : '影像检查',
      itemId:   ci.id || null,
      itemType: ci.type === 'lab' ? 'labTest' : 'specialExam',
    }))
  }

  // ── 健康管理方案（随访节点）────────────────────────────────
  if (tpl.type === 'health_management') {
    return (c.followUpPlans || []).map(fp => ({
      name:     fp.name,
      category: '随访方案',
    }))
  }

  // ── 营养干预方案 ──────────────────────────────────────────
  if (tpl.type === 'nutrition') {
    const items = []
    const meals = [
      { timeKey: 'breakfastTime', key: 'breakfast', label: '早餐' },
      { timeKey: 'lunchTime',     key: 'lunch',     label: '午餐' },
      { timeKey: 'dinnerTime',    key: 'dinner',     label: '晚餐' },
      { timeKey: 'snackTime',     key: 'snack',      label: '加餐' },
    ]
    meals.forEach(m => {
      if (c[m.key]) {
        const t = c[m.timeKey] ? `（${c[m.timeKey]}）` : ''
        items.push({ name: `${m.label}${t}：${c[m.key]}`, category: '饮食干预' })
      }
    })
    if (c.dailyWater)           items.push({ name: `每日饮水：${c.dailyWater} ml`, category: '饮食干预' })
    if (c.dietPrinciple)        items.push({ name: `膳食原则：${c.dietPrinciple}`, category: '饮食干预' })
    if (c.cookingMethod)        items.push({ name: `烹饪方式：${c.cookingMethod}`, category: '饮食干预' })
    if (c.mealOrder)            items.push({ name: `进餐顺序：${c.mealOrder}`, category: '饮食干预' })
    if (c.allowedFoods)         items.push({ name: `推荐食物：${c.allowedFoods}`, category: '饮食干预' })
    if (c.forbiddenFoods)       items.push({ name: `禁忌食物：${c.forbiddenFoods}`, category: '饮食干预' })
    if (c.nutritionSupplements) items.push({ name: `营养素补充：${c.nutritionSupplements}`, category: '营养干预' })
    if (c.exerciseSuggestion)   items.push({ name: `运动建议：${c.exerciseSuggestion}`, category: '运动干预' })
    return items
  }

  // ── 就医协助方案 ──────────────────────────────────────────
  if (tpl.type === 'medical_assist') {
    const items = []
    if (c.hospital) {
      const dept   = c.department ? ` · ${c.department}` : ''
      const expert = c.expert     ? `（${c.expert}）`    : ''
      items.push({ name: `就诊：${c.hospital}${dept}${expert}`, category: '就医协助' })
    }
    if (c.datetime)  items.push({ name: `就医时间：${c.datetime}`, category: '就医协助' })
    if (c.staffName) items.push({ name: `服务专员：${c.staffName}`, category: '就医协助' })
    if (c.tasks) {
      c.tasks.split('\n').filter(t => t.trim()).forEach(task => {
        items.push({ name: task.trim(), category: '就医协助' })
      })
    }
    if (c.transport) items.push({ name: `交通接送：${c.transport}`, category: '就医协助' })
    if (c.hotel)     items.push({ name: `住宿安排：${c.hotel}`, category: '就医协助' })
    if (c.notes)     items.push({ name: `备注：${c.notes}`, category: '就医协助' })
    return items
  }

  // ── 运动复健方案 ──────────────────────────────────────────
  if (tpl.type === 'rehab') {
    const items = []
    if (c.goal)       items.push({ name: `复健目标：${c.goal}`, category: '运动复健' })
    if (c.weeklyFreq) items.push({ name: `训练频率：${c.weeklyFreq}`, category: '运动复健' })
    if (c.duration)   items.push({ name: `每次时长：${c.duration} 分钟`, category: '运动复健' })
    if (c.exercises) {
      c.exercises.split('\n').filter(e => e.trim()).forEach(ex => {
        items.push({ name: ex.trim(), category: '运动复健' })
      })
    }
    if (c.precautions)  items.push({ name: `注意事项：${c.precautions}`, category: '运动复健' })
    if (c.progression)  items.push({ name: `进阶计划：${c.progression}`, category: '运动复健' })
    return items
  }

  // ── 中医养生方案 ──────────────────────────────────────────
  if (tpl.type === 'tcm') {
    const items = []
    if (c.chineseMedicine) items.push({ name: `中药调理：${c.chineseMedicine}`, category: '中医养生' })
    if (c.acupuncture)     items.push({ name: `针灸推拿：${c.acupuncture}`, category: '中医养生' })
    if (c.diet)            items.push({ name: `饮食宜忌：${c.diet}`, category: '中医养生' })
    if (c.lifestyle)       items.push({ name: `起居建议：${c.lifestyle}`, category: '中医养生' })
    if (c.other)           items.push({ name: c.other, category: '中医养生' })
    return items
  }

  // ── 心理咨询方案 ──────────────────────────────────────────
  if (tpl.type === 'psychology') {
    const items = []
    if (c.frequency)  items.push({ name: `咨询频次：${c.frequency}`, category: '心理咨询' })
    if (c.duration)   items.push({ name: `每次时长：${c.duration} 分钟`, category: '心理咨询' })
    if (c.mode)       items.push({ name: `咨询方式：${c.mode}`, category: '心理咨询' })
    if (c.homework) {
      c.homework.split('\n').filter(h => h.trim()).forEach(hw => {
        items.push({ name: hw.trim(), category: '心理咨询' })
      })
    }
    if (c.assessmentTools) {
      c.assessmentTools.split('\n').filter(t => t.trim()).forEach(tool => {
        items.push({ name: `评估工具：${tool.trim()}`, category: '心理咨询' })
      })
    }
    return items
  }

  return []
}

// ── 就医协助方案：两步创建弹窗 ────────────────────────────────────────
function MedicalAssistPlanModal({ onClose, onSaved }) {
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState([])
  const [loadingTpls, setLoadingTpls] = useState(true)
  const [tplError, setTplError] = useState('')
  const [selectedTpl, setSelectedTpl] = useState(null)

  // 模板内容字段（与管理端完全一致）
  const [form, setForm] = useState({
    name: '', hospital: '', department: '', expert: '',
    staffName: '', datetime: '', transport: '', tasks: '', hotel: '', notes: '',
  })
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const [patientId, setPatientId] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    staffAPI.getPlanTemplates('medical_assist')
      .then(res => setTemplates(res.data || []))
      .catch(err => setTplError(err.message || '加载失败'))
      .finally(() => setLoadingTpls(false))
  }, [])

  const selectTemplate = (tpl) => {
    setSelectedTpl(tpl)
    const c = tpl.content || {}
    setForm({
      name:      tpl.name || '',
      hospital:  c.hospital  || '',
      department:c.department|| '',
      expert:    c.expert    || '',
      staffName: c.staffName || '',
      datetime:  c.datetime  || '',
      transport: c.transport || '',
      tasks:     c.tasks     || '',
      hotel:     c.hotel     || '',
      notes:     c.notes     || '',
    })
    setStep(2)
    setError('')
  }

  const handleSubmit = async () => {
    if (!patientId) { setError('请搜索并选择会员'); return }
    if (!form.name.trim()) { setError('请填写方案名称'); return }
    setError(''); setSaving(true)
    try {
      // items 从内容字段派生
      const items = []
      if (form.hospital) {
        const dept = form.department ? ` · ${form.department}` : ''
        const exp  = form.expert     ? `（${form.expert}）`    : ''
        items.push({ name: `就诊：${form.hospital}${dept}${exp}`, category: '就医协助' })
      }
      if (form.datetime)  items.push({ name: `就医时间：${form.datetime}`,   category: '就医协助' })
      if (form.staffName) items.push({ name: `服务专员：${form.staffName}`, category: '就医协助' })
      if (form.transport) items.push({ name: `交通接送：${form.transport}`, category: '就医协助' })
      if (form.tasks) form.tasks.split('\n').filter(t => t.trim()).forEach(t =>
        items.push({ name: t.trim(), category: '就医协助' })
      )
      if (form.hotel) items.push({ name: `住宿安排：${form.hotel}`, category: '就医协助' })
      if (form.notes) items.push({ name: `备注：${form.notes}`,     category: '就医协助' })

      await staffAPI.createPlan({
        patientId, type: 'medical_assist', title: form.name,
        description, year, items,
        content: { ...form },
      })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const FieldRow = ({ label, fieldKey, rows, placeholder }) => (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      {rows
        ? <textarea rows={rows} value={form[fieldKey]} onChange={e => set(fieldKey, e.target.value)} placeholder={placeholder} style={{ ...inputStyle, resize: 'vertical' }} />
        : <input type="text" value={form[fieldKey]} onChange={e => set(fieldKey, e.target.value)} placeholder={placeholder} style={inputStyle} />
      }
    </div>
  )

  // ── Step 1：模板选择 ──────────────────────────────────────────────
  if (step === 1) return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 className="modal-title">新建就医协助方案 — 选择方案模板</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: 440, overflowY: 'auto' }}>
          {loadingTpls && <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>加载模板中...</div>}
          {tplError && <div style={{ color: '#DC3545', fontSize: 13, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>⚠️ {tplError}</div>}
          {!loadingTpls && !tplError && templates.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>暂无可用模板，请先在超管后台创建就医协助方案模板</div>
          )}
          {templates.map(tpl => {
            const c = tpl.content || {}
            const summary = [c.hospital, c.department, c.expert].filter(Boolean).join(' · ')
            return (
              <div key={tpl._id} onClick={() => selectTemplate(tpl)}
                style={{ border: '1px solid #E0D9CE', borderRadius: 10, padding: '14px 18px', marginBottom: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                onMouseEnter={e => { e.currentTarget.style.border = '1px solid #DC2626'; e.currentTarget.style.background = '#FEF2F2' }}
                onMouseLeave={e => { e.currentTarget.style.border = '1px solid #E0D9CE'; e.currentTarget.style.background = '#fff' }}
              >
                <span style={{ fontSize: 26 }}>🏥</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24' }}>{tpl.name}</div>
                  {summary && <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>{summary}</div>}
                  {c.datetime && <div style={{ fontSize: 12, color: '#4A6558', marginTop: 2 }}>服务时间：{c.datetime}</div>}
                </div>
                <span style={{ color: '#DC2626', fontSize: 18 }}>→</span>
              </div>
            )
          })}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )

  // ── Step 2：完整内容表单 ──────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">新建就医协助方案</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 已选模板 */}
          <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>已选模板：<strong>{selectedTpl?.name}</strong></span>
            <button type="button" onClick={() => setStep(1)}
              style={{ marginLeft: 'auto', fontSize: 12, color: '#DC2626', background: 'none', border: '1px solid #DC2626', borderRadius: 14, padding: '2px 10px', cursor: 'pointer' }}>
              更换模板
            </button>
          </div>

          {/* 搜索会员 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">搜索会员 *</label>
            <PatientSearchInput value={patientId} onChange={setPatientId} />
          </div>

          {/* 方案名称 */}
          <FieldRow label="方案名称 *" fieldKey="name" placeholder="就医协助方案名称" />

          {/* 两栏布局 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldRow label="医院"     fieldKey="hospital"   placeholder="医院名称" />
            <FieldRow label="科室"     fieldKey="department" placeholder="科室名称" />
            <FieldRow label="专家"     fieldKey="expert"     placeholder="专家姓名（可选）" />
            <FieldRow label="就医专员" fieldKey="staffName"  placeholder="专员姓名（可选）" />
            <FieldRow label="服务时间" fieldKey="datetime"   placeholder="日期和时间段" />
            <FieldRow label="交通接送" fieldKey="transport"  placeholder="是否专车、集合地点" />
          </div>

          {/* 全宽多行字段 */}
          <FieldRow label="具体服务事项" fieldKey="tasks"  rows={3} placeholder="如：代取报告、陪同检查，每行一项" />
          <FieldRow label="酒店安排"     fieldKey="hotel"  rows={2} placeholder="是否需要住宿及酒店信息" />
          <FieldRow label="备注"         fieldKey="notes"  rows={2} placeholder="其他注意事项" />

          {/* 方案年度 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案年度</label>
            <input className="form-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>

          {/* 方案说明 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案说明</label>
            <textarea className="form-input" rows={3} placeholder="简要说明方案目标" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setStep(1)}>← 重新选模板</button>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '创建中...' : '创建就医协助方案'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 营养干预方案：两步创建弹窗 ───────────────────────────────────────
const MEALS = [
  { timeKey: 'breakfastTime', contentKey: 'breakfast', label: '早餐', timePlaceholder: '如：07:00' },
  { timeKey: 'lunchTime',     contentKey: 'lunch',     label: '午餐', timePlaceholder: '如：12:00' },
  { timeKey: 'dinnerTime',    contentKey: 'dinner',    label: '晚餐', timePlaceholder: '如：18:30' },
  { timeKey: 'snackTime',     contentKey: 'snack',     label: '加餐', timePlaceholder: '如：15:00（选填）', rows: 2 },
]
const NUTRITION_INIT = {
  dailyWater: '',
  breakfastTime: '', breakfast: '',
  lunchTime: '',     lunch: '',
  dinnerTime: '',    dinner: '',
  snackTime: '',     snack: '',
  cookingMethod: '', mealOrder: '', dietPrinciple: '',
  nutritionSupplements: '', exerciseSuggestion: '',
  allowedFoods: '', forbiddenFoods: '',
}

function NutritionPlanModal({ onClose, onSaved }) {
  const [step, setStep]               = useState(1)
  const [templates, setTemplates]     = useState([])
  const [loadingTpls, setLoadingTpls] = useState(true)
  const [tplError, setTplError]       = useState('')
  const [selectedTpl, setSelectedTpl] = useState(null)
  const [form, setForm]               = useState(NUTRITION_INIT)
  const set                           = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const [planTitle, setPlanTitle]     = useState('')
  const [patientId, setPatientId]     = useState('')
  const [year, setYear]               = useState(new Date().getFullYear())
  const [description, setDescription] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    staffAPI.getPlanTemplates('nutrition')
      .then(res => setTemplates(res.data || []))
      .catch(err => setTplError(err.message || '加载失败'))
      .finally(() => setLoadingTpls(false))
  }, [])

  const selectTemplate = (tpl) => {
    setSelectedTpl(tpl)
    const c = tpl.content || {}
    setPlanTitle(tpl.name || '')
    setForm({ ...NUTRITION_INIT, ...Object.fromEntries(Object.keys(NUTRITION_INIT).map(k => [k, c[k] || ''])) })
    setStep(2); setError('')
  }

  const handleSubmit = async () => {
    if (!patientId)        { setError('请搜索并选择会员'); return }
    if (!planTitle.trim()) { setError('请填写方案名称'); return }
    setError(''); setSaving(true)
    try {
      const items = []
      MEALS.forEach(m => {
        if (form[m.contentKey]) {
          const t = form[m.timeKey] ? `（${form[m.timeKey]}）` : ''
          items.push({ name: `${m.label}${t}：${form[m.contentKey]}`, category: '饮食干预' })
        }
      })
      if (form.dailyWater)           items.push({ name: `每日饮水：${form.dailyWater} ml`, category: '饮食干预' })
      if (form.dietPrinciple)        items.push({ name: `膳食原则：${form.dietPrinciple}`, category: '饮食干预' })
      if (form.nutritionSupplements) items.push({ name: `营养素：${form.nutritionSupplements}`, category: '营养干预' })
      if (form.exerciseSuggestion)   items.push({ name: `运动：${form.exerciseSuggestion}`, category: '运动干预' })
      await staffAPI.createPlan({ patientId, type: 'nutrition', title: planTitle, description, year, items, content: { ...form } })
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  const iStyle = { width: '100%', padding: '7px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }

  if (step === 1) return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 className="modal-title">新建营养干预方案 — 选择方案模板</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: 440, overflowY: 'auto' }}>
          {loadingTpls && <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>加载模板中...</div>}
          {tplError && <div style={{ color: '#DC3545', fontSize: 13, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>⚠️ {tplError}</div>}
          {!loadingTpls && !tplError && templates.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>暂无可用模板，请先在超管后台创建营养干预方案模板</div>}
          {templates.map(tpl => {
            const c = tpl.content || {}
            return (
              <div key={tpl._id} onClick={() => selectTemplate(tpl)}
                style={{ border: '1px solid #E0D9CE', borderRadius: 10, padding: '14px 18px', marginBottom: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                onMouseEnter={e => { e.currentTarget.style.border = '1px solid #7C3AED'; e.currentTarget.style.background = '#F3E8FF' }}
                onMouseLeave={e => { e.currentTarget.style.border = '1px solid #E0D9CE'; e.currentTarget.style.background = '#fff' }}
              >
                <span style={{ fontSize: 26 }}>🥗</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24' }}>{tpl.name}</div>
                  {c.dietPrinciple && <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>{c.dietPrinciple}</div>}
                  {c.dailyWater && <div style={{ fontSize: 12, color: '#4A6558', marginTop: 2 }}>每日饮水：{c.dailyWater} ml</div>}
                </div>
                <span style={{ color: '#7C3AED', fontSize: 18 }}>→</span>
              </div>
            )
          })}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>取消</button></div>
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">新建营养干预方案</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 已选模板 */}
          <div style={{ background: '#F3E8FF', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>已选模板：<strong>{selectedTpl?.name}</strong></span>
            <button type="button" onClick={() => setStep(1)} style={{ marginLeft: 'auto', fontSize: 12, color: '#7C3AED', background: 'none', border: '1px solid #7C3AED', borderRadius: 14, padding: '2px 10px', cursor: 'pointer' }}>更换模板</button>
          </div>
          {/* 搜索会员 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">搜索会员 *</label>
            <PatientSearchInput value={patientId} onChange={setPatientId} />
          </div>
          {/* 方案名称 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案名称 *</label>
            <input className="form-input" value={planTitle} onChange={e => setPlanTitle(e.target.value)} placeholder="营养干预方案名称" />
          </div>
          {/* 每日饮水 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">每日饮水量（毫升）</label>
            <input className="form-input" value={form.dailyWater} onChange={e => set('dailyWater', e.target.value)} placeholder="如：2000" />
          </div>
          {/* 三餐安排 */}
          {MEALS.map(m => (
            <div key={m.contentKey} style={{ border: '1px solid #ece8e0', borderRadius: 8, padding: 12, background: '#faf8f5' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#333', marginBottom: 8 }}>{m.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>进餐时间</div>
                  <input value={form[m.timeKey]} onChange={e => set(m.timeKey, e.target.value)} placeholder={m.timePlaceholder} style={iStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>食物内容</div>
                  <textarea rows={m.rows || 3} value={form[m.contentKey]} onChange={e => set(m.contentKey, e.target.value)} placeholder="食物种类、份量描述" style={{ ...iStyle, resize: 'vertical' }} />
                </div>
              </div>
            </div>
          ))}
          {/* 两栏简单字段 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { k: 'cookingMethod', l: '烹饪方式',   p: '推荐：蒸煮炖；避免：油炸' },
              { k: 'mealOrder',     l: '进餐顺序',   p: '如：汤→蔬菜→肉→主食' },
              { k: 'dietPrinciple', l: '膳食总原则', p: '如：低盐低脂、高纤维' },
            ].map(({ k, l, p }) => (
              <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{l}</label>
                <input className="form-input" value={form[k]} onChange={e => set(k, e.target.value)} placeholder={p} />
              </div>
            ))}
          </div>
          {/* 全宽 textarea */}
          {[
            { k: 'nutritionSupplements', l: '营养素补充建议', p: '营养素名称、剂量、用法', rows: 3 },
            { k: 'exerciseSuggestion',   l: '运动建议',       p: '运动类型、频率、时长、强度', rows: 3 },
            { k: 'allowedFoods',         l: '推荐食物',       p: '逗号分隔', rows: 2 },
            { k: 'forbiddenFoods',       l: '禁忌食物',       p: '逗号分隔', rows: 2 },
          ].map(({ k, l, p, rows }) => (
            <div key={k} className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{l}</label>
              <textarea className="form-input" rows={rows} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={p} />
            </div>
          ))}
          {/* 方案年度 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案年度</label>
            <input className="form-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>
          {/* 方案说明 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案说明</label>
            <textarea className="form-input" rows={3} placeholder="简要说明方案目标" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setStep(1)}>← 重新选模板</button>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '创建中...' : '创建营养干预方案'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 年度管理方案：两步创建弹窗 ───────────────────────────────────────
const ANNUAL_MGMT_TYPE_LABELS = {
  health_reshape:    '健康重塑方案',
  young_state:       '健康年轻态方案',
  chronic_stable:    '慢病维稳方案',
  health_prevention: '健康预防方案',
}
const ANNUAL_MGMT_TYPE_COLORS = {
  health_reshape:    { color: '#1E6B50', bg: '#E8F5EF' },
  young_state:       { color: '#7C3AED', bg: '#F3E8FF' },
  chronic_stable:    { color: '#DC2626', bg: '#FEF2F2' },
  health_prevention: { color: '#0077B6', bg: '#EFF6FF' },
}

function AnnualMgmtPlanModal({ onClose, onSaved }) {
  const [step, setStep]               = useState(1)
  const [templates, setTemplates]     = useState([])
  const [loadingTpls, setLoadingTpls] = useState(true)
  const [tplError, setTplError]       = useState('')
  const [selectedTpl, setSelectedTpl] = useState(null)

  const [patientId, setPatientId]     = useState('')
  const [planName, setPlanName]       = useState('')
  const [planDesc, setPlanDesc]       = useState('')
  const [planType, setPlanType]       = useState('')
  const [nodes, setNodes]             = useState([])  // { id, name, formId }
  const [year, setYear]               = useState(new Date().getFullYear())
  const [description, setDescription] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const [followupPlans, setFollowupPlans] = useState([])
  const [followupForms, setFollowupForms] = useState([])

  useEffect(() => {
    staffAPI.getPlanTemplates('health_management')
      .then(res => setTemplates(res.data || []))
      .catch(err => setTplError(err.message || '加载失败'))
      .finally(() => setLoadingTpls(false))
    Promise.all([staffAPI.getFollowupPlans(), staffAPI.getFollowupForms()])
      .then(([pr, fr]) => { setFollowupPlans(pr.data || []); setFollowupForms(fr.data || []) })
      .catch(() => {})
  }, [])

  const selectTemplate = (tpl) => {
    setSelectedTpl(tpl)
    const c = tpl.content || {}
    setPlanType(c.planType || '')
    setPlanName(c.planName || tpl.name || '')
    setPlanDesc(c.planDesc || '')
    setNodes((c.followUpPlans || []).map(fp => {
      const plan   = followupPlans.find(p => String(p._id) === String(fp.id))
      const raw    = plan?.formId
      const formId = raw?._id ? String(raw._id) : (raw ? String(raw) : null)
      return { id: fp.id, name: fp.name, formId }
    }))
    setStep(2); setError('')
  }

  const handleSubmit = async () => {
    if (!patientId)       { setError('请搜索并选择会员'); return }
    if (!planName.trim()) { setError('请填写方案名称'); return }
    setError(''); setSaving(true)
    try {
      const items = nodes.map(n => ({ name: n.name, category: '随访方案', itemId: n.id || null, itemType: 'followUpPlan', formId: n.formId || null }))
      await staffAPI.createPlan({ patientId, type: 'annual_mgmt', title: planName, description, year, items, content: { planType, moduleData: {} } })
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  const typeStyle = ANNUAL_MGMT_TYPE_COLORS[planType] || { color: '#1A2B24', bg: '#F0F0F0' }

  if (step === 1) return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 className="modal-title">新建年度管理方案 — 选择方案模板</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: 440, overflowY: 'auto' }}>
          {loadingTpls && <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>加载模板中...</div>}
          {tplError && <div style={{ color: '#DC3545', fontSize: 13, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>⚠️ {tplError}</div>}
          {!loadingTpls && !tplError && templates.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>暂无可用模板，请先在超管后台创建年度管理方案模板</div>}
          {templates.map(tpl => {
            const c = tpl.content || {}
            const ts = ANNUAL_MGMT_TYPE_COLORS[c.planType] || { color: '#666', bg: '#f0f0f0' }
            return (
              <div key={tpl._id} onClick={() => selectTemplate(tpl)}
                style={{ border: '1px solid #E0D9CE', borderRadius: 10, padding: '14px 18px', marginBottom: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                onMouseEnter={e => { e.currentTarget.style.border = `1px solid ${ts.color}`; e.currentTarget.style.background = ts.bg }}
                onMouseLeave={e => { e.currentTarget.style.border = '1px solid #E0D9CE'; e.currentTarget.style.background = '#fff' }}
              >
                <span style={{ fontSize: 26 }}>📋</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24' }}>{c.planName || tpl.name}</span>
                    {c.planType && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, fontWeight: 600, color: ts.color, background: ts.bg }}>{ANNUAL_MGMT_TYPE_LABELS[c.planType]}</span>}
                  </div>
                  {c.planDesc && <div style={{ fontSize: 12, color: '#8AA89C' }}>{c.planDesc}</div>}
                  <div style={{ fontSize: 12, color: '#4A6558', marginTop: 2 }}>随访方案节点：{c.followUpPlans?.length || 0} 个</div>
                </div>
                <span style={{ color: ts.color, fontSize: 18 }}>→</span>
              </div>
            )
          })}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>取消</button></div>
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">新建年度管理方案</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 已选模板 */}
          <div style={{ background: typeStyle.bg, borderRadius: 8, padding: '8px 14px', fontSize: 13, color: typeStyle.color, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>已选模板：<strong>{selectedTpl?.content?.planName || selectedTpl?.name}</strong></span>
            {planType && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, fontWeight: 600, color: typeStyle.color, border: `1px solid ${typeStyle.color}` }}>{ANNUAL_MGMT_TYPE_LABELS[planType]}</span>}
            <button type="button" onClick={() => setStep(1)} style={{ marginLeft: 'auto', fontSize: 12, color: typeStyle.color, background: 'none', border: `1px solid ${typeStyle.color}`, borderRadius: 14, padding: '2px 10px', cursor: 'pointer' }}>更换模板</button>
          </div>
          {/* 搜索会员 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">搜索会员 *</label>
            <PatientSearchInput value={patientId} onChange={setPatientId} />
          </div>
          {/* 方案名称 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案名称 *</label>
            <input className="form-input" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="年度管理方案名称" />
          </div>
          {/* 状态说明 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">状态说明</label>
            <input className="form-input" value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="方案适用场景或说明" />
          </div>
          {/* 随访方案节点列表 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>随访方案节点</span>
              <span style={{ fontWeight: 400, color: '#8AA89C', fontSize: 12 }}>共 {nodes.length} 个</span>
            </label>
            <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden', background: '#faf8f5' }}>
              {nodes.length === 0 && <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>暂无随访节点</div>}
              {nodes.map((n, idx) => (
                <div key={idx} style={{ padding: '8px 12px', borderBottom: '1px solid #F0EDE7' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, flexShrink: 0, fontWeight: 600, color: '#7C3AED', background: '#F3E8FF' }}>随访</span>
                    <input
                      value={n.name}
                      onChange={e => setNodes(prev => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                      style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', padding: 0 }}
                    />
                    <button type="button" onClick={() => setNodes(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16, padding: '0 2px' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#DC3545'}
                      onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                    >×</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 38 }}>
                    <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0, whiteSpace: 'nowrap' }}>随访表：</span>
                    <select
                      value={n.formId || ''}
                      onChange={e => setNodes(prev => prev.map((it, i) => i === idx ? { ...it, formId: e.target.value || null } : it))}
                      style={{ flex: 1, fontSize: 12, padding: '3px 8px', border: '1px solid #E0D9CE', borderRadius: 6, background: '#fff', color: n.formId ? '#1A2B24' : '#aaa' }}
                    >
                      <option value="">请选择随访表</option>
                      {followupForms.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* 方案年度 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案年度</label>
            <input className="form-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>
          {/* 方案说明 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案说明</label>
            <textarea className="form-input" rows={3} placeholder="简要说明方案目标" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setStep(1)}>← 重新选模板</button>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '创建中...' : '创建年度管理方案'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 年度体检方案：两步创建弹窗 ────────────────────────────────────────
function AnnualCheckupPlanModal({ onClose, onSaved }) {
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState([])
  const [loadingTpls, setLoadingTpls] = useState(true)
  const [tplError, setTplError] = useState('')
  const [selectedTpl, setSelectedTpl] = useState(null)

  // 表单字段
  const [patientId, setPatientId] = useState('')
  const [packageName, setPackageName] = useState('')
  const [packageDesc, setPackageDesc] = useState('')
  const [checkItems, setCheckItems] = useState([])   // { type, id, name }
  const [addons, setAddons] = useState([])            // { type, id, name, reason }
  const [year, setYear] = useState(new Date().getFullYear())
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 检查项目搜索
  const [showItemSearch, setShowItemSearch] = useState(false)
  const [itemQ, setItemQ] = useState('')
  const [itemResults, setItemResults] = useState([])
  const [itemSearching, setItemSearching] = useState(false)
  const itemTimer = useRef(null)

  // 加项库搜索
  const [showAddonSearch, setShowAddonSearch] = useState(false)
  const [addonQ, setAddonQ] = useState('')
  const [addonResults, setAddonResults] = useState([])
  const [addonSearching, setAddonSearching] = useState(false)
  const addonTimer = useRef(null)

  useEffect(() => {
    staffAPI.getPlanTemplates('annual_checkup')
      .then(res => setTemplates(res.data || []))
      .catch(err => setTplError(err.message || '加载失败'))
      .finally(() => setLoadingTpls(false))
  }, [])

  const selectTemplate = (tpl) => {
    setSelectedTpl(tpl)
    const c = tpl.content || {}
    setPackageName(c.packageName || tpl.name || '')
    setPackageDesc(c.packageDesc || '')
    setCheckItems((c.checkItems || []).map(ci => ({ ...ci })))
    setAddons((c.addons || []).map(a => ({ ...a })))
    setStep(2)
    setError('')
  }

  // 检查项目搜索
  const handleItemSearch = (q) => {
    setItemQ(q)
    clearTimeout(itemTimer.current)
    if (!q.trim()) { setItemResults([]); return }
    itemTimer.current = setTimeout(async () => {
      setItemSearching(true)
      try { const r = await staffAPI.getRequisitionItems(q); setItemResults(r.data || []) }
      catch {} finally { setItemSearching(false) }
    }, 300)
  }
  const addCheckItem = (item) => {
    setCheckItems(prev => [...prev, { type: item.type, id: item._id, name: item.name }])
    setItemQ(''); setItemResults([]); setShowItemSearch(false)
  }

  // 加项库搜索
  const handleAddonSearch = (q) => {
    setAddonQ(q)
    clearTimeout(addonTimer.current)
    if (!q.trim()) { setAddonResults([]); return }
    addonTimer.current = setTimeout(async () => {
      setAddonSearching(true)
      try { const r = await staffAPI.getRequisitionItems(q); setAddonResults(r.data || []) }
      catch {} finally { setAddonSearching(false) }
    }, 300)
  }
  const addAddon = (item) => {
    setAddons(prev => [...prev, { type: item.type, id: item._id, name: item.name, reason: '' }])
    setAddonQ(''); setAddonResults([]); setShowAddonSearch(false)
  }

  const handleSubmit = async () => {
    if (!patientId) { setError('请搜索并选择会员'); return }
    if (!packageName.trim()) { setError('请填写套餐名称'); return }
    setError(''); setSaving(true)
    try {
      const items = checkItems.map(ci => ({
        name: ci.name,
        category: ci.type === 'lab' ? '检验检查' : '影像检查',
        itemId: ci.id || null,
        itemType: ci.type === 'lab' ? 'labTest' : 'specialExam',
      }))
      await staffAPI.createPlan({
        patientId, type: 'annual_checkup', title: packageName,
        description, year, items,
        content: { packageName, packageDesc, checkItems, addons },
      })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  // 通用标签样式
  const typeTag = (t) => t === 'lab'
    ? { label: '检验', color: '#0077B6', bg: '#E8F4FD' }
    : { label: '检查', color: '#1E6B50', bg: '#E8F5EF' }

  // 内联搜索下拉
  const SearchDropdown = ({ results, searching, q, onSelect }) => (
    (searching || results.length > 0 || (q && !searching)) ? (
      <div style={{ border: '1px solid #E0D9CE', borderRadius: 6, background: '#fff', maxHeight: 180, overflowY: 'auto', marginTop: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
        {searching && <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>搜索中...</div>}
        {!searching && results.length === 0 && q && <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>无匹配结果</div>}
        {results.map((r, i) => {
          const tag = typeTag(r.type)
          return (
            <div key={i} onMouseDown={() => onSelect(r)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F8F6F2' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F0F9F4'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 3, fontWeight: 600, color: tag.color, background: tag.bg }}>{tag.label}</span>
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ fontSize: 11, color: '#1E6B50' }}>＋ 添加</span>
            </div>
          )
        })}
      </div>
    ) : null
  )

  // ── Step 1：模板选择 ──────────────────────────────────────────────
  if (step === 1) return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3 className="modal-title">新建体检方案 — 选择套餐模板</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: 480, overflowY: 'auto' }}>
          {loadingTpls && <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>加载模板中...</div>}
          {tplError && <div style={{ color: '#DC3545', fontSize: 13, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>⚠️ {tplError}</div>}
          {!loadingTpls && !tplError && templates.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>暂无可用模板，请先在超管后台创建年度体检方案模板</div>
          )}
          {templates.map(tpl => {
            const c = tpl.content || {}
            const name = c.packageName || tpl.name
            const desc = c.packageDesc || ''
            const count = c.checkItems?.length || 0
            return (
              <div key={tpl._id} onClick={() => selectTemplate(tpl)}
                style={{
                  border: '1px solid #E0D9CE', borderRadius: 10, padding: '14px 18px',
                  marginBottom: 10, cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
                onMouseEnter={e => { e.currentTarget.style.border = '1px solid #1E6B50'; e.currentTarget.style.background = '#F0F9F4' }}
                onMouseLeave={e => { e.currentTarget.style.border = '1px solid #E0D9CE'; e.currentTarget.style.background = '#fff' }}
              >
                <span style={{ fontSize: 28 }}>🔬</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24' }}>{name}</div>
                  {desc && <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>{desc}</div>}
                  <div style={{ fontSize: 12, color: '#4A6558', marginTop: 4 }}>
                    包含 <strong>{count}</strong> 项检查项目
                    {(c.addons?.length > 0) && <span style={{ marginLeft: 8, color: '#8AA89C' }}>· {c.addons.length} 项可选加项</span>}
                  </div>
                </div>
                <span style={{ color: '#1E6B50', fontSize: 18 }}>→</span>
              </div>
            )
          })}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )

  // ── Step 2：完整表单 ──────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">新建体检方案</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 已选模板提示 */}
          <div style={{ background: '#E8F5EF', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#1E6B50', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>已选套餐：<strong>{selectedTpl?.content?.packageName || selectedTpl?.name}</strong></span>
            <button type="button" onClick={() => setStep(1)}
              style={{ marginLeft: 'auto', fontSize: 12, color: '#1E6B50', background: 'none', border: '1px solid #1E6B50', borderRadius: 14, padding: '2px 10px', cursor: 'pointer' }}>
              更换模板
            </button>
          </div>

          {/* 搜索会员 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">搜索会员 *</label>
            <PatientSearchInput value={patientId} onChange={setPatientId} />
          </div>

          {/* 套餐名称 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">套餐名称 *</label>
            <input className="form-input" value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="如：心脑血管深度筛查套餐" />
          </div>

          {/* 状态说明 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">状态说明</label>
            <input className="form-input" value={packageDesc} onChange={e => setPackageDesc(e.target.value)} placeholder="套餐描述" />
          </div>

          {/* 包含检查项目 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>包含检查项目</span>
              <span style={{ fontWeight: 400, color: '#8AA89C', fontSize: 12 }}>共 {checkItems.length} 项</span>
            </label>
            <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, background: '#faf8f5', overflow: 'hidden' }}>
              {checkItems.length === 0 && <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>暂无检查项目</div>}
              {checkItems.map((ci, idx) => {
                const tag = typeTag(ci.type)
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid #F0EDE7', fontSize: 13 }}>
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, flexShrink: 0, fontWeight: 600, color: tag.color, background: tag.bg }}>{tag.label}</span>
                    <input
                      value={ci.name}
                      onChange={e => setCheckItems(prev => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                      style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', padding: 0 }}
                    />
                    <button type="button" onClick={() => setCheckItems(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16, padding: '0 2px' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#DC3545'}
                      onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                    >×</button>
                  </div>
                )
              })}
              {/* 添加区 */}
              <div style={{ padding: '8px 12px', background: '#fff', borderTop: checkItems.length > 0 ? '1px solid #F0EDE7' : 'none' }}>
                {!showItemSearch ? (
                  <button type="button" onClick={() => setShowItemSearch(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1E6B50', fontSize: 12, padding: 0, fontWeight: 500 }}>
                    ＋ 从检验/检查库添加
                  </button>
                ) : (
                  <div>
                    <div style={{ position: 'relative' }}>
                      <input className="form-input" autoFocus value={itemQ} onChange={e => handleItemSearch(e.target.value)}
                        placeholder="搜索检验/检查项目名称..." style={{ fontSize: 12, paddingRight: 44 }} />
                      <button type="button" onClick={() => { setShowItemSearch(false); setItemQ(''); setItemResults([]) }}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 12 }}>
                        取消
                      </button>
                    </div>
                    <SearchDropdown results={itemResults} searching={itemSearching} q={itemQ} onSelect={addCheckItem} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 可选加项库 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>可选加项库</span>
              <span style={{ fontWeight: 400, color: '#8AA89C', fontSize: 12 }}>共 {addons.length} 项</span>
            </label>
            <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, background: '#faf8f5', overflow: 'hidden' }}>
              {addons.length === 0 && <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>暂无加项</div>}
              {addons.map((a, idx) => {
                const tag = typeTag(a.type)
                return (
                  <div key={idx} style={{ padding: '8px 12px', borderBottom: '1px solid #F0EDE7' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, flexShrink: 0, fontWeight: 600, color: tag.color, background: tag.bg }}>{tag.label}</span>
                      <input
                        value={a.name}
                        onChange={e => setAddons(prev => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', padding: 0 }}
                      />
                      <button type="button" onClick={() => setAddons(prev => prev.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16, padding: '0 2px' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#DC3545'}
                        onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                      >×</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, paddingLeft: 42 }}>
                      <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>推荐原因：</span>
                      <input
                        value={a.reason || ''}
                        onChange={e => setAddons(prev => prev.map((it, i) => i === idx ? { ...it, reason: e.target.value } : it))}
                        placeholder="选填说明"
                        style={{ flex: 1, border: 'none', borderBottom: '1px solid #E0D9CE', outline: 'none', background: 'transparent', fontSize: 12, fontFamily: 'inherit', padding: '2px 0' }}
                      />
                    </div>
                  </div>
                )
              })}
              <div style={{ padding: '8px 12px', background: '#fff', borderTop: addons.length > 0 ? '1px solid #F0EDE7' : 'none' }}>
                {!showAddonSearch ? (
                  <button type="button" onClick={() => setShowAddonSearch(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1E6B50', fontSize: 12, padding: 0, fontWeight: 500 }}>
                    ＋ 添加可选加项
                  </button>
                ) : (
                  <div>
                    <div style={{ position: 'relative' }}>
                      <input className="form-input" autoFocus value={addonQ} onChange={e => handleAddonSearch(e.target.value)}
                        placeholder="搜索可选加项名称..." style={{ fontSize: 12, paddingRight: 44 }} />
                      <button type="button" onClick={() => { setShowAddonSearch(false); setAddonQ(''); setAddonResults([]) }}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 12 }}>
                        取消
                      </button>
                    </div>
                    <SearchDropdown results={addonResults} searching={addonSearching} q={addonQ} onSelect={addAddon} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 方案年度 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案年度</label>
            <input className="form-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>

          {/* 方案说明 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案说明</label>
            <textarea className="form-input" rows={3} placeholder="简要说明方案目标" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setStep(1)}>← 重新选模板</button>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '创建中...' : '创建体检方案'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 自由文本新增一行项目
function AddFreeItem({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')
  const submit = () => {
    const name = val.trim()
    if (!name) return
    onAdd(name)
    setVal('')
    setOpen(false)
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1E6B50', fontSize: 12, padding: 0, fontWeight: 500 }}>
        ＋ 添加项目
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        placeholder="输入项目内容后按 Enter 添加"
        style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid #E0D9CE', borderRadius: 6, outline: 'none' }}
      />
      <button type="button" onClick={submit}
        style={{ fontSize: 12, padding: '4px 10px', background: '#1E6B50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}>
        添加
      </button>
      <button type="button" onClick={() => { setOpen(false); setVal('') }}
        style={{ fontSize: 12, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
        取消
      </button>
    </div>
  )
}

function NewPlanModal({ onClose, onSaved, type }) {
  const [patientId, setPatientId]     = useState('')
  const [templateId, setTemplateId]   = useState('')
  const [year, setYear]               = useState(new Date().getFullYear())
  const [description, setDescription] = useState('')
  const [items, setItems]             = useState([])
  const [templates, setTemplates]     = useState([])
  const [loadingTpls, setLoadingTpls] = useState(true)   // 初始 true 避免首帧闪"暂无模板"
  const [tplError, setTplError]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [freeTitle, setFreeTitle]     = useState('')   // 无模板时的纯文字标题

  // 随访方案 + 随访表（annual_mgmt 专用）
  const [followupPlans, setFollowupPlans] = useState([])
  const [followupForms, setFollowupForms] = useState([])

  // 搜索添加项目（仅 annual_checkup 用）
  const [showSearch, setShowSearch]       = useState(false)
  const [searchQ, setSearchQ]             = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]         = useState(false)
  const searchTimer = useRef(null)

  const tplType    = TEMPLATE_TYPE_MAP[type] || type
  const modalTitle = MODAL_TITLE[type] || '新建方案'

  // 加载模板列表
  useEffect(() => {
    setLoadingTpls(true)
    setTplError('')
    staffAPI.getPlanTemplates(tplType)
      .then(res => setTemplates(res.data || []))
      .catch(err => setTplError(err.message || '加载失败，请刷新重试'))
      .finally(() => setLoadingTpls(false))
  }, [tplType])

  // annual_mgmt：加载随访方案库 + 随访表库
  useEffect(() => {
    if (type !== 'annual_mgmt') return
    Promise.all([
      staffAPI.getFollowupPlans(),
      staffAPI.getFollowupForms(),
    ]).then(([plansRes, formsRes]) => {
      setFollowupPlans(plansRes.data || [])
      setFollowupForms(formsRes.data || [])
    }).catch(() => {})
  }, [type])

  // 切换模板时重置 items（annual_mgmt 需等随访方案加载完毕）
  useEffect(() => {
    const tpl = templates.find(t => t._id === templateId) || null
    if (!tpl) {
      setItems([])
      setShowSearch(false); setSearchQ(''); setSearchResults([])
      return
    }
    if (tpl.type === 'health_management') {
      // 把 followUpPlan 记录中的 formId 一并带入 items
      setItems((tpl.content?.followUpPlans || []).map(fp => {
        const plan     = followupPlans.find(p => String(p._id) === String(fp.id))
        const rawForm  = plan?.formId           // 已 populate：{ _id, name } 或纯 ObjectId 字符串
        const formId   = rawForm?._id ? String(rawForm._id) : (rawForm ? String(rawForm) : null)
        return {
          name:     fp.name,
          category: '随访方案',
          itemId:   fp.id   || null,
          itemType: 'followUpPlan',
          formId:   formId,
        }
      }))
    } else {
      setItems(templateToItems(tpl))
    }
    setShowSearch(false); setSearchQ(''); setSearchResults([])
  }, [templateId, templates, followupPlans])

  const selectedTpl = templates.find(t => t._id === templateId) || null
  const desc = selectedTpl?.content?.planDesc || selectedTpl?.content?.packageDesc || ''

  // 删除单个项目
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  // 切换某个随访节点的关联随访表
  const changeItemForm = (idx, formId) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, formId: formId || null } : item
    ))
  }

  // 搜索检验/检查项目
  const handleSearch = (q) => {
    setSearchQ(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await staffAPI.getRequisitionItems(q)
        setSearchResults(r.data || [])
      } catch {}
      finally { setSearching(false) }
    }, 300)
  }

  // 从库里添加项目
  const addFromLibrary = (item) => {
    setItems(prev => [...prev, {
      name:     item.name,
      category: item.type === 'lab' ? '检验检查' : '影像检查',
      itemId:   item._id || null,
      itemType: item.type === 'lab' ? 'labTest' : 'specialExam',
    }])
    setSearchQ('')
    setSearchResults([])
    setShowSearch(false)
  }

  const noTemplates = !loadingTpls && templates.length === 0

  const handleSubmit = async () => {
    if (!patientId) { setError('请搜索并选择会员'); return }
    let title, content, planItems
    if (noTemplates) {
      // 降级：无模板时直接用自填标题创建
      if (!freeTitle.trim()) { setError('请填写方案名称'); return }
      title = freeTitle.trim()
      content = {}
      planItems = []
    } else {
      if (!templateId) { setError('请选择方案套餐'); return }
      title = getTemplateTitle(selectedTpl)
      if (!title) { setError('所选模板没有名称，请联系管理员'); return }
      const tplContent = selectedTpl?.content || {}
      content = type === 'annual_mgmt'
        ? { planType: tplContent.planType || '', moduleData: {} }
        : tplContent
      planItems = items
    }
    setError('')
    setSaving(true)
    try {
      await staffAPI.createPlan({ patientId, type, title, description, year, items: planItems, content })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // item 的类型标签
  const itemTag = (item) => {
    const isLab = item.itemType === 'labTest' || item.category === '检验检查'
    const isFollowUp = item.category === '随访方案'
    if (isFollowUp) return { label: '随访', color: '#7C3AED', bg: '#F3E8FF' }
    if (isLab)      return { label: '检验', color: '#0077B6', bg: '#E8F4FD' }
    return           { label: '检查', color: '#1E6B50', bg: '#E8F5EF' }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">{modalTitle}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 搜索会员 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">搜索会员 *</label>
            <PatientSearchInput value={patientId} onChange={setPatientId} />
          </div>

          {/* 方案类型（从模板库选）*/}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案类型 *</label>
            {loadingTpls ? (
              <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>加载模板中...</div>
            ) : tplError ? (
              <div style={{ color: '#DC3545', fontSize: 13, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>
                ⚠️ {tplError}（请退出重新登录后再试）
              </div>
            ) : templates.length === 0 ? (
              <div style={{ color: '#D97706', fontSize: 13, padding: '8px 12px', background: '#FEF9EC', borderRadius: 8 }}>
                暂无可用模板，请先在超管后台创建方案模板
              </div>
            ) : (
              <select className="form-input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                <option value="">请选择方案套餐</option>
                {templates.map(t => (
                  <option key={t._id} value={t._id}>
                    {t.content?.packageName || t.content?.planName || t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 模板描述 */}
          {desc && (
            <div style={{ background: '#E8F5EF', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1E6B50' }}>
              {desc}
            </div>
          )}

          {/* ── 可编辑项目列表（选中模板后显示）── */}
          {templateId && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  {type === 'annual_checkup' ? '检查项目' : type === 'annual_mgmt' ? '随访方案节点' : '方案项目'}
                </span>
                <span style={{ fontWeight: 400, color: '#8AA89C', fontSize: 12 }}>
                  共 {items.length} 项，可删减或增加
                </span>
              </label>
              <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden', background: '#faf8f5' }}>

                {/* 项目列表 */}
                {items.length === 0 && (
                  <div style={{ padding: '12px 14px', color: '#aaa', fontSize: 12, textAlign: 'center' }}>
                    暂无项目，可点击下方"＋ 添加项目"添加
                  </div>
                )}
                <div>
                  {items.map((item, idx) => {
                    const tag = itemTag(item)
                    const isFollowUpNode = item.itemType === 'followUpPlan'
                    return (
                      <div key={idx} style={{ borderBottom: '1px solid #F0EDE7', padding: '8px 12px' }}>
                        {/* 节点名称行（名称可直接编辑）*/}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, flexShrink: 0, fontWeight: 600, color: tag.color, background: tag.bg }}>
                            {tag.label}
                          </span>
                          <input
                            value={item.name}
                            onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#1A2B24', fontFamily: 'inherit', padding: 0 }}
                            placeholder="请填写项目内容"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 17, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                            onMouseEnter={e => e.currentTarget.style.color = '#DC3545'}
                            onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
                            title="删除此项"
                          >×</button>
                        </div>
                        {/* 随访表选择（仅随访节点类型）*/}
                        {isFollowUpNode && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 38 }}>
                            <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0, whiteSpace: 'nowrap' }}>随访表：</span>
                            <select
                              value={item.formId || ''}
                              onChange={e => changeItemForm(idx, e.target.value)}
                              onClick={e => e.stopPropagation()}
                              style={{
                                flex: 1, fontSize: 12, padding: '3px 8px',
                                border: '1px solid #E0D9CE', borderRadius: 6, background: '#fff',
                                color: item.formId ? '#1A2B24' : '#aaa',
                              }}
                            >
                              <option value="">请选择随访表</option>
                              {followupForms.map(f => (
                                <option key={f._id} value={f._id}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 添加项目区 */}
                <div style={{ padding: '8px 12px', borderTop: items.length > 0 ? '1px solid #F0EDE7' : 'none', background: '#fff' }}>
                  {!showSearch ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      {/* 所有类型都支持自由文本新增 */}
                      <AddFreeItem onAdd={name => setItems(prev => [...prev, { name, category: type === 'annual_checkup' ? '检验检查' : '方案项目' }])} />
                      {/* 年度体检额外支持从检验/检查库搜索 */}
                      {type === 'annual_checkup' && (
                        <button type="button" onClick={() => setShowSearch(true)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A6558', fontSize: 12, padding: 0, whiteSpace: 'nowrap' }}>
                          从检验库搜索
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="form-input"
                          autoFocus
                          value={searchQ}
                          onChange={e => handleSearch(e.target.value)}
                          placeholder="搜索检验/检查项目名称..."
                          style={{ fontSize: 12, paddingRight: 44 }}
                        />
                        <button type="button" onClick={() => { setShowSearch(false); setSearchQ(''); setSearchResults([]) }}
                          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 12 }}>
                          取消
                        </button>
                      </div>
                      {(searching || searchResults.length > 0 || (searchQ && !searching)) && (
                        <div style={{ border: '1px solid #E0D9CE', borderRadius: 6, background: '#fff', maxHeight: 180, overflowY: 'auto', marginTop: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                          {searching && <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>搜索中...</div>}
                          {!searching && searchResults.length === 0 && searchQ && (
                            <div style={{ padding: '10px 14px', color: '#aaa', fontSize: 12 }}>无匹配结果</div>
                          )}
                          {searchResults.map((r, i) => (
                            <div key={i} onMouseDown={() => addFromLibrary(r)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F8F6F2' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#F0F9F4'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 3, fontWeight: 600, color: r.type === 'lab' ? '#0077B6' : '#1E6B50', background: r.type === 'lab' ? '#E8F4FD' : '#E8F5EF' }}>
                                {r.type === 'lab' ? '检验' : '检查'}
                              </span>
                              <span style={{ flex: 1 }}>{r.name}</span>
                              <span style={{ fontSize: 11, color: '#1E6B50' }}>＋ 添加</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 方案年度 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案年度</label>
            <input className="form-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>

          {/* 方案说明 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">方案说明</label>
            <textarea className="form-input" rows={3} placeholder="简要说明方案目标" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '创建中...' : '创建方案'}
          </button>
        </div>
      </div>
    </div>
  )
}
