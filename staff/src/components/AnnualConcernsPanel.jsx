import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const STATUS = [['suggested', 'AI提示，待核实'], ['included', '纳入研判'], ['watch', '继续观察'], ['duplicate', '与其他问题重复'], ['excluded', '不纳入']]
const PATHWAY = [['undecided', '待判断'], ['specialist', '专科评估或就医'], ['nutrition', '交营养师评估'], ['both', '专科和营养师均介入'], ['followup', '随访与复评']]
const SOURCE = { screening: '专项筛查报告', ai_health_trend: '已审核的5年健康趋势', ai_risk_scan: '已审核的AI风险提示', reviewed_chronic_tag: '已审核慢病关注标签' }

function ConcernRow({ concern, number, patientId, topicId, canEdit, toast, onUpdate }) {
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
  return <details style={{ border: '1px solid #DCE8E1', borderRadius: 9, padding: 11, marginTop: 8, background: '#fff' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{number}. {concern.title}<span style={{ color: '#65776F', fontSize: 12, fontWeight: 400, marginLeft: 8 }}>{STATUS.find(([value]) => value === concern.status)?.[1] || '待核实'} · {PATHWAY.find(([value]) => value === concern.pathway)?.[1] || '待判断'}</span></summary>
    <div style={{ fontSize: 12, color: '#65776F', marginTop: 3 }}>{SOURCE[concern.kind] || '其他资料'} · {concern.source?.checkDate || concern.source?.year || ''} · {concern.includedByName || '系统'}</div>
    {concern.evidence && <div style={{ fontSize: 12, lineHeight: 1.6, marginTop: 5 }}>依据：{concern.evidence}</div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      <select className="form-input" style={{ width: 170 }} disabled={!canEdit || busy} value={form.status} onChange={e => setForm(value => ({ ...value, status: e.target.value }))}>{STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select className="form-input" style={{ width: 185 }} disabled={!canEdit || busy} value={form.pathway} onChange={e => setForm(value => ({ ...value, pathway: e.target.value }))}>{PATHWAY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    <input className="form-input" style={{ marginTop: 7 }} disabled={!canEdit || busy} maxLength={500} value={form.note} onChange={e => setForm(value => ({ ...value, note: e.target.value }))} placeholder="补充判断依据；排除或重复时必填" />
    {canEdit && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} disabled={!changed || busy} onClick={save}>{busy ? '保存中…' : '保存去向'}</button>}
  </details>
}

export default function AnnualConcernsPanel({ topic, patientId, staff, toast, onUpdate, onAnalyze }) {
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  if (!topic?.annualPlanYear) return null
  const canEdit = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const concerns = topic.concerns || []
  const autoScan = concerns.filter(row => row.includedByName === '已审核AI风险扫描')
  const chronicTrend = concerns.filter(row => ['已审核5年健康趋势（慢病）', '已审核慢病关注标签'].includes(row.includedByName))
  const manuallyIncluded = concerns.filter(row => row.includedByName !== '已审核AI风险扫描' && !['已审核5年健康趋势（慢病）', '已审核慢病关注标签'].includes(row.includedByName))
  const syncChronic = async () => {
    setSyncing(true); setSyncMessage('')
    try {
      const result = await staffAPI.syncAnnualChronicConcerns(patientId, topic._id)
      onUpdate(result.data)
      setSyncMessage(result.sourceStatus === 'unreviewed' ? '五年健康信息慢病板块及慢病关注标签均未审核，暂不能自动带入。' : result.sourceStatus === 'missing' ? '已审核健康信息中没有慢病板块，且没有已审核慢病关注标签。' : result.reviewedCount === 0 ? '已审核资料未列出需关注的慢病线索；这不代表客户没有已确诊慢病。' : result.added ? `已补入 ${result.added} 项慢病相关线索，仍需健康顾问逐项核对。` : '已审核慢病线索均在本年度列表中。')
    } catch (error) { setSyncMessage(error.message || '慢病线索同步失败') }
    finally { setSyncing(false) }
  }
  return <div className="card" id="annual-concerns"><div className="card-header"><div className="card-title">年度风险维度与分析线索（共 {concerns.length} 项）</div></div><div className="card-body">
    <div style={{ fontSize: 12, color: '#65776F' }}>AI风险扫描含心血管、血糖、肿瘤和肾功能四类；这里只自动列出已审核且达到持续关注及以上的维度。慢病相关线索还会从已审核五年趋势或慢病关注标签带入，均需健康顾问核对。展开每项可查看依据和去向。</div>
    {canEdit && <div style={{ marginTop: 10 }}><button type="button" className="btn btn-secondary btn-sm" disabled={syncing} onClick={syncChronic}>{syncing ? '正在核对…' : '核对并同步慢病线索'}</button>{syncMessage && <span role="status" style={{ marginLeft: 8, fontSize: 12, color: '#52685D' }}>{syncMessage}</span>}</div>}
    {!concerns.length && <div style={{ marginTop: 12, color: '#8AA89C' }}>暂无纳入的问题，可在专项筛查结果或AI健康信息整理中一键纳入。</div>}
    {!!autoScan.length && <div style={{ marginTop: 12, fontWeight: 700 }}>系统从已审核AI风险扫描带入的维度（{autoScan.length}项）</div>}
    {autoScan.map((concern, index) => <ConcernRow key={concern.id} concern={concern} number={index + 1} patientId={patientId} topicId={topic._id} canEdit={canEdit} toast={toast} onUpdate={onUpdate} />)}
    {!!chronicTrend.length && <div style={{ marginTop: 12, fontWeight: 700 }}>已审核资料中的慢病相关线索（{chronicTrend.length}项）</div>}
    {chronicTrend.map((concern, index) => <ConcernRow key={concern.id} concern={concern} number={autoScan.length + index + 1} patientId={patientId} topicId={topic._id} canEdit={canEdit} toast={toast} onUpdate={onUpdate} />)}
    {!!manuallyIncluded.length && <div style={{ marginTop: 12, fontWeight: 700 }}>人工纳入的分析线索（{manuallyIncluded.length}项）</div>}
    {manuallyIncluded.map((concern, index) => <ConcernRow key={concern.id} concern={concern} number={autoScan.length + chronicTrend.length + index + 1} patientId={patientId} topicId={topic._id} canEdit={canEdit} toast={toast} onUpdate={onUpdate} />)}
    {canEdit && concerns.length > 0 && topic.messages?.length > 0 && <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={onAnalyze}>依据当前关注问题继续AI研判</button>}
  </div></div>
}
