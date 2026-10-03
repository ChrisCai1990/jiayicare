import React, { useState } from 'react'
import { staffAPI } from '../api'
import { specialtyIssueSuggestions } from '../utils/specialtyIssueSuggestion.mjs'

export default function SpecialtyConcernButton({ patientId, year, source, sourceLabel, sourceText = '', suggestedIssue = '', staff, toast, onOpenReview }) {
  const [open, setOpen] = useState(false)
  const suggestions = specialtyIssueSuggestions(sourceText)
  const [issueTitle, setIssueTitle] = useState('')
  const [busy, setBusy] = useState(false)
  if (!['familyDoctor', 'superadmin'].includes(staff?.role) || !source) return null
  const submit = async () => {
    const title = issueTitle.trim()
    if (title.length < 2 || title.length > 60) return toast('请填写2至60字的具体问题，如“肺结节”', 'error')
    setBusy(true)
    try {
      const prepared = await staffAPI.prepareAnnualComprehensiveReview(patientId, year)
      const result = await staffAPI.addAiCaseReviewConcern(patientId, prepared.data._id, { ...source, issueTitle: title })
      setOpen(false)
      toast(result.reused ? '该问题已在年度综合研判中' : '具体问题已纳入年度综合研判')
      onOpenReview(prepared.data._id)
    } catch (error) { toast(error.message || '纳入年度研判失败', 'error') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); setIssueTitle(suggestedIssue || suggestions[0] || ''); setOpen(true) }}>＋ 纳入年度研判</button>
    {open && <div className="modal-overlay" onClick={event => event.stopPropagation()}><div className="modal" style={{ maxWidth: 500 }}>
      <div className="modal-header"><div className="modal-title">纳入年度综合研判 · 具体问题</div><button className="modal-close" onClick={() => setOpen(false)}>×</button></div>
      <div className="modal-body"><div style={{ fontSize: 13, color: '#65776F', marginBottom: 10 }}>来源：{sourceLabel || '已审核资料'}。请填写要研判的具体问题，系统会保留原始资料关联。</div>
        <label className="form-label">具体问题名称（可修改）</label><input autoFocus className="form-input" maxLength={60} value={issueTitle} onChange={event => setIssueTitle(event.target.value)} placeholder="例如：肺结节" onKeyDown={event => { if (event.key === 'Enter') submit() }} />
        {!suggestedIssue && suggestions.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#65776F' }}>从当前资料提取的候选问题，请核对：<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>{suggestions.map(title => <button key={title} type="button" className="btn btn-secondary btn-sm" onClick={() => setIssueTitle(title)}>{title}</button>)}</div></div>}
        {!suggestedIssue && suggestions.length === 0 && <div style={{ fontSize: 12, color: '#A16620', marginTop: 8 }}>当前资料未识别出明确的问题名称，请健康顾问填写。</div>}
        <div style={{ fontSize: 12, color: '#65776F', marginTop: 8 }}>该问题将和其他具体问题、五年趋势及风险维度一起分析；请在年度研判页启动或更新 AI 分析。</div>
      </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setOpen(false)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '纳入年度研判'}</button></div>
    </div></div>}
  </>
}
