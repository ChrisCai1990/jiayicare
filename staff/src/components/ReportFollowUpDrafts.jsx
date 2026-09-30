import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'
import './ReportFollowUpDrafts.css'
import { approvedScreeningReference, compactEvidence, evidenceSummary, groupedIssues, problemGroups } from '../utils/reportIssuePresentation'

const PURPOSE = 'annual_report_input'
const statusLabel = { advisor_review: '待顾问确认', approved: '已确认', rejected: '未采纳', excluded: '已有服务承接', superseded: '来源已更新', no_action: '待重新核对' }

export function ReportIssueCard({ issue, index, disabled, onChange }) {
  const proposal = issue.originalRecommendation || issue.suggestedRecommendation
  const sources = issue.sourceRefs || [{ sourceName: issue.sourceName, page: issue.page, excerpt: issue.evidence }]
  return <article className="report-issue-card report-issue-compact">
    <header><span className="report-issue-number">{index + 1}</span><strong>{issue.title || '待补充问题'}</strong><span className="report-issue-tag">{issue.decision === 'exclude' ? '不纳入' : issue.advisorRecommendation ? '已填写建议' : proposal ? '待确认建议' : '待补建议'}</span></header>
    {issue.evidence && <p className="report-issue-summary"><b>依据：</b>{evidenceSummary(issue.evidence)}</p>}
    {sources.length > 1 && <p className="report-issue-summary">合并 {new Set(sources.map(source => source.sourceId || source.sourceName)).size} 处依据：{[...new Set(sources.map(source => source.sourceName))].join('、')}。不同日期及描述请在来源中核对。</p>}
    {issue.reviewCarryover && <p className="report-issues-error">已有顾问意见保留，请核对其对应问题；未自动拆分或改写。</p>}
    {issue.recommendationConflict && <div className="report-issues-error">原有顾问意见不一致，请统一确认：{issue.advisorAlternatives?.map((note, i) => <p key={i}>{note}</p>)}</div>}
    <div className="report-issue-analysis"><b>问题分析{issue.analysis ? '（草稿，待顾问核对）' : ''}</b><p>{issue.analysis || (issue.needsVerification ? '现有资料尚不足以明确判断，请先核实原文及相关资料。' : '旧稿尚无问题分析，可按问题重新整理后核对；请结合上述依据和年度筛查小结判断管理重点。')}</p></div>
    {proposal && <div className="report-issue-recommendations">
      {issue.originalRecommendation && <p><b>原文建议：</b>{issue.originalRecommendation}</p>}
      {issue.suggestedRecommendation && issue.suggestedRecommendation !== issue.originalRecommendation && <p><b>系统建议草稿（待审核）：</b>{issue.suggestedRecommendation}</p>}
      {issue.timing && <p><b>原文时间要求：</b>{issue.timing}</p>}
    </div>}
    <fieldset disabled={disabled}>
      <label>顾问确认建议<textarea value={issue.advisorRecommendation || ''} maxLength={6000} rows={2} placeholder="填写处理建议，供年度方案融合" onChange={e => onChange({ advisorRecommendation: e.target.value })} /></label>
      <div className="report-issue-row"><label>年度方案<select value={issue.decision || 'include'} onChange={e => onChange({ decision: e.target.value })}><option value="include">纳入编制参考</option><option value="exclude">暂不纳入</option></select></label>{proposal && !disabled && <button type="button" onClick={() => onChange({ advisorRecommendation: proposal })}>{issue.originalRecommendation ? '采用原文建议' : '带入系统建议'}</button>}</div>
      {issue.decision === 'exclude' && <label>不纳入原因<input maxLength={2000} value={issue.exclusionReason || ''} onChange={e => onChange({ exclusionReason: e.target.value })} placeholder="例如：与另一问题合并" /></label>}
      <details className="report-issue-evidence"><summary>依据与建议来源 · {sources.length}处</summary>
        <label>问题名称<input value={issue.title || ''} maxLength={200} onChange={e => onChange({ title: e.target.value })} /></label>
        <label>问题分组<select value={issue.group || groupedIssues([issue])[0]?.key || 'other'} onChange={e => onChange({ group: e.target.value })}>{problemGroups.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {sources.map((source, i) => <div key={i} className="report-problem-source"><b>{source.sourceName || '顾问补充'}{source.page ? ` · 第${source.page}页` : ''}{source.date ? ` · ${String(source.date).slice(0, 10)}` : ''}</b><p>{compactEvidence(source.excerpt || source.evidence) || '请在建议中说明依据。'}</p>{source.evidence && source.evidence !== source.excerpt && <details><summary>查看该检查完整原文</summary><p>{compactEvidence(source.evidence)}</p></details>}</div>)}
      </details>
    </fieldset>
  </article>
}

export default function ReportFollowUpDrafts({ patientId, year, canEdit }) {
  const [rows, setRows] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [screening, setScreening] = useState({ rows: [], patientId: null, error: '', loading: true })
  const [dirtyRows, setDirtyRows] = useState({}), [reviewed, setReviewed] = useState({})
  const dirty = Object.values(dirtyRows).some(Boolean)
  const activePatient = useRef(patientId); activePatient.current = patientId
  const load = async () => {
    const requestedPatient = patientId
    setBusy(true); setError('')
    try { const result = await staffAPI.getReportFollowUpDrafts(patientId); if (activePatient.current === requestedPatient) { setRows(result.data || []); setDirtyRows({}); setReviewed({}) } }
    catch (e) { if (activePatient.current === requestedPatient) setError(e.message) } finally { if (activePatient.current === requestedPatient) setBusy(false) }
  }
  useEffect(() => { setRows([]); setReviewed({}); setDirtyRows({}); load() }, [patientId])
  useEffect(() => {
    let cancelled = false
    setScreening({ rows: [], patientId, error: '', loading: true })
    staffAPI.getScreeningYearSummaries(patientId).then(result => {
      if (!cancelled) setScreening({ rows: result.data || [], patientId, error: '', loading: false })
    }).catch(() => { if (!cancelled) setScreening({ rows: [], patientId, error: '年度筛查小结读取失败，请刷新页面重试。', loading: false }) })
    return () => { cancelled = true }
  }, [patientId, year])
  useEffect(() => {
    if (dirty || !rows.some(row => ['queued', 'running'].includes(row.followUpAutomation?.status))) return
    const timer = setTimeout(load, 5000)
    return () => clearTimeout(timer)
  }, [rows, dirty, patientId])
  const update = (id, drafts) => { setDirtyRows(prev => ({ ...prev, [id]: true })); setReviewed(prev => ({ ...prev, [id]: false })); setRows(prev => prev.map(row => row._id === id ? { ...row, issueDrafts: drafts } : row)) }
  const act = async (row, action, coverageDecisions) => {
    if (action === 'generate' && (dirty || row.issueDrafts?.length || row.followUpDrafts?.length) && !window.confirm('将按健康问题重新整理并合并多处来源。已保存的顾问意见会保留，无法准确对应的意见单列待核对；未保存编辑会被替换。是否继续？')) return
    const requestedPatient = patientId
    setBusy(true); setError('')
    try {
      const result = action === 'generate'
        ? await staffAPI.generateReportFollowUpDraft(row._id, { revision: row.__v, issueMode: true })
        : await staffAPI.reviewReportFollowUpDraft(row._id, { action, revision: row.__v, issueDrafts: row.issueDrafts || [], coverageReviewed: reviewed[row._id] === true, coverageDecisions })
      if (activePatient.current !== requestedPatient) return
      setRows(prev => prev.map(item => item._id === row._id ? result.data : item)); setReviewed(prev => ({ ...prev, [row._id]: false })); setDirtyRows(prev => ({ ...prev, [row._id]: false }))
    } catch (e) { if (activePatient.current === requestedPatient) setError(e.message) } finally { if (activePatient.current === requestedPatient) setBusy(false) }
  }
  const reference = screening.patientId === patientId ? approvedScreeningReference(screening.rows, year) : null
  return <section id="report-followup-drafts" className="report-issues">
    <header className="report-issues-heading"><div><h3>年度管理重点 · 问题、分析与建议</h3><p>先参考年度筛查小结定位重点，再逐项确认问题分析和处理建议，纳入年度管理方案。</p></div><button disabled={busy} onClick={() => { if (!dirty || window.confirm('刷新会替换未保存编辑，是否继续？')) load() }}>刷新状态</button></header>
    <div className="report-screening-reference"><h4>{year}年度筛查小结 · 定位参考</h4>
      {screening.error ? <p role="alert">{screening.error}</p> : screening.loading ? <p>正在读取年度筛查小结…</p> : reference ? <>
        <p className="report-issue-summary">已审核{reference.createdAt ? ` · ${String(reference.createdAt).slice(0, 10)}` : ''}。结合原报告核对，后续新发现仍需补充。</p>
        {[['tumor_risk', '肿瘤筛查'], ['cardiovascular_risk', '心脑血管病筛查'], ['chronic_disease', '慢性病及其他']].map(([key, label]) => <details key={key}><summary>{label}</summary><p>{reference.sections?.[key]?.summary || '暂无相关小结'}</p></details>)}
      </> : <p>本年度暂无已审核小结，可先核对下方报告问题。</p>}
    </div>
    {error && <p role="alert" className="report-issues-error">{error}</p>}
    {!rows.length && <p>暂无问题整理记录。新报告审核后生成；历史资料不会自动批量重跑。</p>}
    {rows.map(row => {
      const annual = row.purpose === PURPOSE, status = row.followUpAutomation?.status
      const historical = row.status === 'approved' && !annual
      const available = canEdit && ['advisor_review', 'no_action', 'excluded'].includes(row.status)
      const editable = available && annual && status === 'ready'
      const coverage = row.issueCoverage || [], drafts = row.issueDrafts || []
      const pending = coverage.filter(item => item.status === 'pending')
      return <article key={row._id} className="report-issues-report">
        <header><h4>{row.title}</h4><span className="report-issue-tag">{historical ? '历史随访记录' : statusLabel[row.status]}</span></header>
        <p>{annual ? row.followUpAutomation?.message : historical ? '保留原已审核随访及执行记录。' : '旧版仅整理后续行动，可能遗漏未写建议的异常。请重新提取完整问题清单。'}</p>
        {annual && <div className="report-issues-overview"><b>{drafts.filter(issue => issue.decision !== 'exclude').length}项待纳入管理的问题</b><span>{drafts.filter(issue => issue.decision !== 'exclude' && !issue.advisorRecommendation).length}项建议待确认</span>{pending.length > 0 && <span>{pending.length}项资料待核对</span>}</div>}
        {annual && groupedIssues(drafts).map(group => <section key={group.key} className="report-problem-group"><h4>{group.label}<span>{group.issues.length}个问题</span></h4>{group.issues.map((issue, index) => <ReportIssueCard key={issue.id} issue={issue} index={index} disabled={busy || !editable} onChange={patch => update(row._id, drafts.map(item => item.id === issue.id ? { ...item, ...patch } : item))} />)}</section>)}
        {annual && <div className="report-issues-coverage"><p><b>{drafts.length}项问题建议</b>{pending.length > 0 && <> · {pending.length}项资料待核对</>} · {coverage.filter(item => item.status === 'normal').length}项正常或无需跟进，已略过</p>
          {!!pending.length && <details><summary>尚待判断的资料（{pending.length}项）</summary><p>可点击“按问题重新整理”自动判断，或查看下列原文后选择是否需要跟进。</p><ul>{pending.map(item => <li key={item.sourceId}><b>{item.name}</b>{item.page ? ` · 第${item.page}页` : ''}<details><summary>{evidenceSummary(row.issueSources?.find(source => source.id === item.sourceId)?.evidence) || '查看原文'}</summary><p>{compactEvidence(row.issueSources?.find(source => source.id === item.sourceId)?.evidence) || '缺少结果，请核对原件'}</p></details>{editable && <div className="report-issues-actions"><button disabled={busy} onClick={() => act(row, 'resolve_coverage', { [item.sourceId]: 'normal' })}>已核对，无需跟进</button><button disabled={busy} onClick={() => act(row, 'resolve_coverage', { [item.sourceId]: 'problem' })}>列入问题建议</button></div>}</li>)}</ul></details>}
          <details><summary>资料来源（仅供查阅）</summary>{coverage.length ? <ul>{coverage.map(item => <li key={item.sourceId}><b>{item.name}</b>{item.page ? `（第${item.page}页）` : ''}：{{ normal: '正常或无需跟进', problem: '已列入问题', uncertain: '具体问题待核实', pending: '尚未判断' }[item.status]}{item.reason ? `；${item.reason}` : ''}<details><summary>查看该项原文</summary><p>{compactEvidence(row.issueSources?.find(source => source.id === item.sourceId)?.evidence) || '缺少结果，需核对原件'}</p></details></li>)}</ul> : <p>没有可核对的结构化资料，请核对原件并补充问题。</p>}</details></div>}
        {!annual && <details><summary>查看旧版内容及来源</summary>{(row.followUpDrafts || []).map((item, i) => <div key={i}><b>{item.title}</b><p>{item.content}</p></div>)}<pre>{JSON.stringify(row.sourceSnapshot, null, 2)}</pre></details>}
        {available && <div className="report-issues-actions">
          <button disabled={busy || ['running', 'queued'].includes(status)} onClick={() => act(row, 'generate')}>按问题重新整理</button>
          {(!annual || status === 'failed') && <button disabled={busy || status === 'running'} onClick={() => act(row, 'manual_issues')}>转人工逐项核对</button>}
          {editable && <><button disabled={busy} onClick={() => update(row._id, [...drafts, { id: `manual:${crypto.randomUUID()}`, title: '', advisorRecommendation: '', decision: 'include' }])}>补充问题</button><button disabled={busy} onClick={() => act(row, 'save_issues')}>保存草稿</button></>}
        </div>}
        {editable && <div className="report-issues-confirm"><label><input type="checkbox" checked={reviewed[row._id] === true} onChange={e => setReviewed(prev => ({ ...prev, [row._id]: e.target.checked }))} />已核对资料覆盖范围及全部问题，建议可供年度方案编制参考</label><button disabled={busy || !reviewed[row._id]} onClick={() => act(row, 'confirm_issues')}>确认问题及建议</button></div>}
        {annual && row.status === 'approved' && <p className="report-issues-success">已进入年度方案编制依据。已有年度方案不会被自动改写，请在编制或补充方案时融合。</p>}
        {historical && row.followUpPublication?.status !== 'published' && <p>历史随访发布未完成，请在原服务审核流程中核对处理。</p>}
      </article>
    })}
  </section>
}
