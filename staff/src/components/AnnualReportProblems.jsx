import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'
import './ReportFollowUpDrafts.css'

export function AnnualProblemCard({ topic, index, disabled, approved, onChange }) {
  const [editing, setEditing] = useState(false)
  const patch = value => onChange({ ...value, reviewed: false })
  return <article className="report-issue-card annual-problem-card">
    <header><span className="report-issue-number">{index + 1}</span><strong>{topic.title}</strong><span className="report-issue-tag">{approved ? '已审核' : topic.reviewed ? '已核对' : '待顾问审核'}</span></header>
    <div className="annual-problem-findings">{[...new Set(topic.findings.map(finding => finding.title))].map(title => <span key={title}>{title}</span>)}</div>
    {editing && !disabled ? <fieldset>
      <label>管理问题<input value={topic.title} maxLength={200} onChange={e => patch({ title: e.target.value })} /></label>
      <label>问题分析<textarea rows={3} value={topic.analysis} maxLength={6000} onChange={e => patch({ analysis: e.target.value })} /></label>
      <label>处理建议<textarea rows={3} value={topic.recommendation} maxLength={6000} onChange={e => patch({ recommendation: e.target.value })} /></label>
    </fieldset> : <><div className="report-issue-analysis"><b>问题分析</b><p>{topic.analysis}</p></div><div className="report-issue-recommendations"><b>处理建议</b><p>{topic.recommendation}</p></div></>}
    <details className="report-issue-evidence"><summary>检查依据 · {topic.findings.length}项发现</summary>{topic.findings.map(finding => <div key={finding.id} className="report-problem-source"><b>{finding.title}</b>{finding.sources.map((source, i) => <div key={i}><p>{source.reportTitle} · {source.sourceName}{source.page ? ` · 第${source.page}页` : ''}{source.date ? ` · ${String(source.date).slice(0, 10)}` : ''}</p><p>{source.excerpt || source.evidence || finding.evidence}</p></div>)}</div>)}</details>
    {!approved && <fieldset disabled={disabled} className="annual-problem-review"><button type="button" onClick={() => setEditing(value => !value)}>{editing ? '完成修改' : '修改分析与建议'}</button><label><input type="checkbox" checked={topic.decision === 'exclude'} onChange={e => patch({ decision: e.target.checked ? 'exclude' : 'include' })} />暂不纳入年度方案</label><label><input type="checkbox" checked={topic.reviewed === true} onChange={e => onChange({ reviewed: e.target.checked })} />已核对本问题的分析及建议</label>{topic.decision === 'exclude' && <label>不纳入原因<input value={topic.exclusionReason || ''} maxLength={2000} onChange={e => patch({ exclusionReason: e.target.value })} /></label>}</fieldset>}
    {approved && topic.decision === 'exclude' && <p>未纳入：{topic.exclusionReason}</p>}
  </article>
}

