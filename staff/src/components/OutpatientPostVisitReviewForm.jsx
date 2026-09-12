import React, { useState } from 'react'
import { staffAPI } from '../api'

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

export default function OutpatientPostVisitReviewForm({ task, value, onChange }) {
  const data = emptyOutpatientPostVisitReview(value)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const update = patch => onChange({ ...data, ...patch })
  const generateDraft = async () => {
    if (!task?._id) return
    setAiLoading(true); setAiError('')
    try {
      const result = await staffAPI.generateOutpatientFollowUpDraft(task._id)
      update(result.data || {})
    } catch (error) {
      setAiError(error.message || 'AI草稿生成失败')
    } finally { setAiLoading(false) }
  }
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ padding: 14, border: '1px solid #B9DDD0', borderRadius: 10, background: '#F2F8F5', lineHeight: 1.8 }}>
      <b>{task?.isBlocked ? '陪诊资料尚待健管专员完成审核' : '陪诊资料已由健管专员审核'}</b>
      <div style={{ fontSize: 12, color: '#65776F' }}>{task?.isBlocked ? '两份资料全部审核后，本任务和AI草稿按钮会自动启用。' : '请先在报告管理中查看当日检验检查单和门诊病历，再记录医学判断并生成后续随访计划。'}</div>
    </section>
    <section style={{ padding: 14, border: '1px solid #D8E2DE', borderRadius: 10, background: '#FAFCFB' }}>
      <button type="button" className="btn btn-secondary" onClick={generateDraft} disabled={aiLoading || task?.isBlocked}>
        {aiLoading ? 'AI正在阅读资料...' : '✨ AI根据病历生成随访草稿'}
      </button>
      <div style={{ marginTop: 8, fontSize: 12, color: '#65776F' }}>AI只生成可编辑草稿，不会直接提交；请健康顾问核对医学事实、随访内容和日期后确认。</div>
      {aiError && <div style={{ marginTop: 8, color: '#B42318', fontSize: 12 }}>{aiError}</div>}
    </section>
    <label style={labelStyle}>资料查看结论 *<textarea className="form-control" rows={4} value={data.reviewSummary} onChange={e => update({ reviewSummary: e.target.value })} placeholder="概括检查情况、专家诊疗意见、用药及后续关注重点" /></label>
    <label style={labelStyle}>后续随访内容 *<textarea className="form-control" rows={4} value={data.followUpContent} onChange={e => update({ followUpContent: e.target.value })} placeholder="填写需要跟进的症状、用药、检查结果、复查或复诊事项" /></label>
    <label style={labelStyle}>首次随访日期 *<input type="date" className="form-control" value={data.followUpDate} onChange={e => update({ followUpDate: e.target.value })} /></label>
  </div>
}
