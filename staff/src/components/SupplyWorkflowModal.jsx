import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const MODES = [
  ['customer_self', '客户自行购买（我们提醒并确认）'],
  ['online_assisted', '我们协助线上购买并安排配送'],
  ['hospital_assisted', '医院配药（含预约）'],
  ['internal_product', '自研营养代餐内部履约'],
]

const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #D8D2C8', borderRadius: 8, padding: '9px 10px', fontSize: 13 }
const labelStyle = { display: 'block', fontSize: 12, color: '#4A6558', marginBottom: 5, marginTop: 12 }
const buttonStyle = { border: 0, borderRadius: 8, padding: '9px 16px', cursor: 'pointer', background: '#1E6B50', color: '#fff', fontWeight: 600 }

function JsonDraft({ value }) {
  if (!value || !Object.keys(value).length) return <div style={{ color: '#8AA89C', fontSize: 12 }}>尚未生成AI草稿</div>
  return <div style={{ background: '#F6F8F6', borderRadius: 8, padding: 12, fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{JSON.stringify(value, null, 2)}</div>
}

export default function SupplyWorkflowModal({ todo, onClose, onDone }) {
  const planId = todo?.id?.replace(/^supply_plan_/, '')
  const [plan, setPlan] = useState(null)
  const [form, setForm] = useState({ fulfillmentMode: 'customer_self', remainingDays: '3', currentUse: '', changes: '', reactions: '', recentMetrics: '', prescription: '', preferredTime: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () => staffAPI.getSupplyPlan(planId).then(r => {
    setPlan(r.data)
    setForm(f => ({ ...f, fulfillmentMode: r.data.fulfillmentMode === 'undecided' ? 'customer_self' : r.data.fulfillmentMode, ...(r.data.intake || {}) }))
  })
  useEffect(() => { if (planId) load().catch(e => setError(e.message || '加载失败')) }, [planId])

  const run = async (fn, finish = true) => {
    setBusy(true); setError('')
    try { await fn(); if (finish) onDone(todo.id); else await load() } catch (e) { setError(e.message || '操作失败') } finally { setBusy(false) }
  }
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  if (!todo) return null
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#0007', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px #0003' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div><h3 style={{ margin: 0, color: '#1A2B24' }}>{todo.label}</h3><div style={{ fontSize: 13, color: '#8AA89C', marginTop: 5 }}>{todo.patientName} · {todo.summary}</div></div>
        <button onClick={onClose} style={{ border: 0, background: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
      </div>
      {!plan ? <div style={{ padding: 30, textAlign: 'center', color: '#8AA89C' }}>加载中…</div> : <>
        <div style={{ marginTop: 16, padding: 12, borderRadius: 9, background: '#FFF8E8', color: '#7A5A12', fontSize: 13 }}>
          {plan.planType === 'medication' ? '药品' : '营养素'}：{plan.itemName} {plan.dosage || ''}　计划日期：{new Date(plan.nextDueDate).toLocaleDateString()}
        </div>

        {['supply_intake'].includes(todo.type) && <>
          <label style={labelStyle}>本轮履约方式</label>
          <select value={form.fulfillmentMode} onChange={e => set('fulfillmentMode', e.target.value)} style={inputStyle}>
            {MODES.filter(([v]) => !(v === 'hospital_assisted' && plan.planType !== 'medication') && !(v === 'internal_product' && plan.planType !== 'supplement')).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label style={labelStyle}>预计剩余天数</label><input value={form.remainingDays} onChange={e => set('remainingDays', e.target.value)} style={inputStyle} />
          <label style={labelStyle}>目前实际使用方法与依从性</label><textarea value={form.currentUse} onChange={e => set('currentUse', e.target.value)} style={inputStyle} rows={2} />
          <label style={labelStyle}>近期是否调整、停用或漏用</label><textarea value={form.changes} onChange={e => set('changes', e.target.value)} style={inputStyle} rows={2} />
          <label style={labelStyle}>不适或不良反应</label><textarea value={form.reactions} onChange={e => set('reactions', e.target.value)} style={inputStyle} rows={2} />
          <label style={labelStyle}>近期血压/血糖/血脂等指标及合并用药</label><textarea value={form.recentMetrics} onChange={e => set('recentMetrics', e.target.value)} style={inputStyle} rows={2} />
          {plan.planType === 'medication' && <><label style={labelStyle}>处方、医院、科室、医生及有效期</label><textarea value={form.prescription} onChange={e => set('prescription', e.target.value)} style={inputStyle} rows={2} /></>}
          <label style={labelStyle}>客户偏好时间/配送要求及补充说明</label><textarea value={form.note} onChange={e => set('note', e.target.value)} style={inputStyle} rows={2} />
          <div style={{ marginTop: 16 }}><button disabled={busy} style={buttonStyle} onClick={() => run(async () => { await staffAPI.submitSupplyIntake(planId, { fulfillmentMode: form.fulfillmentMode, intake: form }); await staffAPI.generateSupplyRiskDraft(planId) })}>保存并由AI生成风险草稿</button></div>
        </>}

        {['supply_medication_risk_review', 'supply_supplement_risk_review'].includes(todo.type) && <>
          <h4>信息采集</h4><JsonDraft value={plan.intake} />
          <h4>AI风险草稿（仅供人工审核）</h4><JsonDraft value={plan.aiRiskDraft} />
          <button disabled={busy} style={{ ...buttonStyle, background: '#4A6558' }} onClick={() => run(() => staffAPI.generateSupplyRiskDraft(planId), false)}>AI重新生成风险草稿</button>
          <label style={labelStyle}>人工审核意见及安全边界</label><textarea value={form.note} onChange={e => set('note', e.target.value)} style={inputStyle} rows={3} />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button disabled={busy} style={buttonStyle} onClick={() => run(() => staffAPI.reviewSupplyRisk(planId, { decision: 'approved', note: form.note }))}>审核通过</button>
            <button disabled={busy} style={{ ...buttonStyle, background: '#D97706' }} onClick={() => run(() => staffAPI.reviewSupplyRisk(planId, { decision: 'more_info', note: form.note }))}>退回补充信息</button>
            <button disabled={busy} style={{ ...buttonStyle, background: '#DC3545' }} onClick={() => run(() => staffAPI.reviewSupplyRisk(planId, { decision: 'paused', note: form.note }))}>暂停补充</button>
          </div>
        </>}

        {todo.type === 'supply_arrangement' && <>
          <h4>专业审核结论</h4><JsonDraft value={plan.riskReview} />
          <h4>AI履约草稿</h4><JsonDraft value={plan.arrangement?.aiDraft} />
          <button disabled={busy} style={{ ...buttonStyle, background: '#4A6558' }} onClick={() => run(() => staffAPI.generateSupplyArrangementDraft(planId), false)}>AI生成/刷新履约草稿</button>
          {plan.fulfillmentMode === 'hospital_assisted' && <><label style={labelStyle}>医院预约时间（必填）</label><input type="datetime-local" value={form.appointmentAt} onChange={e => set('appointmentAt', e.target.value)} style={inputStyle} /></>}
          <label style={labelStyle}>医院/平台/供应渠道与执行说明</label><textarea value={form.note} onChange={e => set('note', e.target.value)} style={inputStyle} rows={3} />
          <div style={{ marginTop: 16 }}><button disabled={busy} style={buttonStyle} onClick={() => run(() => staffAPI.confirmSupplyArrangement(planId, { appointmentAt: form.appointmentAt || null, note: form.note }))}>人工审核并确认安排</button></div>
        </>}

        {todo.type === 'supply_fulfillment' && <>
          <h4>已审核履约安排</h4><JsonDraft value={plan.arrangement} />
          <label style={labelStyle}>实际购买/配取、处方、商品批次及配送记录</label><textarea value={form.note} onChange={e => set('note', e.target.value)} style={inputStyle} rows={4} />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><button disabled={busy} style={buttonStyle} onClick={() => run(() => staffAPI.updateSupplyFulfillment(planId, { outcome: 'completed', note: form.note }))}>确认已执行，等待签收</button><button disabled={busy} style={{ ...buttonStyle, background: '#D97706' }} onClick={() => run(() => staffAPI.updateSupplyFulfillment(planId, { outcome: 'mismatch', note: form.note }))}>信息不一致，退回安排</button></div>
        </>}

        {todo.type === 'supply_receipt' && <>
          <h4>{plan.fulfillmentMode === 'customer_self' ? '客户自行购买确认' : '配送/签收确认'}</h4>
          <JsonDraft value={plan.fulfillmentMode === 'customer_self' ? plan.riskReview : plan.fulfillment} />
          <label style={labelStyle}>确认记录与后续使用提醒</label><textarea value={form.note} onChange={e => set('note', e.target.value)} style={inputStyle} rows={3} />
          <div style={{ marginTop: 16 }}><button disabled={busy} style={buttonStyle} onClick={() => run(() => staffAPI.confirmSupplyReceipt(planId, { confirmed: true, note: form.note }))}>确认已购买/签收并进入下一周期</button></div>
        </>}
      </>}
      {error && <div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: '#FFF0F0', color: '#B42318', fontSize: 13 }}>{error}</div>}
    </div>
  </div>
}
