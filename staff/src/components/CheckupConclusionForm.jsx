import React, { useEffect, useState } from 'react'
import { checkupConclusionStage } from '../utils/checkupTaskRouting'
import { staffAPI } from '../api'
import FollowUpOutcomeReview from './FollowUpOutcomeReview'

export default function CheckupConclusionForm({ task, value, onChange, onMergedMode, onSaved }) {
  const final = checkupConclusionStage(task) === 'final_acceptance'
  const [context, setContext] = useState(undefined), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (final) { onMergedMode?.(false); return }
    onMergedMode?.(true)
    staffAPI.getCheckupOutcomeContext(task._id).then(r => {
      if (active) { setContext(r.data); onMergedMode?.(Boolean(r.data?.item)) }
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [task._id, final])
  if (!final && error) return <p role="alert">{error}；请关闭后重试，未提交任何结果。</p>
  if (!final && context === undefined) return <p>正在核对原随访来源…</p>
  if (!final && context?.item) return <section>
    <h4>体检结果评估与后续安排 · 一次确认</h4>
    <p>本次确认同时保留原健管计划的结案依据。最终验收及核销完成后自动结案，无需再次请顾问确认。</p>
    <FollowUpOutcomeReview item={context.item} serviceMode onSaved={onSaved} submitApi={{ ...staffAPI,
      reviewReportFollowUpDraft: (id, body) => staffAPI.reviewReportFollowUpDraft(id, { ...body, serviceReviewId: task._id }),
      reviewFollowUpOutcome: (_id, body) => staffAPI.updateFollowUp(task._id, {
        status: 'completed', content: body.note, checkupOutcome: body,
      }),
    }} />
  </section>
  return <section>
    <h4>{final ? '最终验收结论' : '体检结果评估与后续安排'}</h4>
    <p>{final ? '核对已完成环节、客户沟通结果及遗留事项交接；本结论不会代替前置岗位执行。' : '依据已审核报告填写评估结论和后续随访安排；无需跟进时说明依据。本环节不重复回收报告。'}</p>
    <label>{final ? '验收结论与遗留事项（必填）' : '评估结论与随访安排（必填）'}
      <textarea className="form-control" rows={6} value={value || ''} onChange={e => onChange(e.target.value)} />
    </label>
  </section>
}
