import DateField from '../../../shared/DateField.jsx'
import './AnnualServiceRecommendations.css'
import serviceReminder from '../../../shared/annualServiceReminder.cjs'
import DentalGiftCard from './DentalGiftCard'
import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const EMPTY = { finding: '', evidence: '', recommendation: '', timeframe: '', plannedFollowUpDate:'', followUpReminderEnabled:true, appointmentDate:'', nextStep: '', selectedOptions: [] }
const INPUTS = [
  ['finding', '发现的问题', '如：体检记录提示牙结石'],
  ['evidence', '客观依据', '填写报告名称、日期或已核实的记录'],
  ['recommendation', '服务项目', '如：洁牙服务'],
  ['timeframe', '建议时机', '如：近期，可与客户商量'],
  ['plannedFollowUpDate', '计划跟进日期', '工作人员联系、协调的计划日期'],
  ['appointmentDate', '预约服务日期', '与机构确认后填写，暂未确定可留空'],
  ['nextStep', '下一步说明', '如：具体洁牙方式由接诊口腔医生确定'],
]

export default function AnnualServiceRecommendations({ planId, pushedAt, canEdit, toast, patient, staffList=[] }) {

  const person = field => patient?.[field]?.name || staffList.find(s=>String(s._id)===String(patient?.[field]?._id||patient?.[field]))?.name || '待分配'
  const adult = Number(patient?.age) >= 18
  const visibleOption = option => !adult || !/儿童|少儿|幼儿/.test(option.name || '') || /成人|家庭|全家/.test(option.name || '')
  const summary = option => [...new Set(String(option.includedService||'').split(/[；;\n]/).map(x=>x.trim()).filter(x=>x&&(!adult||!/儿童|少儿|幼儿/.test(x))))].join('；')
  const optionCard = option => <div className="service-option-card"><strong>{option.name}</strong>{option.address&&<div>{option.address}</div>}{summary(option)&&<div>{summary(option)}</div>}{typeof option.price==='number'&&<small>目录价 ¥{option.price} · 实际价格以确认为准</small>}{adult&&/儿童|少儿|幼儿/.test(option.includedService||'')&&<details><summary>组合套餐完整内容</summary><div>{option.includedService}</div></details>}</div>
  const [rows, setRows] = useState([])
  const [draft, setDraft] = useState(EMPTY)
  const [editingId, setEditingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [catalog, setCatalog] = useState([])
  const [gift, setGift] = useState(null)
  const [suggested, setSuggested] = useState(false)
  const [loadError, setLoadError] = useState('')
  const targetId = new URLSearchParams(window.location.search).get('recommendationId')
  useEffect(() => {
    if (!targetId || !rows.some(row => row._id === targetId)) return
    const frame = requestAnimationFrame(() => document.getElementById('service-recommendation-' + targetId)?.scrollIntoView?.({ block: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [targetId, rows])
  useEffect(() => {
    let active = true
    setGift(null); setDraft(EMPTY); setEditingId(''); setCatalog([]); setRows([]); setSuggested(false); setLoadError('')
    if (!planId) { setRows([]); return () => { active = false } }
    staffAPI.getAnnualServiceRecommendations(planId).then(res => { if (active) { setRows(res.data || []); setCatalog(res.catalog || []); setGift(res.dentalGift || null); if (res.suggestions?.length) { setDraft({ ...EMPTY, ...res.suggestions[0] }); setSuggested(true) } } }).catch(err => { if (active) setLoadError(err.message || '读取服务建议失败') })
    return () => { active = false }
  }, [planId])

  const reset = () => { setEditingId(''); setDraft(EMPTY); setSuggested(false) }
  const save = async () => {
    if (!draft.finding.trim() || !draft.evidence.trim() || !draft.recommendation.trim()) { toast('请填写发现的问题、客观依据和服务建议'); return }
    setBusy(true)
    try {
      const res = editingId
        ? await staffAPI.updateAnnualServiceRecommendation(planId, editingId, draft)
        : await staffAPI.addAnnualServiceRecommendation(planId, draft)
      setRows(prev => editingId ? prev.map(row => row._id === editingId ? res.data : row) : [...prev, res.data])
      reset()
      toast('建议草稿已保存；单独发布后客户才能看到')
    } catch (err) { toast(err.message || '保存服务建议失败') }
    finally { setBusy(false) }
  }
  const publish = async row => {
    if (!pushedAt) { toast('请先审核并推送年度方案'); return }
    if (!window.confirm(`确认向客户发布「${row.recommendation}」？发布后不能覆盖原文。`)) return
    setBusy(true)
    try {
      const res = await staffAPI.publishAnnualServiceRecommendation(planId, row._id)
      setRows(prev => prev.map(item => item._id === row._id ? res.data : item))
      if (editingId === row._id) reset()
      toast('服务建议已发布；已开启的跟进提醒到期进入工作台，不自动创建服务或订单')
    } catch (err) { toast(err.message || '发布失败') }
    finally { setBusy(false) }
  }
  const markHandled = async row => {
    const note = window.prompt('请记录实际联系结果或已发起的服务（不会自动创建订单）：')
    if (note === null) return
    if (!note.trim()) { toast('请填写实际处理记录'); return }
    setBusy(true)
    try {
      const res = await staffAPI.handleAnnualServiceRecommendation(planId, row._id, note.trim())
      setRows(prev => prev.map(item => item._id === row._id ? res.data : item))
      toast('跟进结果已记录，对应待办将关闭')
    } catch (err) { toast(err.message || '记录处理失败') }
    finally { setBusy(false) }
  }

  return <details open={targetId ? true : undefined} key={planId || 'unsaved'} className="annual-service-card">
    <summary className="annual-service-card__summary"><span>服务建议 <small>非执行任务</small></span><span className="annual-service-card__chevron">⌄</span></summary>
    <div className="annual-service-card__body">
    <div style={{ fontSize: 12, color: '#6B8177', margin: '5px 0 14px' }}>健康顾问核实依据后单独发布。客户选择“需要协助”只记录意向；具体服务仍须由工作人员按现有流程发起。</div>
    {!planId && <div style={{ color: '#8AA89C', fontSize: 13 }}>请先保存年度方案，再添加服务建议。</div>}
    {loadError && <p role="alert" style={{color: '#b42318'}}>{loadError}</p>}
    <div className="service-option-card">服务建议跟进：{person('assignedFamilyDoctor')}（健康顾问） · 预约协调：{person('assignedHealthPlanner')}（健康规划师）</div>
    {gift && <DentalGiftCard key={`${planId}:${gift.revision}`} gift={gift} planId={planId} canEdit={canEdit} onChange={setGift} toast={toast} />}
    {rows.map(row => <div id={`service-recommendation-${row._id}`} key={row._id} style={{ borderTop: '1px solid #E8EEE9', padding: '12px 0', fontSize: 13, lineHeight: 1.7 }}>
      <div><strong>{row.recommendation}</strong> <span style={{ color: row.status === 'published' ? '#1E6B50' : '#D97706' }}>· {row.status === 'published' ? '已发布' : '草稿'}</span></div>
      <div>发现：{row.finding}；依据：{row.evidence}</div>
      {(row.selectedOptions || []).filter(visibleOption).map(option => <div key={`${option.type}:${option.id}`}>{optionCard(option)}</div>)}
      {row.timeframe && <div>建议时机：{row.timeframe}</div>}
      <div>计划跟进日期：{row.plannedFollowUpDate || '待安排'} · 预约服务日期：{row.appointmentDate || '待确认'}</div>
      {row.followUpReminderEnabled && row.plannedFollowUpDate && <div>到期提醒：已开启（健康顾问工作台）</div>}
      {row.nextStep && <div>下一步：{row.nextStep}</div>}
      {row.status === 'published' && <div style={{ color: '#1E6B50' }}>客户选择：{row.response === 'interested' ? '需要协助，请人工联系并发起服务' : row.response === 'declined' ? '暂不安排' : '尚未选择'}</div>}
      {row.handledAt && <div style={{ color: '#6B8177' }}>已处理：{row.handlingNote}</div>}
      {canEdit && serviceReminder.actionable(row) && <button className="service-button" type="button" disabled={busy} onClick={() => markHandled(row)}>记录联系或服务发起结果</button>}
      {canEdit && row.status === 'draft' && <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <button className="service-button" type="button" disabled={busy} onClick={() => { setEditingId(row._id); setDraft(Object.fromEntries(Object.keys(EMPTY).map(key => [key, key === 'followUpReminderEnabled' ? row[key] === true : row[key] || EMPTY[key]]))) }}>编辑草稿</button>
        <button className="service-button" type="button" disabled={busy || !pushedAt} onClick={() => publish(row)}>发布给客户</button>
      </div>}
    </div>)}
    {planId && canEdit && <div style={{ borderTop: '1px solid #E8EEE9', paddingTop: 12 }}>
      <strong style={{ fontSize: 13 }}>{editingId ? '编辑服务建议' : suggested ? '报告已带入：牙结石 → 洁牙服务' : '新增服务建议'}</strong>
      <label style={{ display: 'block', marginTop: 10, fontSize: 13 }}><input type="checkbox" checked={draft.followUpReminderEnabled === true} onChange={e => setDraft(prev => ({ ...prev, followUpReminderEnabled: e.target.checked }))} /> 按计划跟进日期提醒健康顾问（填写日期并发布后生效，不创建服务订单）</label>
      {INPUTS.map(([key, label, placeholder]) => <label key={key} style={{ display: 'block', fontSize: 12, color: '#4A6558', marginTop: 10 }}>
        {label}{['finding', 'evidence', 'recommendation'].includes(key) ? ' *' : ''}
        <DateField type={key.endsWith('Date')?'date':'text'} value={draft[key]} onChange={event => setDraft(prev => ({ ...prev, [key]: event.target.value }))} placeholder={placeholder} style={{ display: 'block', boxSizing: 'border-box', width: '100%', maxWidth:key.endsWith('Date')?320:undefined, marginTop: 4, padding: '8px 10px', border: '1px solid #D9E2DC', borderRadius: 7 }} />
        {key.endsWith('Date') && <small style={{display:'block',marginTop:4,color:'#77877e'}}>{placeholder}{key==='plannedFollowUpDate'?'；发布后可按此日期提醒健康顾问联系客户。':''}</small>}
      </label>)}
      <fieldset disabled={busy || !!loadError} style={{border: '1px solid #d9e2dc', borderRadius: 8, margin: '14px 0', padding: 12}}>
        <legend>可选机构及套餐（顾问确认）</legend>
        <p style={{fontSize: 12, color: '#6B8177'}}>选择服务机构或套餐；年卡、组合套餐需核对适用人群及包含次数；如属会员赠送，优先核对并使用已有权益。</p>
        {!catalog.length && <p>暂无匹配的口腔机构或洁牙套餐，待顾问补充目录。</p>}
        {catalog.filter(visibleOption).map(option => { const checked=(draft.selectedOptions||[]).some(item=>item.type===option.type&&item.id===option.id); return <div key={`${option.type}:${option.id}`} className="service-option-choice"><input aria-label={`选择${option.name}`} type="checkbox" checked={checked} onChange={event=>setDraft(prev=>({...prev,selectedOptions:event.target.checked?[...(prev.selectedOptions||[]),option]:prev.selectedOptions.filter(item=>item.type!==option.type||item.id!==option.id)}))}/>{optionCard(option)}</div> })}
      </fieldset>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}><button className="service-button service-button--primary" type="button" disabled={busy || !!loadError} onClick={save}>确认并保存建议草稿</button>{editingId && <button className="service-button" type="button" onClick={reset}>取消编辑</button>}</div>
    </div>}
    </div>
  </details>
}
