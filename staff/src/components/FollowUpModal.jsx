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

// 预设随访主题
const THEME_OPTIONS = [
  '异常复查', '日常血压监测', '日常体重监测', '血糖监测',
  '用药提醒', '生活方式指导', '营养干预跟进', '心理疏导',
  '运动康复跟进', '疫苗接种提醒',
]

// 主题对应的内容模板
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

// 打卡项目选项
const CHECKIN_ITEM_OPTIONS = [
  { v: 'bloodPressure', l: '血压' },
  { v: 'bloodSugar',    l: '血糖' },
  { v: 'heartRate',     l: '心率' },
  { v: 'weight',        l: '体重' },
  { v: 'sleep',         l: '睡眠' },
  { v: 'diet',          l: '饮食' },
  { v: 'exercise',      l: '运动' },
  { v: 'water',         l: '饮水' },
  { v: 'alcohol',       l: '饮酒' },
]

// 主题对应的默认打卡项目
const THEME_DEFAULT_CHECKIN = {
  '日常血压监测': ['bloodPressure'],
  '日常体重监测': ['weight'],
  '血糖监测':     ['bloodSugar'],
  '生活方式指导': ['diet', 'exercise', 'water'],
  '营养干预跟进': ['diet', 'weight'],
  '运动康复跟进': ['exercise'],
  '异常复查':     ['bloodPressure', 'bloodSugar'],
}

// 空行模板
const emptyRow = () => ({
  id: Date.now() + Math.random(),
  date: today(),
  theme: '',
  content: '',
  assignedTo: '',
  checkInItems: [],
})

