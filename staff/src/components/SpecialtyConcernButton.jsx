import React, { useState } from 'react'
import { staffAPI } from '../api'

export default function SpecialtyConcernButton({ patientId, source, sourceLabel, suggestedIssue = '', staff, toast, onOpenReview }) {
  const [open, setOpen] = useState(false)
  const [issueTitle, setIssueTitle] = useState(suggestedIssue)
  const [busy, setBusy] = useState(false)
  if (!['familyDoctor', 'superadmin'].includes(staff?.role) || !source) return null
  const submit = async () => {
    const title = issueTitle.trim()
    if (title.length < 2 || title.length > 60) return toast('请填写2至60字的具体问题，如“肺结节”', 'error')
    setBusy(true)
    try {
      const result = await staffAPI.createSpecialtyReviewFromSource(patientId, { ...source, issueTitle: title })
      setOpen(false)
      toast(result.reused ? '已关联到该问题的现有研判' : '已建立单个问题的专项研判')
      onOpenReview(result.data._id)
    } catch (error) { toast(error.message || '纳入专项研判失败', 'error') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); setOpen(true) }}>＋ 纳入专病研判</button>
    {open && <div className="modal-overlay" onClick={event => event.stopPropagation()}><div className="modal" style={{ maxWidth: 500 }}>
      <div className="modal-header"><div className="modal-title">纳入单个专病问题</div><button className="modal-close" onClick={() => setOpen(false)}>×</button></div>
      <div className="modal-body"><div style={{ fontSize: 13, color: '#65776F', marginBottom: 10 }}>来源：{sourceLabel || '已审核资料'}。请填写要研判的具体问题，系统会保留原始资料关联。</div>
        <label className="form-label">具体问题名称</label><input autoFocus className="form-input" maxLength={60} value={issueTitle} onChange={event => setIssueTitle(event.target.value)} placeholder="例如：肺结节" onKeyDown={event => { if (event.key === 'Enter') submit() }} />
        <div style={{ fontSize: 12, color: '#65776F', marginTop: 8 }}>相同问题再次纳入时，会把新资料关联到已有研判；AI 分析需在研判页明确启动。</div>
      </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setOpen(false)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '纳入并打开研判'}</button></div>
    </div></div>}
  </>
}
