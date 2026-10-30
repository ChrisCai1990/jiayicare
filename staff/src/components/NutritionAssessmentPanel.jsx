import React, { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff, useToast } from '../App'
import DateField from '../../../shared/DateField.jsx'
import AssignedNutritionAssessmentForm from './AssignedNutritionAssessmentForm'

const labels = { awaiting_booking: '待预约', booked: '已预约 · 待营养师评估', completed: '已完成', cancelled: '已取消' }
const actionLabels = { requested: '顾问发起需求', booked: '健管确认预约', rescheduled: '健管调整预约', completed: '营养师完成评估', cancelled: '顾问取消需求' }
const localInput = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const dateTime = value => value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const defaultForm = { reason: '', focus: '', preferredAt: '', sourceOrderId: '', at: '', mode: 'online', meetingRoom: '', store: '', note: '', summary: '', recommendations: '' }
const card = { border: '1px solid #DCE9E1', borderRadius: 12, padding: 14, background: '#fff' }
const field = { display: 'grid', gap: 5, fontSize: 13, color: '#52685D' }

export default function NutritionAssessmentPanel({ patientId = '', source = 'nutrition_management', sourcePlanId = '', canCreate = false, compact = false, embedded = false, workbench = false, hideWhenEmpty = false }) {
  const nav = useNavigate()
  const location = useLocation()
  const { staff } = useStaff()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [config, setConfig] = useState(null)
  const [eligibleOrders, setEligibleOrders] = useState([])
  const [filter, setFilter] = useState('active')
  const [form, setForm] = useState(defaultForm)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [cancelId, setCancelId] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (patientId) setEditingId(new URLSearchParams(location.search).get('assessmentId') || '')
  }, [patientId, location.search])
  const load = useCallback(async () => {
    try {
      const result = await staffAPI.getNutritionAssessments({ ...(patientId ? { patientId } : {}) })
      setRows(result.data || [])
      setError('')
    } catch (err) { setError(err.message || '营养评估进度加载失败') }
  }, [patientId])
  useEffect(() => { load(); staffAPI.getNutritionAssessmentConfig().then(result => setConfig(result.data)).catch(() => {}) }, [load])
  useEffect(() => {
    if (!patientId || source !== 'paid_order' || !canCreate) return
    staffAPI.getNutritionAssessmentEligibleOrders(patientId).then(result => setEligibleOrders(result.data || [])).catch(() => setEligibleOrders([]))
  }, [patientId, source, canCreate, rows])
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const run = async (fn, success) => {
    setBusy(true)
    try { await fn(); toast(success); setEditingId(''); setCancelId(''); setCancelReason(''); setCreateOpen(false); setForm(defaultForm); await load() }
    catch (err) { toast(err.message || '操作失败'); await load() }
    finally { setBusy(false) }
  }
  const actionable = row => row.status === 'awaiting_booking' && (staff?.role === 'healthManager' || staff?.role === 'superadmin')
    || row.status === 'booked' && (staff?.role === 'nutritionist' || staff?.role === 'superadmin')
    || row.status === 'completed' && row.orderSettlementStatus === 'needs_review' && (staff?.role === 'nutritionist' || staff?.role === 'superadmin')
  const scopedRows = (sourcePlanId ? rows.filter(row => String(row.sourcePlanId?._id || row.sourcePlanId || '') === String(sourcePlanId)) : rows)
    .filter(row => !workbench || actionable(row))
  const visible = scopedRows.filter(row => filter === 'all' || (filter === 'active' ? !['completed', 'cancelled'].includes(row.status) || row.orderSettlementStatus === 'needs_review' : row.status === 'completed' && row.orderSettlementStatus !== 'needs_review'))
  if (!['familyDoctor', 'healthPlanner', 'healthManager', 'nutritionist', 'superadmin'].includes(staff?.role)) return null
  if (workbench && !visible.length && !error) return null
  if (hideWhenEmpty && !rows.length && !error && !createOpen) return null
  return <section className={embedded ? '' : 'card'} style={embedded ? { borderTop: '1px solid #E3ECE7', marginTop: 12 } : { marginBottom: 18 }}>
    <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <div><div className="card-title">{embedded ? '营养评估' : config?.requestTitle || '营养评估'}{patientId ? '进度' : '服务事项'}</div><div style={{ color: '#718578', fontSize: 12, marginTop: 4 }}>{source === 'paid_order' ? '订单已到健康规划师工作台 → 健管预约 → 营养师评估' : '健康顾问发起 → 健管预约 → 营养师评估'}；可查看完整流转记录</div></div>
      {canCreate && config?.enabled === true && (source === 'paid_order' ? ['healthPlanner', 'superadmin'] : ['familyDoctor', 'superadmin']).includes(staff?.role) && <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(value => !value)}>{createOpen ? '收起需求单' : source === 'nutrition_plan' ? '发起营养复评' : source === 'paid_order' ? '转交单次营养评估' : '发起单次营养评估'}</button>}
    </div>
    <div className="card-body" style={{ display: 'grid', gap: 12 }}>
      {createOpen && config?.enabled !== false && <div style={{ ...card, background: '#F7FBF8', display: 'grid', gap: 10 }}>
        <strong>{config?.requestTitle || '营养评估需求单'} · {source === 'nutrition_plan' ? '干预方案复评' : source === 'paid_order' ? '已购单次评估' : '单次营养评估'}</strong>
        <div style={{ fontSize: 12, color: '#718578' }}>{config?.requestInstructions}</div>
        {source === 'paid_order' && <label style={field}>关联单次营养评估订单 *<select className="form-control" value={form.sourceOrderId} onChange={e => patch('sourceOrderId', e.target.value)}><option value="">请选择已购买、未使用的订单</option>{eligibleOrders.map(order => <option key={order._id} value={order._id}>{order.serviceName} · {order.orderNo || String(order._id).slice(-8)}{order.specificationLabel ? ` · ${order.specificationLabel}` : ''}</option>)}</select>{!eligibleOrders.length && <span>暂无可用订单，请核对订单付款及使用状态。</span>}</label>}
        {source !== 'paid_order' && <label style={field}>期望评估日期和具体时间 *<DateField className="form-control" type="datetime-local" min={localInput(new Date())} required value={form.preferredAt} onChange={e => patch('preferredAt', e.target.value)} /><span>健管专员会与会员确认最终预约时间。</span></label>}
        <label style={field}>评估原因 *<textarea className="form-control" rows={3} maxLength={2000} value={form.reason} onChange={e => patch('reason', e.target.value)} placeholder="说明会员当前问题、为什么需要营养师评估" /></label>
        <label style={field}>重点关注（选填）<textarea className="form-control" rows={2} maxLength={2000} value={form.focus} onChange={e => patch('focus', e.target.value)} placeholder="例如体重、饮食记录、代谢指标及已有干预效果" /></label>
        <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || form.reason.trim().length < 5 || (source === 'paid_order' ? !form.sourceOrderId : !form.preferredAt || !Number.isFinite(new Date(form.preferredAt).getTime()) || new Date(form.preferredAt) <= new Date())} onClick={() => run(() => staffAPI.createNutritionAssessment({ patientId, source, sourcePlanId: sourcePlanId || undefined, sourceOrderId: form.sourceOrderId || undefined, preferredAt: source === 'paid_order' ? undefined : new Date(form.preferredAt).toISOString(), reason: form.reason, focus: form.focus }), '已提交健管专员预约')}>提交需求</button></div>
      </div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[['active', '待完成'], ['completed', '已完成'], ['all', '全部']].map(([key, label]) => <button key={key} type="button" className={filter === key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setFilter(key)}>{label} {scopedRows.filter(row => key === 'all' || (key === 'active' ? !['completed', 'cancelled'].includes(row.status) || row.orderSettlementStatus === 'needs_review' : row.status === 'completed' && row.orderSettlementStatus !== 'needs_review')).length}</button>)}</div>
      {error && <div role="alert" style={{ color: '#B42318' }}>{error} <button type="button" onClick={load}>重试</button></div>}
      {!error && !visible.length && <div style={{ color: '#8AA89C', fontSize: 13 }}>暂无营养评估需求</div>}
      {(compact ? visible.slice(0, 5) : visible).map(row => <article key={row._id} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>{row.patientId?.name || '会员'} · {row.assessmentType === 'reassessment' ? '营养复评' : '单次营养评估'}</strong><span style={{ color: row.status === 'completed' ? '#1E6B50' : '#9A5B13', fontSize: 13 }}>{labels[row.status]}</span></div>
        <div style={{ fontSize: 12, color: '#718578', marginTop: 7 }}>发起时间：{dateTime(row.createdAt || row.events?.find(event => event.action === 'requested')?.at) || '未记录'}</div>
        {row.preferredAt && <div style={{ fontSize: 13, marginTop: 5 }}>期望评估时间：{dateTime(row.preferredAt)}</div>}
        <div style={{ fontSize: 13, marginTop: 7 }}>需求：{row.reason}</div>
        {row.sourceOrderId && <div style={{ fontSize: 12, color: '#52685D', marginTop: 5 }}>关联订单：{row.sourceOrderId.serviceName || '单次营养评估'} · {row.sourceOrderId.orderNo || String(row.sourceOrderId._id || row.sourceOrderId).slice(-8)} · {row.sourceOrderId.usedUnits ? '已核销' : '待完成评估后核销'}</div>}
        {row.orderSettlementStatus === 'needs_review' && <div role="alert" style={{ fontSize: 12, color: '#B42318', marginTop: 5 }}>评估已保存，订单核销待核对</div>}
        {row.focus && <div style={{ fontSize: 13, marginTop: 5 }}>评估重点：{row.focus}</div>}
        <div style={{ fontSize: 12, color: '#718578', marginTop: 7 }}>{row.source === 'paid_order' ? `健康规划师：${row.plannerId?.name || '—'}` : `健康顾问：${row.advisorId?.name || '—'}`} · 健管专员：{row.managerId?.name || '—'} · 营养师：{row.nutritionistId?.name || '—'}</div>
        {row.appointment?.at && <div style={{ fontSize: 13, marginTop: 7 }}>预约：{dateTime(row.appointment.at)} · {row.appointment.mode === 'online' ? `腾讯会议：${row.appointment.meetingRoom}` : `线下门店：${row.appointment.store}`}{row.appointment.note ? ` · ${row.appointment.note}` : ''}</div>}
        {row.assessment?.summary && <div style={{ fontSize: 13, marginTop: 7, whiteSpace: 'pre-wrap' }}>评估结论：{row.assessment.summary}<br />后续建议：{row.assessment.recommendations}</div>}
        <details style={{ marginTop: 9 }}><summary style={{ cursor: 'pointer', color: '#1E6B50', fontSize: 13 }}>查看流转记录（{row.events?.length || 0}）</summary><ol style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 12, color: '#52685D' }}>{(row.events || []).map((event, index) => <li key={index} style={{ margin: '5px 0' }}>{dateTime(event.at)} · {event.actorName} · {actionLabels[event.action] || event.action}{event.note ? ` · ${event.note}` : ''}</li>)}</ol></details>
        {row.status === 'completed' && row.orderSettlementStatus === 'needs_review' && (staff?.role === 'nutritionist' || staff?.role === 'superadmin') && <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy} onClick={() => run(() => staffAPI.completeNutritionAssessment(row._id, {}), '订单核销已完成')}>重试订单核销</button>}
        {['awaiting_booking', 'booked'].includes(row.status) && actionable(row) && <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => {
          if (row.status === 'booked' && (staff?.role === 'nutritionist' || staff?.role === 'superadmin') && !patientId) {
            nav(`/patients/${row.patientId?._id || row.patientId}?tab=plans&serviceView=nutrition&assessmentId=${row._id}`)
            return
          }
          setEditingId(editingId === row._id ? '' : row._id)
          setForm({ ...defaultForm, at: row.status === 'awaiting_booking' && row.preferredAt ? localInput(row.preferredAt) : '', mode: config?.onlineEnabled === false ? 'offline' : 'online' })
        }}>{editingId === row._id ? '收起办理' : row.status === 'awaiting_booking' ? '办理预约' : '进入营养管理评估'}</button>}
        {row.status === 'booked' && (staff?.role === 'healthManager' || staff?.role === 'superadmin') && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10, marginLeft: 8 }} onClick={() => { setEditingId(editingId === row._id ? '' : row._id); setForm({ ...defaultForm, at: row.appointment?.at ? localInput(row.appointment.at) : '', mode: row.appointment?.mode || 'online', meetingRoom: row.appointment?.meetingRoom || '', store: row.appointment?.store || '', note: row.appointment?.note || '' }) }}>调整预约</button>}
        {['awaiting_booking', 'booked'].includes(row.status) && (staff?.role === 'superadmin' || (row.source === 'paid_order' ? staff?.role === 'healthPlanner' : staff?.role === 'familyDoctor')) && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10, marginLeft: 8 }} onClick={() => setCancelId(cancelId === row._id ? '' : row._id)}>取消需求</button>}
        {cancelId === row._id && <div style={{ ...card, background: '#FFF8F4', display: 'grid', gap: 8, marginTop: 10 }}><label style={field}>取消原因 *<textarea className="form-control" rows={2} value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></label><div><button type="button" className="btn btn-secondary btn-sm" disabled={busy || cancelReason.trim().length < 5} onClick={() => run(() => staffAPI.cancelNutritionAssessment(row._id, { reason: cancelReason }), '需求单已取消')}>确认取消</button></div></div>}
        {editingId === row._id && (staff?.role === 'healthManager' || staff?.role === 'nutritionist' || staff?.role === 'superadmin') && <div style={{ ...card, background: '#F7FBF8', display: 'grid', gap: 9, marginTop: 10 }}>
          {((staff?.role === 'healthManager' || staff?.role === 'superadmin') && (row.status === 'awaiting_booking' || staff?.role === 'healthManager' || !!form.at)) && <><div style={{ fontSize: 12, color: '#718578' }}>{config?.bookingInstructions}</div><label style={field}>预约日期和具体时间 *<input className="form-control" type="datetime-local" value={form.at} onChange={e => patch('at', e.target.value)} /></label><label style={field}>预约方式 *<select className="form-control" value={form.mode} onChange={e => patch('mode', e.target.value)}>{config?.onlineEnabled !== false && <option value="online">线上 · 腾讯会议</option>}{config?.offlineEnabled !== false && <option value="offline">线下门店</option>}</select></label><label style={field}>{form.mode === 'online' ? '腾讯会议室/会议链接 *' : '线下门店 *'}<input className="form-control" value={form.mode === 'online' ? form.meetingRoom : form.store} onChange={e => patch(form.mode === 'online' ? 'meetingRoom' : 'store', e.target.value)} /></label><label style={field}>预约备注<input className="form-control" value={form.note} onChange={e => patch('note', e.target.value)} /></label><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => staffAPI.bookNutritionAssessment(row._id, { ...form, at: form.at ? new Date(form.at).toISOString() : '' }), '预约已确认，已转营养师工作台')}>确认预约</button></>}
          {row.status === 'booked' && ((staff?.role === 'nutritionist' || staff?.role === 'superadmin') && !form.at) && <AssignedNutritionAssessmentForm patientId={row.patientId?._id || row.patientId} task={row} kind="request" onSaved={() => { setEditingId(''); load(); toast('营养评估已完成，发起人可查看结果') }} />}
        </div>}
      </article>)}
    </div>
  </section>
}
