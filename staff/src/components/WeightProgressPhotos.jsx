import React, { useEffect, useMemo, useState } from 'react'
import { staffAPI } from '../api'

const stages = { before: '管理前', progress: '阶段记录', after: '管理后' }
const views = { front: '正面', side: '侧面', back: '背面' }
const today = () => new Date().toLocaleDateString('en-CA')
const dayOf = value => value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) : ''

export default function WeightProgressPhotos({ patientId, plans = [], records = [], bodyCompHistory = [], canEdit = false }) {
  const [rows, setRows] = useState([])
  const [planId, setPlanId] = useState('all')
  const [stage, setStage] = useState('before')
  const [view, setView] = useState('front')
  const [takenOn, setTakenOn] = useState(today())
  const [photo, setPhoto] = useState(null)
  const [consent, setConsent] = useState(false)
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nutritionPlans = useMemo(() => plans.filter(plan => plan.type === 'nutrition'), [plans])
  const load = async () => {
    try { const result = await staffAPI.getWeightProgressPhotos(patientId); setRows(result.data || []); setError('') }
    catch (err) { setError(err.message || '照片加载失败') }
  }
  useEffect(() => { load() }, [patientId])
  const shown = rows.filter(row => planId === 'all' || String(row.planId || '') === planId)
  const left = shown.find(row => row.id === leftId)
  const right = shown.find(row => row.id === rightId)
  const upload = async event => {
    event.preventDefault()
    if (!photo || !consent) return
    const form = event.currentTarget
    setBusy(true); setError('')
    try {
      await staffAPI.addWeightProgressPhoto(patientId, { planId: planId === 'all' ? '' : planId, stage, view, takenOn, consentConfirmed: true }, photo)
      setPhoto(null); setConsent(false); form.reset(); await load()
    } catch (err) { setError(err.message || '照片上传失败') }
    finally { setBusy(false) }
  }
  const remove = async row => {
    if (!window.confirm('确认移除这张照片？操作记录会保留。')) return
    setBusy(true); setError('')
    try { await staffAPI.deleteWeightProgressPhoto(patientId, row.id); await load() }
    catch (err) { setError(err.message || '移除失败') }
    finally { setBusy(false) }
  }
  const measuresFor = row => {
    if (!row) return ''
    const sameDay = records.filter(record => dayOf(record.recordedAt) === row.takenOn)
    const weight = sameDay.find(record => record.type === 'weight')?.value
    const waist = sameDay.find(record => record.type === 'waist')?.value
    const composition = bodyCompHistory.find(record => dayOf(record.measuredAt || record.recordedAt) === row.takenOn)
    return [weight && `体重 ${weight} kg`, waist && `腰围 ${waist} cm`, composition?.weight && `体成分体重 ${composition.weight} kg`,
      composition?.skelMuscle && `骨骼肌 ${composition.skelMuscle} kg`, composition?.bodyFatRate && `体脂率 ${composition.bodyFatRate}%`,
      composition?.visceralFat && `内脏脂肪 ${composition.visceralFat}级`].filter(Boolean).join(' · ')
  }
  const compare = (row, label) => <div style={{ flex: '1 1 250px', minWidth: 0, background: '#F7FAF8', padding: 12, borderRadius: 10 }}>
    <strong>{label}</strong>
    {row ? <><img src={row.url} alt={`${stages[row.stage]}${views[row.view]}`} style={{ display: 'block', width: '100%', maxHeight: 350, objectFit: 'contain', marginTop: 8 }} />
      <small>{row.takenOn} · {stages[row.stage]} · {views[row.view]}</small>
      <p style={{ fontSize: 12, color: '#52675D' }}>同日记录：{measuresFor(row) || '暂无可核对数据'}</p></> : <p style={{ color: '#789087' }}>请选择照片</p>}
  </div>
  return <section style={{ borderTop: '1px solid #E4ECE7', padding: '20px' }}>
    <h3 style={{ margin: '0 0 6px' }}>体型照片</h3>
    <p style={{ color: '#65776F', fontSize: 13, margin: '0 0 14px' }}>按营养管理周期保存人物照。仅用于本人健康管理和人工前后对照，不自动判断效果。</p>
    <label>所属周期 <select className="form-input" value={planId} onChange={event => { setPlanId(event.target.value); setLeftId(''); setRightId('') }} style={{ maxWidth: 320, marginLeft: 8 }}>
      <option value="all">全部周期</option>
      <option value="">尚未关联营养方案</option>
      {nutritionPlans.map(plan => <option key={plan._id} value={plan._id}>{plan.title} · {new Date(plan.createdAt).toLocaleDateString('zh-CN')}</option>)}
    </select></label>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error} <button type="button" onClick={load}>重试</button></p>}
    {canEdit && <form onSubmit={upload} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end', margin: '16px 0' }}>
      <label>阶段<select className="form-input" value={stage} onChange={event => setStage(event.target.value)}>{Object.entries(stages).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>角度<select className="form-input" value={view} onChange={event => setView(event.target.value)}>{Object.entries(views).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>拍摄日期<input className="form-input" type="date" required max={today()} value={takenOn} onChange={event => setTakenOn(event.target.value)} /></label>
      <label>照片<input className="form-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required onChange={event => setPhoto(event.target.files?.[0] || null)} /></label>
      <label style={{ flex: '1 1 100%', fontSize: 13 }}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> 已向客户说明体型照的存档和对比用途，并确认客户同意</label>
      <button className="btn btn-primary btn-sm" disabled={busy || !photo || !consent}>{busy ? '保存中…' : '保存照片'}</button>
    </form>}
    {shown.length ? <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '14px 0' }}>{shown.map(row => <div key={row.id} style={{ width: 115, fontSize: 12 }}>
        <img src={row.url} alt={`${stages[row.stage]}${views[row.view]}`} style={{ width: 110, height: 120, objectFit: 'cover', borderRadius: 7 }} />
        <div>{row.takenOn}<br />{stages[row.stage]} · {views[row.view]}<br />{nutritionPlans.find(plan => plan._id === String(row.planId || ''))?.title || '未关联方案'}</div>
        {canEdit && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(row)}>移除</button>}
      </div>)}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label>对比左侧<select className="form-input" value={leftId} onChange={event => setLeftId(event.target.value)}><option value="">选择照片</option>{shown.map(row => <option key={row.id} value={row.id}>{row.takenOn} · {stages[row.stage]} · {views[row.view]}</option>)}</select></label>
        <label>对比右侧<select className="form-input" value={rightId} onChange={event => setRightId(event.target.value)}><option value="">选择照片</option>{shown.map(row => <option key={row.id} value={row.id}>{row.takenOn} · {stages[row.stage]} · {views[row.view]}</option>)}</select></label>
      </div>
      {(left || right) && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>{compare(left, '左侧')}{compare(right, '右侧')}</div>}
    </> : <p style={{ color: '#789087', fontSize: 13 }}>本周期尚无体型照片。</p>}
  </section>
}
