import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { concernStatusLabel, concernSourceLabel, concernTypeLabel, isEvidenceConcern, isActiveAnnualConcern } from '../utils/annualConcernLabels'

const STATUS = [['suggested', 'AI提示，待核实'], ['included', '纳入研判'], ['watch', '继续观察'], ['duplicate', '与其他问题重复'], ['excluded', '不纳入']]
const PATHWAY = [['undecided', '待判断'], ['specialist', '专科评估或就医'], ['nutrition', '交营养师评估'], ['both', '专科和营养师均介入'], ['followup', '随访与复评']]
const SOURCE = { screening: '专项筛查报告', ai_health_trend: '已审核的5年健康趋势', ai_risk_scan: '已审核的AI风险提示', reviewed_chronic_tag: '已审核慢病关注标签', reviewed_cardiovascular_tag: '已审核心脑血管关注标签', reviewed_tumor_tag: '已审核肿瘤风险关注标签' }

function ConcernRow({ concern, number, patientId, topicId, canEdit, toast, onUpdate }) {
  const evidenceRow = isEvidenceConcern(concern)
  const [form, setForm] = useState({ title: concern.title || '', status: concern.status || 'suggested', pathway: concern.pathway || 'undecided', note: concern.note || '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm({ title: concern.title || '', status: concern.status || 'suggested', pathway: concern.pathway || 'undecided', note: concern.note || '' }), [concern.id, concern.reviewedAt])
  const changed = form.title !== concern.title || form.status !== concern.status || form.pathway !== concern.pathway || form.note !== (concern.note || '')
  const save = async () => {
    setBusy(true)
    try { const result = await staffAPI.updateAiCaseReviewConcern(patientId, topicId, concern.id, form); onUpdate(result.data); toast('问题去向已保存') }
    catch (error) { toast(error.message || '保存失败', 'error') }
    finally { setBusy(false) }
  }
  return <details id={`annual-concern-${concern.id}`} style={{ border: '1px solid #DCE8E1', borderRadius: 9, padding: 11, marginTop: 8, background: '#fff' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{number}. {concern.title}<span style={{ color: '#65776F', fontSize: 12, fontWeight: 400, marginLeft: 8 }}>{concernTypeLabel(concern)} · {concernStatusLabel(concern)}{!evidenceRow && ` · ${PATHWAY.find(([value]) => value === concern.pathway)?.[1] || '待判断'}`}</span></summary>
    <div style={{ fontSize: 12, color: '#65776F', marginTop: 3 }}>{SOURCE[concern.kind] || '其他资料'} · {concern.source?.checkDate || concern.source?.year || ''} · {concernSourceLabel(concern)}</div>
    {concern.evidence && <div style={{ fontSize: 12, lineHeight: 1.6, marginTop: 5 }}>依据：{concern.evidence}</div>}
    {concern.kind === 'specialty_issue' && concern.source?.topicId && <div style={{ fontSize: 12, color: '#65776F', marginTop: 4 }}>由既有单项主题并入；原始资料与讨论保留。</div>}
    {canEdit && <input className="form-input" style={{ marginTop: 8 }} maxLength={60} disabled={busy} value={form.title} onChange={e => setForm(value => ({ ...value, title: e.target.value }))} aria-label="具体问题名称" />}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      <select className="form-input" style={{ width: 210 }} disabled={!canEdit || busy} value={form.status} onChange={e => setForm(value => ({ ...value, status: e.target.value }))}>{STATUS.filter(([value]) => !evidenceRow || ['suggested', 'included', 'excluded', form.status].includes(value)).map(([value, label]) => <option key={value} value={value}>{value === 'suggested' ? concernStatusLabel({ ...concern, status: value }) : evidenceRow && value === 'included' ? '作为依据' : evidenceRow && value === 'excluded' ? '不采用此依据' : label}</option>)}</select>
      {!evidenceRow && <select className="form-input" style={{ width: 185 }} disabled={!canEdit || busy} value={form.pathway} onChange={e => setForm(value => ({ ...value, pathway: e.target.value }))}>{PATHWAY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
    </div>
    <input className="form-input" style={{ marginTop: 7 }} disabled={!canEdit || busy} maxLength={500} value={form.note} onChange={e => setForm(value => ({ ...value, note: e.target.value }))} placeholder="补充判断依据；排除或重复时必填" />
    {canEdit && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} disabled={!changed || busy} onClick={save}>{busy ? '保存中…' : '保存去向'}</button>}
  </details>
}

export default function AnnualConcernsPanel({ topic, patientId, staff, toast, onUpdate, onAnalyze, legacyTopics = [] }) {
  const [syncing, setSyncing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  if (!topic?.annualPlanYear) return null
  const canEdit = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const concerns = (topic.concerns || []).filter(isActiveAnnualConcern)
  const latestAiAt = (topic.messages || []).filter(row => row.role === 'ai').at(-1)?.createdAt
  const analysisStale = !!topic.concernsUpdatedAt && (!latestAiAt || new Date(latestAiAt) < new Date(topic.concernsUpdatedAt))
  const evidenceRows = concerns.filter(isEvidenceConcern)
  const pending = concerns.filter(row => !isEvidenceConcern(row) && (row.status === 'suggested' || (row.status === 'included' && (!row.pathway || row.pathway === 'undecided'))))
  const reviewedTrendSources = ['已审核5年健康趋势（慢病）', '已审核慢病关注标签', '已审核5年健康趋势（心脑血管）', '已审核心脑血管关注标签', '已审核肿瘤风险关注标签']
  const chronicTrend = concerns.filter(row => !isEvidenceConcern(row) && reviewedTrendSources.includes(row.includedByName))
  const manuallyIncluded = concerns.filter(row => !isEvidenceConcern(row) && !reviewedTrendSources.includes(row.includedByName))
  const pendingLegacy = legacyTopics.filter(row => !(topic.concerns || []).some(concern => concern.key === `legacy_specialty:${row._id}`))
  const importLegacy = async () => {
    setImporting(true)
    try { const result = await staffAPI.importSpecialtyIntoAnnual(patientId, topic._id); onUpdate(result.data); toast(result.added ? `已并入 ${result.added} 个既有单项问题` : '既有单项问题均已并入') }
    catch (error) { toast(error.message || '整合既有问题失败', 'error') }
    finally { setImporting(false) }
  }
  const syncChronic = async () => {
    setSyncing(true); setSyncMessage('')
    try {
      const result = await staffAPI.syncAnnualChronicConcerns(patientId, topic._id)
      onUpdate(result.data)
      setSyncMessage(result.retired ? `已将 ${result.retired} 项旧版或被更新资料取代的线索移至历史记录。` : result.sourceStatus === 'unreviewed' ? '健康趋势与关注标签均未审核，暂不能自动带入。' : result.sourceStatus === 'missing' ? '已审核资料中没有可同步的关注线索。' : result.reviewedCount === 0 ? '已审核资料未列出需关注的风险线索。' : result.added || result.merged ? `已补入 ${result.added || 0} 项、合并 ${result.merged || 0} 项重复线索；请确定年度去向。` : '已审核的关注线索均在本年度列表中。')
    } catch (error) { setSyncMessage(error.message || '慢性病风险维度同步失败') }
    finally { setSyncing(false) }
  }
  return <div className="card" id="annual-concerns"><div className="card-header"><div className="card-title">年度综合研判的问题与风险线索（{concerns.length - evidenceRows.length} 项；另有检查依据 {evidenceRows.length} 项）</div></div><div className="card-body">
    <div style={{ fontSize: 12, color: '#65776F' }}>按最新已审核资料核对具体健康问题和检查发现。泛化AI风险扫描仅作历史参考，不与具体问题重复列项；旧线索被新资料取代时退出当前研判。</div>
    {!!pending.length && <div role="status" style={{ marginTop: 10, padding: 10, background: '#FFF4E5', color: '#8A5414', borderRadius: 8, fontSize: 13 }}>还有 {pending.length} 项需要健康顾问逐项核实：选择纳入、继续观察、重复或不纳入；纳入时确定专业去向并保存。确认结论前须完成此步。</div>}
    {canEdit && pendingLegacy.length > 0 && <div style={{ marginTop: 10, padding: 10, background: '#FFF8ED', borderRadius: 8, fontSize: 12 }}>已有 {pendingLegacy.length} 个单项主题尚未并入本年度研判。<button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} disabled={importing} onClick={importLegacy}>{importing ? '正在整合…' : '并入年度综合研判'}</button></div>}
    {canEdit && <div style={{ marginTop: 10 }}><button type="button" className="btn btn-secondary btn-sm" disabled={syncing} onClick={syncChronic}>{syncing ? '正在核对…' : '核对并同步已审核关注线索'}</button>{syncMessage && <span role="status" style={{ marginLeft: 8, fontSize: 12, color: '#52685D' }}>{syncMessage}</span>}</div>}
    {!concerns.length && <div style={{ marginTop: 12, color: '#8AA89C' }}>暂无纳入的问题，可在专项筛查结果或AI健康信息整理中一键纳入。</div>}
    {!!manuallyIncluded.length && <div style={{ marginTop: 12, fontWeight: 700 }}>具体问题（{manuallyIncluded.length}项）</div>}
    {manuallyIncluded.map((concern, index) => <ConcernRow key={concern.id} concern={concern} number={index + 1} patientId={patientId} topicId={topic._id} canEdit={canEdit} toast={toast} onUpdate={onUpdate} />)}
    {!!chronicTrend.length && <div style={{ marginTop: 12, fontWeight: 700 }}>已审核健康趋势与关注标签（{chronicTrend.length}项）</div>}
    {chronicTrend.map((concern, index) => <ConcernRow key={concern.id} concern={concern} number={manuallyIncluded.length + index + 1} patientId={patientId} topicId={topic._id} canEdit={canEdit} toast={toast} onUpdate={onUpdate} />)}
    {!!evidenceRows.length && <div style={{ marginTop: 12, fontWeight: 700 }}>检查与指标依据（{evidenceRows.length}项，不作为独立诊断）</div>}
    {evidenceRows.map((concern, index) => <ConcernRow key={concern.id} concern={concern} number={index + 1} patientId={patientId} topicId={topic._id} canEdit={canEdit} toast={toast} onUpdate={onUpdate} />)}
    {!!(topic.retiredConcerns || []).length && <details style={{ marginTop: 12, color: '#65776F', fontSize: 12 }}><summary>历史线索（{topic.retiredConcerns.length}项，已退出当前研判）</summary>{topic.retiredConcerns.map(row => <div key={row.id || row.key} style={{ marginTop: 5 }}>{row.title}：{row.retiredReason}</div>)}</details>}
    {analysisStale && <div role="alert" style={{ marginTop: 12, color: '#A16620', fontSize: 12 }}>问题清单已更新，既有 AI 分析尚未覆盖最新线索。</div>}
    {canEdit && concerns.length > 0 && topic.messages?.length > 0 && <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={onAnalyze}>按当前问题更新完整年度研判</button>}
  </div></div>
}
