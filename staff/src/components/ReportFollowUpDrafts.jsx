import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'
import './ReportFollowUpDrafts.css'

const PURPOSE = 'annual_report_input'
const statusLabel = { advisor_review: '待顾问确认', approved: '已确认', rejected: '未采纳', excluded: '已有服务承接', superseded: '来源已更新', no_action: '待重新核对' }

export function ReportIssueCard({ issue, index, disabled, onChange }) {
  return <article className="report-issue-card">
    <header><span className="report-issue-number">{index + 1}</span><strong>{issue.title || '待补充问题'}</strong><span className="report-issue-tag">{issue.decision === 'exclude' ? '不纳入' : issue.needsVerification ? '待核实' : '建议及依据'}</span></header>
    <fieldset disabled={disabled}>
      <label>问题名称<input value={issue.title || ''} maxLength={200} onChange={e => onChange({ title: e.target.value })} /></label>
      <details className="report-issue-evidence"><summary>查看资料依据 · {issue.sourceName || '顾问补充'}{issue.page ? ` · 第${issue.page}页` : ''}</summary><p>{issue.evidence || '此项由顾问补充，请在建议中说明依据。'}</p></details>
      <div className="report-issue-columns">
        <div className="report-issue-original"><b>原文建议</b><p>{issue.originalRecommendation || '原文未明确建议，需顾问补充。'}</p>{issue.timing && <p>原文时间要求：{issue.timing}</p>}</div>
        <div className="report-issue-proposal"><b>系统建议草稿 · 待审核</b><p>{issue.suggestedRecommendation || '尚无建议草稿，请结合资料核对。'}</p>{issue.suggestedRecommendation && !disabled && <button type="button" onClick={() => onChange({ advisorRecommendation: issue.suggestedRecommendation })}>带入确认建议</button>}{issue.originalRecommendation && !disabled && <button type="button" onClick={() => onChange({ advisorRecommendation: issue.originalRecommendation })}>采用原文建议</button>}</div>
      </div>
      <label>顾问确认建议<textarea value={issue.advisorRecommendation || ''} maxLength={6000} rows={3} placeholder="明确如何处理；资料不足时注明待补资料或待专业评估。此处不安排执行日期。" onChange={e => onChange({ advisorRecommendation: e.target.value })} /></label>
      <label>年度方案编制参考<select value={issue.decision || 'include'} onChange={e => onChange({ decision: e.target.value })}><option value="include">纳入编制参考</option><option value="exclude">不纳入，保留原因</option></select></label>
      {issue.decision === 'exclude' && <label>不纳入原因<textarea rows={2} maxLength={2000} value={issue.exclusionReason || ''} onChange={e => onChange({ exclusionReason: e.target.value })} placeholder="例如：与另一问题合并，注明对应问题" /></label>}
    </fieldset>
  </article>
}

