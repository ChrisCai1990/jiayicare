import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function PublishedAnnualConsensus({ patientId, plan, topics, onSaved, toast }) {
  const [draft, setDraft] = useState({ currentUnderstanding: '', concern: '', method: '电话', frequency: '每次沟通后确定下一次时间', firstDate: '', topics: topics.join('\n') })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [task, setTask] = useState(null)
  const existing = (plan.moduleData?.health_consensus?.records || []).length > 0
  useEffect(() => {
    if (!existing) return
    let active = true
    staffAPI.getAnnualConsensusTrial(patientId, plan._id).then(result => { if (active) setTask(result.data) }).catch(() => {})
    return () => { active = false }
  }, [existing, patientId, plan._id])
  if (existing) {
    const path = task?.formData?.healthConsensus?.topicPath || plan.moduleData.health_consensus.records[0]?.topicPath || []
    const index = task?.formData?.healthConsensus?.currentTopicIndex || 0
    return <div style={{ marginTop: 10, fontSize: 13 }}>
      当前主题：{path[index] || plan.moduleData.health_consensus.records[0]?.question || '待核对'} · {Math.min(index + 1, path.length || 1)}/{path.length || 1} · {task?.status === 'completed' ? '沟通计划已结束' : task ? '顾问继续跟进' : '任务待核对'}
      {task && <a style={{ marginLeft: 8 }} href={`/patients/${patientId}?tab=followups&followUpId=${task._id}`}>查看沟通任务</a>}
    </div>
  }
  const save = async () => {
    const topicPath = draft.topics.split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 10)
    if (!topicPath.length || !draft.firstDate || !draft.method.trim() || !draft.frequency.trim()) { setError('请填写主题、沟通方式、频率和首次日期'); return }
    setBusy(true); setError('')
    try {
      const result = await staffAPI.startAnnualConsensusTrial(patientId, plan._id, {
        baseUpdatedAt: plan.updatedAt, currentUnderstanding: draft.currentUnderstanding, concern: draft.concern,
        question: topicPath[0], method: draft.method, frequency: draft.frequency, firstDate: draft.firstDate, topicPath,
      })
      onSaved(result.data)
      toast(result.message || '已安排首个沟通主题')
    } catch (cause) { setError(cause.message || '安排失败，请刷新后核对') }
    finally { setBusy(false) }
  }
  return <details style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>＋ 试用健康认知与共识</summary>
    <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#62776A' }}>全部主题保存在同一沟通计划中，首次只生成一条任务；每次沟通后选择继续当前主题、进入下一主题或结束。</div>
      <label>客户当前理解<textarea className="form-input" rows={2} maxLength={1000} value={draft.currentUnderstanding} onChange={event => setDraft({ ...draft, currentUnderstanding: event.target.value })} /></label>
      <label>客户顾虑<textarea className="form-input" rows={2} maxLength={1000} value={draft.concern} onChange={event => setDraft({ ...draft, concern: event.target.value })} /></label>
      <label>主题顺序（每行一个，最多 10 个；第一项为当前主题）<textarea className="form-input" rows={10} maxLength={1300} value={draft.topics} onChange={event => setDraft({ ...draft, topics: event.target.value })} /></label>
      <label>沟通方式<select className="form-input" value={draft.method} onChange={event => setDraft({ ...draft, method: event.target.value })}><option value="电话">电话</option><option value="到店">到店</option><option value="上门">上门</option></select></label>
      <label>沟通频率<input className="form-input" maxLength={100} value={draft.frequency} onChange={event => setDraft({ ...draft, frequency: event.target.value })} /></label>
      <label>首次沟通日期<input className="form-input" type="date" min={new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())} value={draft.firstDate} onChange={event => setDraft({ ...draft, firstDate: event.target.value })} /></label>
      {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? '安排中…' : '确认并安排首个主题'}</button>
    </div>
  </details>
}
