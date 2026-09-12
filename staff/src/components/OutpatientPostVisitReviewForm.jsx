import React from 'react'

export const isOutpatientPostVisitReviewTask = task => task?.taskRole === 'executor' && /门诊一站式.*查看陪诊资料并制定随访计划/.test(task?.theme || '')

export const emptyOutpatientPostVisitReview = value => ({
  reportIds: Array.isArray(value?.reportIds) ? value.reportIds : [],
  reviewSummary: value?.reviewSummary || '',
  followUpContent: value?.followUpContent || '',
  followUpDate: value?.followUpDate || '',
})

export const validateOutpatientPostVisitReview = value => !value?.reviewSummary?.trim()
  ? '请填写陪诊资料查看结论'
  : !value?.followUpContent?.trim()
    ? '请填写后续随访内容'
    : !value?.followUpDate ? '请选择随访日期' : ''

const labelStyle = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }

export default function OutpatientPostVisitReviewForm({ value, onChange }) {
  const data = emptyOutpatientPostVisitReview(value)
  const update = patch => onChange({ ...data, ...patch })
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ padding: 14, border: '1px solid #B9DDD0', borderRadius: 10, background: '#F2F8F5', lineHeight: 1.8 }}>
      <b>陪诊资料已由健管专员审核</b>
      <div style={{ fontSize: 12, color: '#65776F' }}>请先在报告管理中查看当日检验检查单和门诊病历，再记录医学判断并生成后续随访计划。</div>
    </section>
    <label style={labelStyle}>资料查看结论 *<textarea className="form-control" rows={4} value={data.reviewSummary} onChange={e => update({ reviewSummary: e.target.value })} placeholder="概括检查情况、专家诊疗意见、用药及后续关注重点" /></label>
    <label style={labelStyle}>后续随访内容 *<textarea className="form-control" rows={4} value={data.followUpContent} onChange={e => update({ followUpContent: e.target.value })} placeholder="填写需要跟进的症状、用药、检查结果、复查或复诊事项" /></label>
    <label style={labelStyle}>首次随访日期 *<input type="date" className="form-control" value={data.followUpDate} onChange={e => update({ followUpDate: e.target.value })} /></label>
  </div>
}
