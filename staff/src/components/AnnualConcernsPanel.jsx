import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const STATUS = [['suggested', 'AI提示，待核实'], ['included', '纳入研判'], ['watch', '继续观察'], ['duplicate', '与其他问题重复'], ['excluded', '不纳入']]
const PATHWAY = [['undecided', '待判断'], ['specialist', '专科评估或就医'], ['nutrition', '交营养师评估'], ['both', '专科和营养师均介入'], ['followup', '随访与复评']]
const SOURCE = { screening: '专项筛查报告', ai_health_trend: '已审核的5年健康趋势', ai_risk_scan: '已审核的AI风险提示' }

function ConcernRow({ concern, patientId, topicId, canEdit, toast, onUpdate }) {
  const [form, setForm] = useState({ status: concern.status || 'suggested', pathway: concern.pathway || 'undecided', note: concern.note || '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm({ status: concern.status || 'suggested', pathway: concern.pathway || 'undecided', note: concern.note || '' }), [concern.id, concern.reviewedAt])
  const changed = form.status !== concern.status || form.pathway !== concern.pathway || form.note !== (concern.note || '')
  const save = async () => {
    setBusy(true)
    try { const result = await staffAPI.updateAiCaseReviewConcern(patientId, topicId, concern.id, form); onUpdate(result.data); toast('问题去向已保存') }
    catch (error) { toast(error.message || '保存失败', 'error') }
    finally { setBusy(false) }
  }
  return <div style={{ border: '1px solid #DCE8E1', borderRadius: 9, padding: 11, marginTop: 8, background: '#fff' }}>
    <div style={{ fontWeight: 700 }}>{concern.title}</div>
    <div style={{ fontSize: 12, color: '#65776F', marginTop: 3 }}>{SOURCE[concern.kind] || '其他资料'} · {concern.source?.checkDate || concern.source?.year || ''} · {concern.includedByName || '系统'}</div>
    {concern.evidence && <div style={{ fontSize: 12, lineHeight: 1.6, marginTop: 5 }}>依据：{concern.evidence}</div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      <select className="form-input" style={{ width: 170 }} disabled={!canEdit || busy} value={form.status} onChange={e => setForm(value => ({ ...value, status: e.target.value }))}>{STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select className="form-input" style={{ width: 185 }} disabled={!canEdit || busy} value={form.pathway} onChange={e => setForm(value => ({ ...value, pathway: e.target.value }))}>{PATHWAY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    <input className="form-input" style={{ marginTop: 7 }} disabled={!canEdit || busy} maxLength={500} value={form.note} onChange={e => setForm(value => ({ ...value, note: e.target.value }))} placeholder="补充判断依据；排除或重复时必填" />
    {canEdit && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} disabled={!changed || busy} onClick={save}>{busy ? '保存中…' : '保存去向'}</button>}
  </div>
}

export default function AnnualConcernsPanel({ topic, patientId, staff, toast, onUpdate, onAnalyze }) {
  if (!topic?.annualPlanYear) return null
  const canEdit = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const concerns = topic.concerns || []
  return <div className="card"><div className="card-header"><div className="card-title">年度待研判问题 · {concerns.length}</div></div><div className="card-body">
    <div style={{ fontSize: 12, color: '#65776F' }}>来源于专项筛查结果、已审核的5年健康趋势和AI风险提示；纳入关注不代表确诊或已确定年度目标。营养去向由营养师独立评估并发出具体方案。</div>
    {!concerns.length && <div style={{ marginTop: 12, color: '#8AA89C' }}>暂无纳入的问题，可在专项筛查结果或AI健康信息整理中一键纳入。</div>}
    {concerns.map(concern => <ConcernRow key={concern.id} concern={concern} patientId={patientId} topicId={topic._id} canEdit={canEdit} toast={toast} onUpdate={onUpdate} />)}
    {canEdit && concerns.length > 0 && topic.messages?.length > 0 && <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={onAnalyze}>依据当前关注问题继续AI研判</button>}
  </div></div>
}