export default function AnnualReportProblems({ patientId, year, canEdit }) {
  const [view, setView] = useState({ data: null, reportCount: 0 }), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [dirty, setDirty] = useState(false), [coverageReviewed, setCoverageReviewed] = useState(false)
  const scope = `${patientId}:${year}`, active = useRef(scope), request = useRef(0)
  active.current = scope
  const load = async () => {
    const ticket = ++request.current
    setBusy(true); setError('')
    try {
      const result = await staffAPI.getAnnualReportProblems(patientId, year)
      if (active.current === scope && ticket === request.current) { setView(result); setDirty(false); setCoverageReviewed(false) }
    } catch (e) { if (active.current === scope && ticket === request.current) setError(e.message) }
    finally { if (active.current === scope && ticket === request.current) setBusy(false) }
  }
  useEffect(() => { setView({ data: null, reportCount: 0 }); setDirty(false); setCoverageReviewed(false); load(); return () => { request.current++ } }, [scope])
  useEffect(() => {
    if (busy || dirty || view.data?.status !== 'generating' || view.data?.canRetry) return
    const timer = setTimeout(load, 5000)
    return () => clearTimeout(timer)
  }, [busy, dirty, view.data, scope])
  const row = view.data, topics = row?.topics || [], generating = row?.status === 'generating' && !row?.canRetry
  const editable = canEdit && row?.status === 'ready' && !view.stale && !busy
  const update = (id, patch) => { setDirty(true); setCoverageReviewed(false); setView(value => ({ ...value, data: { ...value.data, topics: value.data.topics.map(topic => topic.id === id ? { ...topic, ...patch } : topic) } })) }
  const act = async action => {
    if (action === 'generate' && topics.length && !window.confirm('将重新综合本年度报告，生成新的待审核草稿。已保存意见留存历史，未保存修改会被替换。是否继续？')) return
    const ticket = ++request.current
    setBusy(true); setError('')
    try {
      const result = action === 'generate' ? await staffAPI.generateAnnualReportProblems(patientId, year, row?.__v ?? null)
        : await staffAPI.reviewAnnualReportProblems(patientId, year, { action, revision: row.__v, topics, coverageReviewed })
      if (active.current === scope && ticket === request.current) { setView(value => ({ ...value, data: result.data, stale: false })); setDirty(false); setCoverageReviewed(false) }
    } catch (e) { if (active.current === scope && ticket === request.current) setError(e.message) }
    finally { if (active.current === scope && ticket === request.current) setBusy(false) }
  }
  return <section id="report-followup-drafts" className="report-issues">
    <header className="report-issues-heading"><div><h3>{year}年 · 问题与建议</h3><p>合并相关检查 → 分析与建议 → 顾问审核</p></div><button disabled={busy} onClick={() => { if (!dirty || window.confirm('刷新会替换未保存修改，是否继续？')) load() }}>刷新</button></header>
    <div className="report-issues-overview"><span>本年度 {view.reportCount} 份已审核报告</span>{(topics.length > 0 || ['ready', 'approved'].includes(row?.status)) && <b>{topics.length}个综合管理问题</b>}{row?.status === 'approved' && <b>健康顾问已审核</b>}</div>
    {error && <p role="alert" className="report-issues-error">{error}</p>}
    {view.stale && <p className="report-issues-error">来源资料已更新，请重新综合整理后审核。</p>}
    {row?.message && <p role="status">{row.status === 'failed' && row.message.startsWith('综合整理未完成') ? '上次生成未完成，请重新生成问题与建议。' : row.message}</p>}
    {row?.canRetry && <p className="report-issues-error">本次生成等待过久，可点击重新综合整理重试。</p>}

    {canEdit && <div className="report-issues-actions"><button className="annual-problem-generate" disabled={busy || generating || !view.reportCount} onClick={() => act('generate')}>{generating ? '正在综合整理…' : row?.status === 'failed' ? '重新生成问题与建议' : topics.length ? '重新整理' : '生成问题与建议'}</button></div>}
    {row?.status === 'failed' && topics.length > 0 && <p>下方保留上次草稿，仅供对照；本次生成尚未成功。</p>}
    {topics.map((topic, index) => <AnnualProblemCard key={`${scope}:${topic.id}`} topic={topic} index={index} disabled={!editable} approved={row?.status === 'approved'} onChange={patch => update(topic.id, patch)} />)}
    {row?.status === 'ready' && !topics.length && <p>已核对的资料未整理出需要管理的问题，请顾问确认资料范围。</p>}
    {!!row?.coverage?.length && <details className="report-issues-coverage"><summary>资料范围与整理依据（{row.coverage?.length || 0}项）</summary>
      <p>正常或无需跟进：{row.coverage?.filter(item => item.status === 'normal').length || 0}项。覆盖范围仅限本年度已审核且已解析报告。</p>
      {row.summaryReference && <details><summary>参考的已审核年度筛查小结</summary>{[['tumor_risk', '肿瘤筛查'], ['cardiovascular_risk', '心脑血管病筛查'], ['chronic_disease', '慢性病及其他']].map(([key, label]) => <div key={key}><b>{label}</b><p>{row.summaryReference.sections?.[key]?.summary || '暂无内容'}</p></div>)}</details>}
      {!!row.priorAdvice?.length && <details><summary>既有顾问意见（保留供核对）</summary>{row.priorAdvice.map((advice, i) => <p key={i}><b>{advice.problem}：</b>{advice.recommendation}{advice.exclusionReason ? `；原不纳入原因：${advice.exclusionReason}` : ''}</p>)}</details>}
      <details><summary>全部检查覆盖记录</summary>{row.coverage?.map((item, i) => <p key={i}>{item.reportTitle} · {item.name}：{item.status === 'normal' ? '正常或无需跟进' : '已纳入综合问题'}</p>)}</details>
      {!!row.historyCount && <p>保留了 {row.historyCount} 次保存或重新整理前的版本。</p>}
    </details>}
    {canEdit && row?.status === 'ready' && <div className="report-issues-confirm"><button disabled={!editable} onClick={() => act('save')}>保存修改</button><label><input type="checkbox" disabled={!editable} checked={coverageReviewed} onChange={e => setCoverageReviewed(e.target.checked)} />已核对全部问题及资料范围</label><button disabled={!editable || !coverageReviewed || topics.some(topic => !topic.reviewed)} onClick={() => act('approve')}>审核通过，纳入年度方案依据</button></div>}
    {row?.status === 'approved' && <p className="report-issues-success">已作为年度方案编制依据。已有年度方案需在编制或补充时融合。</p>}
  </section>
}