export default function FollowUpModal({ patientId, patientName, defaultTheme, onClose, onSaved }) {
  const [staffList, setStaffList] = useState([])
  const [mode, setMode] = useState(defaultTheme ? 'plan' : 'record')  // record | plan
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 单条记录模式
  const [form, setForm] = useState({
    patientId: patientId || '',
    date: today(),
    type: 'phone',
    theme: '',
    content: '',
    assignedTo: '',
  })

  // 计划模式：多行
  const [planRows, setPlanRows] = useState([{ ...emptyRow(), theme: defaultTheme || '' }])
  const [planPatientId, setPlanPatientId] = useState(patientId || '')

  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data)).catch(() => {})
  }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const applyTemplate = (theme) => {
    if (THEME_TEMPLATES[theme]) {
      setForm(f => ({ ...f, theme, content: f.content ? f.content : THEME_TEMPLATES[theme] }))
    } else {
      setForm(f => ({ ...f, theme }))
    }
  }

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

  const handlePlanSubmit = async () => {
    const pid = planPatientId
    if (!pid) { setError('请选择会员'); return }
    const validRows = planRows.filter(r => r.date)
    if (validRows.length === 0) { setError('请至少填写一行计划时间'); return }
    setSaving(true); setError('')
    try {
      await Promise.all(validRows.map(row =>
        staffAPI.createFollowUp({
          patientId: pid,
          date: row.date,
          type: 'phone',
          status: 'planned',
          theme: row.theme,
          content: row.content,
          assignedTo: row.assignedTo || null,
          checkInItems: row.checkInItems || [],
        })
      ))
      onSaved()
    } catch (err) {
      setError(err.message || '保存失败')
    } finally { setSaving(false) }
  }

  const updateRow = (id, key, val) => {
    setPlanRows(rows => rows.map(r => r.id === id ? { ...r, [key]: val } : r))
    if (key === 'theme') {
      setPlanRows(rows => rows.map(r => {
        if (r.id !== id) return r
        const defaults = THEME_DEFAULT_CHECKIN[val] || []
        return {
          ...r,
          theme: val,
          content: r.content || (THEME_TEMPLATES[val] || ''),
          checkInItems: r.checkInItems?.length > 0 ? r.checkInItems : defaults,
        }
      }))
    }
  }

  const toggleCheckinItem = (rowId, itemVal) => {
    setPlanRows(rows => rows.map(r => {
      if (r.id !== rowId) return r
      const current = r.checkInItems || []
      const next = current.includes(itemVal)
        ? current.filter(v => v !== itemVal)
        : [...current, itemVal]
      return { ...r, checkInItems: next }
    }))
  }

  const addRow = () => setPlanRows(rows => [...rows, emptyRow()])
  const removeRow = (id) => setPlanRows(rows => rows.filter(r => r.id !== id))

  const staffOptions = staffList.map(s => (
    <option key={s._id} value={s._id}>{s.name} · {s.roleLabel || s.role}</option>
  ))

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {patientName ? `随访 · ${patientName}` : '随访'}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 模式切换 */}
        <div style={{ display: 'flex', gap: 0, margin: '0 20px 16px', borderRadius: 8, overflow: 'hidden', border: '1px solid #E0D9CE' }}>
          {[{ key: 'record', label: '📝 记录随访' }, { key: 'plan', label: '📅 新建计划' }].map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => { setMode(m.key); setError('') }}
              style={{
                flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                background: mode === m.key ? '#1E6B50' : '#f9f7f3',
                color: mode === m.key ? '#fff' : '#4A6558',
              }}
            >{m.label}</button>
          ))}
        </div>

        {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}

        {/* ── 记录随访模式 ── */}
        {mode === 'record' && (
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 会员选择 */}
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
                  <option value="phone">电话</option>
                  <option value="wechat">微信</option>
                  <option value="visit">上门</option>
                  <option value="video">视频</option>
                  <option value="other">其他</option>
                </select>
              </div>
            </div>

            {/* 随访主题 */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">随访主题</label>
              <select className="form-input" value={form.theme} onChange={e => applyTemplate(e.target.value)}>
                <option value="">-- 请选择主题 --</option>
                {THEME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* 随访内容 */}
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

            {/* 随访人员 */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">随访人员（可选，默认为当前登录人）</label>
              <select className="form-input" value={form.assignedTo} onChange={set('assignedTo')}>
                <option value="">-- 当前登录人 --</option>
                {staffOptions}
              </select>
            </div>
          </div>
        )}

        {/* ── 新建计划模式 ── */}
        {mode === 'plan' && (
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!patientId && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">搜索会员 *</label>
                <PatientSearchInput
                  value={planPatientId}
                  onChange={pid => setPlanPatientId(pid)}
                />
              </div>
            )}

            <div style={{ fontSize: 13, color: '#8AA89C', background: '#f9f7f3', borderRadius: 8, padding: '8px 12px' }}>
              💡 每行生成一条「计划中」随访任务，推送到对应人员的随访记录中
            </div>

            {/* 多行计划 */}
            {planRows.map((row, idx) => (
              <div key={row.id} style={{ background: '#f9f7f3', borderRadius: 10, padding: 14, position: 'relative' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 10 }}>
                  计划 {idx + 1}
                </div>
                {planRows.length > 1 && (
                  <button type="button" onClick={() => removeRow(row.id)}
                    style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 16, color: '#DC3545', cursor: 'pointer' }}>
                    ✕
                  </button>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: 12 }}>计划时间 *</label>
                    <input className="form-input" type="date" value={row.date}
                      onChange={e => updateRow(row.id, 'date', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: 12 }}>随访主题</label>
                    <select className="form-input" value={row.theme} onChange={e => updateRow(row.id, 'theme', e.target.value)}>
                      <option value="">-- 选择主题 --</option>
                      {THEME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="form-label" style={{ fontSize: 12, marginBottom: 0 }}>随访内容</label>
                    {row.theme && THEME_TEMPLATES[row.theme] && (
                      <button type="button" onClick={() => updateRow(row.id, 'content', THEME_TEMPLATES[row.theme])}
                        style={{ fontSize: 11, color: '#1E6B50', background: 'none', border: '1px solid #1E6B50', borderRadius: 4, padding: '1px 8px', cursor: 'pointer' }}>
                        填入模板
                      </button>
                    )}
                  </div>
                  <textarea className="form-input" rows={3} value={row.content}
                    onChange={e => updateRow(row.id, 'content', e.target.value)}
                    placeholder="计划随访内容..." style={{ resize: 'vertical' }} />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 12 }}>计划人员</label>
                  <select className="form-input" value={row.assignedTo}
                    onChange={e => updateRow(row.id, 'assignedTo', e.target.value)}>
                    <option value="">-- 当前登录人 --</option>
                    {staffOptions}
                  </select>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>今日打卡项目（推送给会员）</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {CHECKIN_ITEM_OPTIONS.map(opt => {
                      const selected = (row.checkInItems || []).includes(opt.v)
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => toggleCheckinItem(row.id, opt.v)}
                          style={{
                            padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                            border: selected ? '1px solid #1E6B50' : '1px solid #E0D9CE',
                            background: selected ? '#1E6B50' : '#f9f7f3',
                            color: selected ? '#fff' : '#4A6558',
                            fontWeight: selected ? 600 : 400,
                          }}
                        >{opt.l}</button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 4 }}>
                    选中的项目将在会员端"今日健康打卡"中显示
                  </div>
                </div>
              </div>
            ))}

            <button type="button" onClick={addRow}
              style={{ padding: '10px', borderRadius: 8, border: '1px dashed #1E6B50', background: 'none',
                color: '#1E6B50', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
              ＋ 新增一行随访计划
            </button>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary"
            onClick={mode === 'record' ? handleSingleSubmit : handlePlanSubmit}
            disabled={saving}>
            {saving ? '保存中...' : mode === 'record' ? '保存随访记录' : `创建 ${planRows.filter(r => r.date).length} 条计划`}
          </button>
        </div>
      </div>
    </div>
  )
}