export default function ReportFollowUpDrafts({ patientId, canEdit }) {
  const [rows, setRows] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
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
    if (dirty || !rows.some(row => ['queued', 'running'].includes(row.followUpAutomation?.status))) return
    const timer = setTimeout(load, 5000)
    return () => clearTimeout(timer)
  }, [rows, dirty, patientId])
  const update = (id, drafts) => { setDirtyRows(prev => ({ ...prev, [id]: true })); setReviewed(prev => ({ ...prev, [id]: false })); setRows(prev => prev.map(row => row._id === id ? { ...row, issueDrafts: drafts } : row)) }
  const act = async (row, action) => {
    if (action === 'generate' && (dirty || row.issueDrafts?.length || row.followUpDrafts?.length) && !window.confirm('重新从完整已解析资料提取问题，将替换当前问题草稿。已保存的上一版会保留审核记录，是否继续？')) return
    const requestedPatient = patientId
    setBusy(true); setError('')
    try {
      const result = action === 'generate'
        ? await staffAPI.generateReportFollowUpDraft(row._id, { revision: row.__v, issueMode: true })
        : await staffAPI.reviewReportFollowUpDraft(row._id, { action, revision: row.__v, issueDrafts: row.issueDrafts || [], coverageReviewed: reviewed[row._id] === true })
      if (activePatient.current !== requestedPatient) return
      setRows(prev => prev.map(item => item._id === row._id ? result.data : item)); setReviewed(prev => ({ ...prev, [row._id]: false })); setDirtyRows(prev => ({ ...prev, [row._id]: false }))
    } catch (e) { if (activePatient.current === requestedPatient) setError(e.message) } finally { if (activePatient.current === requestedPatient) setBusy(false) }
  }
  return <section id="report-followup-drafts" className="report-issues">
    <header className="report-issues-heading"><div><h3>病历与报告问题及建议</h3><p>逐项核对异常及待核实内容，确认后供年度管理方案融合；年度方案发布后统一生成随访计划。</p></div><button disabled={busy} onClick={() => { if (!dirty || window.confirm('刷新会替换未保存编辑，是否继续？')) load() }}>刷新状态</button></header>
    {error && <p role="alert" className="report-issues-error">{error}</p>}
    {!rows.length && <p>暂无问题整理记录。新报告审核后生成；历史资料不会自动批量重跑。</p>}
    {rows.map(row => {
      const annual = row.purpose === PURPOSE, status = row.followUpAutomation?.status
      const historical = row.status === 'approved' && !annual
      const available = canEdit && ['advisor_review', 'no_action', 'excluded'].includes(row.status)
      const editable = available && annual && status === 'ready'
      const coverage = row.issueCoverage || [], drafts = row.issueDrafts || []
      return <article key={row._id} className="report-issues-report">
        <header><h4>{row.title}</h4><span className="report-issue-tag">{historical ? '历史随访记录' : statusLabel[row.status]}</span></header>
        <p>{annual ? row.followUpAutomation?.message : historical ? '保留原已审核随访及执行记录。' : '旧版仅整理后续行动，可能遗漏未写建议的异常。请重新提取完整问题清单。'}</p>
        {annual && <div className="report-issues-coverage"><b>资料覆盖核对</b><p>已解析资料 {coverage.length} 项 · 问题及待核实 {drafts.length} 项 · 未提取到明确异常 {coverage.filter(item => item.status === 'normal').length} 项</p><p>仅覆盖已解析内容。缺页、未识别的检查须对照原件补充，不能视为无异常。</p><details><summary>查看全部项目及核对状态</summary>{coverage.length ? <ul>{coverage.map(item => <li key={item.sourceId}><b>{item.name}</b>{item.page ? `（第${item.page}页）` : ''}：{{ normal: '未提取到明确异常', problem: '已列入问题', uncertain: '待核实' }[item.status]}{item.reason ? `；${item.reason}` : ''}<details><summary>查看该项原文</summary><p>{row.issueSources?.find(source => source.id === item.sourceId)?.evidence || '缺少结果，需核对原件'}</p></details></li>)}</ul> : <p>没有可核对的结构化资料，请核对原件并补充问题。</p>}</details></div>}
        {annual && drafts.map((issue, index) => <ReportIssueCard key={issue.id} issue={issue} index={index} disabled={busy || !editable} onChange={patch => update(row._id, drafts.map((item, i) => i === index ? { ...item, ...patch } : item))} />)}
        {!annual && <details><summary>查看旧版内容及来源</summary>{(row.followUpDrafts || []).map((item, i) => <div key={i}><b>{item.title}</b><p>{item.content}</p></div>)}<pre>{JSON.stringify(row.sourceSnapshot, null, 2)}</pre></details>}
        {available && <div className="report-issues-actions">
          <button disabled={busy || ['running', 'queued'].includes(status)} onClick={() => act(row, 'generate')}>{annual ? '重新提取问题' : '提取完整问题及建议'}</button>
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
