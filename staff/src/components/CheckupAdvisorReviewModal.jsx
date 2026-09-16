import React, { useMemo, useState } from 'react'
import { staffAPI } from '../api'

export const isCheckupAdvisorReviewTask = task => task?.workflowKey === 'checkup_appointment:advisor_review' && task?.aiStatus === 'pending'

const dateValue = value => value ? new Date(value).toISOString().slice(0, 10) : ''

export default function CheckupAdvisorReviewModal({ task, onClose, onDone, onOpenReport }) {
  const review = task.formData?.managerReview || {}
  const [reviewSummary, setReviewSummary] = useState(review.reviewSummary || '')
  const [followUpContent, setFollowUpContent] = useState(task.content || review.followUpContent || '')
  const [followUpDate, setFollowUpDate] = useState(dateValue(task.date || review.followUpDate))
  const [returnNote, setReturnNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const reports = useMemo(() => Object.entries(review.reportAssignments || {}).flatMap(([item, ids]) => (ids || []).map((id, index) => ({ item, id, index }))), [review.reportAssignments])

  const submit = async action => {
    if (action === 'approve' && (!reviewSummary.trim() || !followUpContent.trim() || !followUpDate)) {
      setError('请核对资料审核结论、后续随访计划和随访日期后再审核通过')
      return
    }
    setSaving(true); setError('')
    try {
      await staffAPI.reviewFollowUp(task._id, {
        action,
        edits: action === 'approve'
          ? { content: followUpContent.trim(), date: followUpDate, reviewSummary: reviewSummary.trim(), followUpDate }
          : { returnNote: returnNote.trim() },
      })
      onDone(action === 'approve' ? '已审核通过，待约检服务已结束' : '已退回健管专员补充或修改')
    } catch (err) { setError(err.message || '提交审核失败') } finally { setSaving(false) }
  }

  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal" style={{ maxWidth: 780 }} onClick={event => event.stopPropagation()}>
      <div className="modal-header"><h3 className="modal-title">待约检 · 随访计划审核</h3><button className="modal-close" onClick={onClose}>✕</button></div>
      <div className="modal-body" style={{ display: 'grid', gap: 14, maxHeight: '72vh', overflowY: 'auto' }}>
        <section style={{ padding: 12, borderRadius: 9, background: '#FFF8ED', fontSize: 13, lineHeight: 1.7 }}>
          <b>健康顾问审核：</b>核对健管专员已关联的逐项检查报告和 AI 草稿。可直接修改后审核通过；资料不足时退回健管专员补充。
        </section>
        <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 8 }}>
          <b>本次已关联资料</b>
          {reports.length ? <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{reports.map(({ item, id, index }) => <button key={`${item}:${id}`} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(id, `${item}报告 ${index + 1}`)}>查看{item}报告</button>)}</div> : <span style={{ color: '#B45309', fontSize: 13 }}>未找到已关联的检查报告</span>}
          <div style={{ fontSize: 12, color: '#65776F' }}>门诊病历为选填，不影响本次审核。</div>
        </section>
        <label style={{ display: 'grid', gap: 6, color: '#51665C', fontWeight: 650 }}>资料审核结论 *
          <textarea className="form-control" rows={4} value={reviewSummary} onChange={event => setReviewSummary(event.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6, color: '#51665C', fontWeight: 650 }}>后续随访计划 *
          <textarea className="form-control" rows={6} value={followUpContent} onChange={event => setFollowUpContent(event.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6, color: '#51665C', fontWeight: 650 }}>建议随访日期 *
          <input className="form-control" type="date" value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6, color: '#51665C', fontWeight: 650 }}>退回说明（选填）
          <textarea className="form-control" rows={2} value={returnNote} onChange={event => setReturnNote(event.target.value)} placeholder="例如：请补充某项报告的原始内容或修正随访建议" />
        </label>
        {error && <div style={{ color: '#B42318', fontSize: 13 }}>{error}</div>}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" disabled={saving} onClick={() => submit('reject')}>退回健管专员修改</button>
        <button className="btn btn-primary" disabled={saving} onClick={() => submit('approve')}>{saving ? '提交中…' : '审核通过并结束服务'}</button>
      </div>
    </div>
  </div>
}
