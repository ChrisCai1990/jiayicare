import React, { useState, useEffect, useRef } from 'react'
import { staffAPI } from '../api'

// ── 会员搜索组件（按姓名或手机号实时搜索） ────────────────────────────
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
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', border: '1px solid #1E6B50', borderRadius: 8,
          background: '#E8F5EF', fontSize: 14,
        }}>
          <span>
            <span style={{ fontWeight: 600, color: '#1A2B24' }}>{selectedName.split('  ')[0]}</span>
            <span style={{ color: '#8AA89C', marginLeft: 8, fontSize: 13 }}>{selectedName.split('  ')[1]}</span>
          </span>
          <button type="button" onClick={handleClear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input className="form-input" type="text" value={keyword} onChange={handleInput}
            onFocus={() => keyword && setOpen(true)}
            placeholder="输入姓名或手机号搜索..." autoComplete="off" />
          {searching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa' }}>搜索中...</span>}
        </div>
      )}
      {open && !value && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto', marginTop: 4,
        }}>
          {results.length === 0 && keyword && !searching && (
            <div style={{ padding: '12px 16px', color: '#aaa', fontSize: 13 }}>未找到匹配会员</div>
          )}
          {results.length === 0 && !keyword && (
            <div style={{ padding: '12px 16px', color: '#aaa', fontSize: 13 }}>请输入姓名或手机号</div>
          )}
          {results.map(p => (
            <div key={p._id} onMouseDown={() => handleSelect(p)}
              style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #F5F2EC' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F6F0'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1E6B50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{p.name?.[0] || '?'}</div>
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

const today = () => new Date().toISOString().slice(0, 10)

// 计算 N 天后的日期
const addDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + parseInt(n, 10))
  return d.toISOString().slice(0, 10)
}

// 预设随访主题（记录模式用）
const THEME_OPTIONS = [
  '异常复查', '日常血压监测', '日常体重监测', '血糖监测',
  '用药提醒', '生活方式指导', '营养干预跟进', '心理疏导',
  '运动康复跟进', '疫苗接种提醒',
]

const THEME_TEMPLATES = {
  '异常复查': '本次随访主要确认上次检查异常指标复查情况。\n复查结果：\n会员反馈：\n建议：',
  '日常血压监测': '本次随访记录日常血压情况。\n血压读数：\n会员自述症状：\n用药情况：\n建议：',
  '日常体重监测': '本次随访记录体重变化情况。\n当前体重：\n较上次变化：\n饮食运动情况：\n建议：',
  '血糖监测': '本次随访记录血糖情况。\n血糖读数：\n饮食控制情况：\n用药情况：\n建议：',
  '用药提醒': '本次随访确认用药依从性。\n当前用药：\n用药情况：\n不良反应：\n建议：',
  '生活方式指导': '本次随访进行生活方式干预指导。\n饮食情况：\n运动情况：\n睡眠情况：\n改善建议：',
  '营养干预跟进': '本次随访跟进营养干预执行情况。\n饮食计划执行情况：\n体重/指标变化：\n问题与调整：',
  '心理疏导': '本次随访进行心理状态评估与疏导。\n情绪状态：\n主要困扰：\n疏导内容：\n下次建议：',
  '运动康复跟进': '本次随访跟进运动康复计划执行情况。\n运动完成情况：\n疼痛/不适情况：\n功能改善：\n调整建议：',
  '疫苗接种提醒': '本次随访提醒疫苗接种计划。\n建议接种疫苗：\n接种时间建议：\n注意事项：',
}

// 计划模式每行空模板
const emptyRow = () => ({
  id: Date.now() + Math.random(),
  daysAfter: '',   // X天后（与 date 二选一）
  date: '',        // 具体日期
  assignedTo: '',  // 计划人员
  notes: '',       // 备注
})

const TYPE_OPTIONS = [
  { v: 'phone',  l: '电话' },
  { v: 'wechat', l: '微信' },
  { v: 'visit',  l: '上门' },
  { v: 'video',  l: '视频' },
  { v: 'other',  l: '其他' },
]

export default function FollowUpModal({ patientId, patientName, defaultTheme, onClose, onSaved }) {
  const [staffList, setStaffList] = useState([])
  const [followupForms, setFollowupForms] = useState([])
  const [mode, setMode] = useState('plan')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── 记录模式状态 ──
  const [form, setForm] = useState({
    patientId: patientId || '',
    date: today(),
    type: 'phone',
    theme: '',
    content: '',
    assignedTo: '',
  })

  // ── 计划模式状态 ──
  const [planName, setPlanName] = useState('')
  const [visitTypeForm, setVisitTypeForm] = useState(true)       // 表单随访
  const [visitTypeRevisit, setVisitTypeRevisit] = useState(false) // 复诊随访
  const [planFormId, setPlanFormId] = useState('')
  const [planRows, setPlanRows] = useState([emptyRow()])
  const [planPatientId, setPlanPatientId] = useState(patientId || '')
  // 打卡任务
  const [checkInItems, setCheckInItems] = useState([])
  // 随访方案模板选择
  const [followupPlans, setFollowupPlans] = useState([])
  const [selectedSchemeId, setSelectedSchemeId] = useState('')
  const [schemeFormData, setSchemeFormData] = useState({}) // 预设内容（可编辑）

  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data)).catch(() => {})
    staffAPI.getFollowupForms().then(r => setFollowupForms(r.data || [])).catch(() => {})
    staffAPI.getFollowupPlans().then(r => setFollowupPlans(r.data || [])).catch(() => {})
  }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const applyTemplate = (theme) => {
    if (THEME_TEMPLATES[theme]) {
      setForm(f => ({ ...f, theme, content: f.content ? f.content : THEME_TEMPLATES[theme] }))
    } else {
      setForm(f => ({ ...f, theme }))
    }
  }

  // 选择随访方案模板后，自动填充方案名称、关联表单、预设内容
  const handleSchemeChange = (schemeId) => {
    setSelectedSchemeId(schemeId)
    if (!schemeId) {
      setSchemeFormData({})
      return
    }
    const scheme = followupPlans.find(p => p._id === schemeId)
    if (!scheme) return
    if (scheme.name) setPlanName(scheme.name)
    if (scheme.formId?._id) {
      setPlanFormId(scheme.formId._id)
      setVisitTypeForm(true)
    }
    setSchemeFormData(scheme.default_content || {})
  }

  // ── 记录模式提交 ──
  const handleSingleSubmit = async (e) => {
    if (e) e.preventDefault()
    const pid = form.patientId
    if (!pid) { setError('请选择会员'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createFollowUp({
        patientId: pid,
        date: form.date,
        type: form.type,
        status: 'completed',
        theme: form.theme,
        content: form.content,
        assignedTo: form.assignedTo || null,
      })
      onSaved()
    } catch (err) {
      setError(err.message || '保存失败')
    } finally { setSaving(false) }
  }

  // ── 计划模式提交 ──
  const handlePlanSubmit = async () => {
    const pid = planPatientId
    if (!pid) { setError('请选择会员'); return }
    if (!planName.trim()) { setError('请填写方案名称'); return }
    if (!visitTypeForm && !visitTypeRevisit) { setError('请至少选择一种随访类型'); return }
    const validRows = planRows.filter(r => r.daysAfter || r.date)
    if (validRows.length === 0) { setError('请至少填写一行随访时间'); return }
    setSaving(true); setError('')
    try {
      await Promise.all(validRows.map(row => {
        const resolvedDate = row.date
          ? row.date
          : row.daysAfter ? addDays(parseInt(row.daysAfter, 10)) : today()
        return staffAPI.createFollowUp({
          patientId: pid,
          date: resolvedDate,
          type: 'phone',
          status: 'planned',
          theme: planName,
          content: row.notes,
          assignedTo: row.assignedTo || null,
          formId: visitTypeForm ? (planFormId || null) : null,
          followUpSchemeId: selectedSchemeId || null,
          formData: Object.keys(schemeFormData).length > 0 ? schemeFormData : null,
          checkInItems: checkInItems.length > 0 ? checkInItems : undefined,
        })
      }))
      onSaved()
    } catch (err) {
      setError(err.message || '保存失败')
    } finally { setSaving(false) }
  }

  // ── 计划行操作 ──
  const updateRow = (id, key, val) =>
    setPlanRows(rows => rows.map(r => r.id === id ? { ...r, [key]: val } : r))

  // 填天数时清日期，填日期时清天数（互斥）
  const setRowDaysAfter = (id, val) =>
    setPlanRows(rows => rows.map(r =>
      r.id === id ? { ...r, daysAfter: val, date: val ? '' : r.date } : r
    ))

  const setRowDate = (id, val) =>
    setPlanRows(rows => rows.map(r =>
      r.id === id ? { ...r, date: val, daysAfter: val ? '' : r.daysAfter } : r
    ))

  const addRow = () => setPlanRows(rows => [...rows, emptyRow()])
  const removeRow = (id) => {
    if (planRows.length <= 1) return
    setPlanRows(rows => rows.filter(r => r.id !== id))
  }

  const staffOptions = staffList.map(s => (
    <option key={s._id} value={s._id}>{s.name} · {s.roleLabel || s.role}</option>
  ))

  const validPlanCount = planRows.filter(r => r.daysAfter || r.date).length

  // ── 按钮样式 ──
  const btnMinus = (disabled) => ({
    width: 28, height: 28, borderRadius: 6,
    border: `1px solid ${disabled ? '#E0D9CE' : '#DC3545'}`,
    background: '#fff',
    color: disabled ? '#ccc' : '#DC3545',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 18, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, padding: 0,
  })

  const btnPlus = {
    width: 28, height: 28, borderRadius: 6,
    border: '1px solid #1E6B50',
    background: '#fff', color: '#1E6B50',
    cursor: 'pointer', fontSize: 18, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, padding: 0,
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 800, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {patientName ? `随访 · ${patientName}` : '随访'}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>


        {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}

        {/* ══════════════════════════════════
            记录随访模式（不改动）
        ══════════════════════════════════ */}
        {mode === 'record' && (
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!patientId && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">搜索会员 *</label>
                <PatientSearchInput
                  value={form.patientId}
                  onChange={pid => setForm(f => ({ ...f, patientId: pid }))}
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">随访日期</label>
                <input className="form-input" type="date" value={form.date} onChange={set('date')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">随访方式</label>
                <select className="form-input" value={form.type} onChange={set('type')}>
                  {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">随访主题</label>
              <select className="form-input" value={form.theme} onChange={e => applyTemplate(e.target.value)}>
                <option value="">-- 请选择主题 --</option>
                {THEME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>随访内容</label>
                {form.theme && THEME_TEMPLATES[form.theme] && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, content: THEME_TEMPLATES[f.theme] }))}
                    style={{ fontSize: 12, color: '#1E6B50', background: 'none', border: '1px solid #1E6B50', borderRadius: 6, padding: '2px 10px', cursor: 'pointer' }}>
                    填入模板
                  </button>
                )}
              </div>
              <textarea
                className="form-input" rows={5}
                placeholder="记录随访的主要内容、会员反馈、建议等..."
                value={form.content} onChange={set('content')}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">随访人员（可选，默认为当前登录人）</label>
              <select className="form-input" value={form.assignedTo} onChange={set('assignedTo')}>
                <option value="">-- 当前登录人 --</option>
                {staffOptions}
              </select>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            新建计划模式（重构）
        ══════════════════════════════════ */}
        {mode === 'plan' && (
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 会员选择 */}
            {!patientId && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">搜索会员 *</label>
                <PatientSearchInput value={planPatientId} onChange={pid => setPlanPatientId(pid)} />
              </div>
            )}

            {/* 选择随访方案模板（可选） */}
            {followupPlans.length > 0 && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">随访方案模板（可选）</label>
                <select
                  className="form-input"
                  value={selectedSchemeId}
                  onChange={e => handleSchemeChange(e.target.value)}
                >
                  <option value="">-- 不使用模板 --</option>
                  {followupPlans.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
                {selectedSchemeId && (
                  <div style={{ fontSize: 11, color: '#1E6B50', marginTop: 4 }}>
                    ✓ 已选择方案，方案名称和表单预设内容已自动填充
                  </div>
                )}
              </div>
            )}

            {/* 方案名称 */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">方案名称 *</label>
              <input
                className="form-input"
                value={planName}
                onChange={e => setPlanName(e.target.value)}
                placeholder="如：高血压月度随访"
              />
            </div>

            {/* 随访类型 */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">随访类型 *</label>
              <div style={{ display: 'flex', gap: 28, alignItems: 'center', marginTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={visitTypeForm}
                    onChange={e => setVisitTypeForm(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#1E6B50', cursor: 'pointer' }}
                  />
                  <span>表单随访</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={visitTypeRevisit}
                    onChange={e => setVisitTypeRevisit(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#1E6B50', cursor: 'pointer' }}
                  />
                  <span>复诊随访</span>
                </label>
              </div>
            </div>

            {/* 打卡任务设置 */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">打卡任务（可选）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {[
                  { key: 'diet',          label: '饮食' },
                  { key: 'exercise',      label: '运动' },
                  { key: 'sleep',         label: '睡眠' },
                  { key: 'alcohol',       label: '烟酒' },
                  { key: 'weight',        label: '体重' },
                  { key: 'bloodPressure', label: '血压' },
                  { key: 'bloodSugar',    label: '血糖' },
                  { key: 'heartRate',     label: '心率' },
                  { key: 'water',         label: '饮水' },
                ].map(({ key, label }) => {
                  const checked = checkInItems.includes(key)
                  return (
                    <label key={key} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 13,
                      border: `1.5px solid ${checked ? '#1E6B50' : '#E0D9CE'}`,
                      background: checked ? '#E8F5EF' : '#fff',
                      color: checked ? '#1E6B50' : '#4A6558',
                      fontWeight: checked ? 600 : 400,
                      userSelect: 'none',
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => setCheckInItems(prev =>
                          e.target.checked ? [...prev, key] : prev.filter(k => k !== key)
                        )}
                        style={{ display: 'none' }}
                      />
                      {checked ? '✓ ' : ''}{label}
                    </label>
                  )
                })}
              </div>
              {checkInItems.length > 0 && (
                <div style={{ fontSize: 11, color: '#1E6B50', marginTop: 4 }}>
                  已选 {checkInItems.length} 项，将出现在会员首页今日打卡
                </div>
              )}
            </div>

            {/* 关联随访表单（仅表单随访时显示） */}
            {visitTypeForm && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">随访表单</label>
                <select className="form-input" value={planFormId} onChange={e => { setPlanFormId(e.target.value); if (!selectedSchemeId) setSchemeFormData({}) }}>
                  <option value="">-- 不使用表单 --</option>
                  {followupForms.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                </select>
                {planFormId && (
                  <div style={{ fontSize: 11, color: '#1E6B50', marginTop: 4 }}>
                    ✓ 已关联「{followupForms.find(f => f._id === planFormId)?.name}」
                  </div>
                )}
              </div>
            )}

            {/* 动态表单字段预设内容（选了方案模板 或 直接选了随访表单时显示） */}
            {(() => {
              const scheme = followupPlans.find(p => p._id === selectedSchemeId)
              // 优先用方案关联的表单，如没有则用直接选择的表单
              const fields = scheme?.formId?.fields
                || (planFormId ? followupForms.find(f => f._id === planFormId)?.fields : null)
              if (!fields?.length) return null
              return (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    随访表单内容
                    <span style={{ fontSize: 11, color: '#8AA89C', fontWeight: 400, marginLeft: 6 }}>填写后将随随访计划保存</span>
                  </label>
                  <div style={{ background: '#F9F6F0', border: '1px solid #E0D9CE', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {fields.map((field, fi) => (
                      <div key={fi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#4A6558', fontWeight: 500 }}>
                          {field.label}
                          {field.required && <span style={{ color: '#DC3545' }}> *</span>}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            className="form-input"
                            rows={3}
                            style={{ fontSize: 13, resize: 'vertical' }}
                            value={schemeFormData[field.label] || ''}
                            onChange={e => setSchemeFormData(d => ({ ...d, [field.label]: e.target.value }))}
                          />
                        ) : field.type === 'radio' && field.options?.length > 0 ? (
                          <select
                            className="form-input"
                            style={{ fontSize: 13 }}
                            value={schemeFormData[field.label] || ''}
                            onChange={e => setSchemeFormData(d => ({ ...d, [field.label]: e.target.value }))}
                          >
                            <option value="">-- 请选择 --</option>
                            {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : field.type === 'checkbox' && field.options?.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {field.options.map(opt => {
                              const cur = schemeFormData[field.label] || []
                              const checked = Array.isArray(cur) ? cur.includes(opt) : false
                              return (
                                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                                  <input type="checkbox" checked={checked}
                                    style={{ accentColor: '#1E6B50' }}
                                    onChange={e => setSchemeFormData(d => ({
                                      ...d,
                                      [field.label]: e.target.checked
                                        ? [...(Array.isArray(cur) ? cur : []), opt]
                                        : (Array.isArray(cur) ? cur : []).filter(v => v !== opt)
                                    }))}
                                  />
                                  {opt}
                                </label>
                              )
                            })}
                          </div>
                        ) : field.type === 'date' ? (
                          <input
                            className="form-input"
                            type="date"
                            style={{ fontSize: 13 }}
                            value={schemeFormData[field.label] || ''}
                            onChange={e => setSchemeFormData(d => ({ ...d, [field.label]: e.target.value }))}
                          />
                        ) : (
                          <input
                            className="form-input"
                            type={field.type === 'number' ? 'number' : 'text'}
                            style={{ fontSize: 13 }}
                            value={schemeFormData[field.label] || ''}
                            onChange={e => setSchemeFormData(d => ({ ...d, [field.label]: e.target.value }))}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* ── 计划随访时间 ── */}
            <div>
              {planRows.map((row, idx) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 0',
                    borderBottom: '1px solid #F5F2EC',
                  }}
                >
                  {/* 行标签 */}
                  <span style={{ fontSize: 13, color: '#1A2B24', width: 96, flexShrink: 0, lineHeight: 1.4 }}>
                    <span style={{ color: '#DC2626' }}>* </span>计划随访时间
                  </span>

                  {/* 随访时间（天数） */}
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    placeholder="随访时间"
                    value={row.daysAfter}
                    onChange={e => setRowDaysAfter(row.id, e.target.value)}
                    style={{ fontSize: 13, width: 88, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, color: '#4A6558', whiteSpace: 'nowrap', lineHeight: 1.3, flexShrink: 0 }}>
                    天后随访<br />
                    <span style={{ fontSize: 10, color: '#aaa' }}>（不含当天）</span>
                  </span>

                  {/* 具体日期 */}
                  <input
                    className="form-input"
                    type="date"
                    value={row.date}
                    onChange={e => setRowDate(row.id, e.target.value)}
                    style={{ fontSize: 13, flex: 1, minWidth: 0 }}
                  />

                  {/* 随访人员 */}
                  <select
                    className="form-input"
                    value={row.assignedTo}
                    onChange={e => updateRow(row.id, 'assignedTo', e.target.value)}
                    style={{ fontSize: 13, width: 110, flexShrink: 0 }}
                  >
                    <option value="">随访人员</option>
                    {staffOptions}
                  </select>

                  {/* 备注 */}
                  <input
                    className="form-input"
                    placeholder="备注"
                    value={row.notes}
                    onChange={e => updateRow(row.id, 'notes', e.target.value)}
                    style={{ fontSize: 13, flex: 1, minWidth: 0 }}
                  />

                  {/* ± 按钮 */}
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    style={{
                      ...btnMinus(false),
                      visibility: planRows.length === 1 ? 'hidden' : 'visible',
                      flexShrink: 0,
                    }}
                  >−</button>
                  {idx === planRows.length - 1 && (
                    <button type="button" onClick={addRow} style={{ ...btnPlus, flexShrink: 0 }}>+</button>
                  )}
                </div>
              ))}

              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 8 }}>
                💡 填天数将从今天起计算随访日期；或直接选择具体日期，两者互斥
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            onClick={mode === 'record' ? handleSingleSubmit : handlePlanSubmit}
            disabled={saving}
          >
            {saving
              ? '保存中...'
              : mode === 'record'
              ? '保存随访记录'
              : `创建 ${validPlanCount} 条计划`}
          </button>
        </div>
      </div>
    </div>
  )
}
