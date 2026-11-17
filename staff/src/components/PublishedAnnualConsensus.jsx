import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function PublishedAnnualConsensus({ patientId, plan, topics, onSaved, toast }) {
  const [draft, setDraft] = useState({ currentUnderstanding: '', concern: '', method: '电话', frequency: '每次沟通后确定下一次时间', firstDate: '' })
  const [currentTopic, setCurrentTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [task, setTask] = useState(null)
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const existing = (plan.moduleData?.health_consensus?.records || []).length > 0
  const selectedTopics = currentTopic.trim() ? [currentTopic.trim()] : []
  useEffect(() => {
    if (!existing) return
    let active = true
    staffAPI.getAnnualConsensusTrial(patientId, plan._id).then(result => { if (active) setTask(result.data) }).catch(() => {})
    return () => { active = false }
  }, [existing, patientId, plan._id])
  useEffect(() => {
    if (existing) return
    let active = true
    staffAPI.getAnnualConsensusDraft(patientId, plan._id).then(result => {
      if (!active || !result.data) return
      const saved = result.data
      setDraft({ currentUnderstanding: saved.currentUnderstanding || '', concern: saved.concern || '',
        method: saved.method || '电话', frequency: saved.frequency || '', firstDate: saved.firstDate || '' })
      setCurrentTopic(saved.currentTopic || saved.topicPath?.[0] || '')
      setDraftSavedAt(saved.savedAt || '')
    }).catch(() => {})
    return () => { active = false }
  }, [existing, patientId, plan._id])
  if (existing) {
    const path = task?.formData?.healthConsensus?.topicPath || plan.moduleData.health_consensus.records[0]?.topicPath || []
    const index = task?.formData?.healthConsensus?.currentTopicIndex || 0
    return <div style={{ marginTop: 10, fontSize: 13 }}>
      当前主题：{path[index] || plan.moduleData.health_consensus.records[0]?.question || '待核对'} · {Math.min(index + 1, path.length || 1)}/{path.length || 1} · {task?.status === 'completed' ? '沟通计划已结束' : task ? '顾问继续跟进' : '任务待核对'}
      {task && <a style={{ marginLeft: 8 }} href={`/patients/${patientId}?tab=followups&followUpId=${task._id}`}>查看并修改本次沟通</a>}
    </div>
  }
  const saveDraft = async () => {
    setBusy(true); setError('')
    try {
      const result = await staffAPI.saveAnnualConsensusDraft(patientId, plan._id, {
        baseUpdatedAt: plan.updatedAt, currentUnderstanding: draft.currentUnderstanding, concern: draft.concern,
        topicPath: selectedTopics, currentTopic: selectedTopics[0] || '',
        method: draft.method, frequency: draft.frequency, firstDate: draft.firstDate,
      })
      setDraftSavedAt(result.data.draft.savedAt)
      onSaved({ ...plan, updatedAt: result.data.updatedAt })
      toast(result.message || '共识草稿已保存')
    } catch (cause) { setError(cause.message || '保存草稿失败，请刷新后核对') }
    finally { setBusy(false) }
  }
  const save = async () => {
    const topicPath = selectedTopics
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
  return <details style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>健康认知与共识 · {draftSavedAt ? '草稿已保存，可继续修改' : '选择主题并保存'}</summary>
    <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={saveDraft}>{busy ? '保存中…' : draftSavedAt ? '保存修改' : '保存草稿'}</button><span style={{ fontSize: 12, color: '#62776A' }}>{draftSavedAt ? `上次保存：${new Date(draftSavedAt).toLocaleString('zh-CN')}` : '保存草稿不会安排任务或通知客户'}</span></div>
      <div style={{ fontSize: 12, color: '#62776A' }}>先选本次要沟通的一个主题。后续每次沟通后，再决定继续或选择下一主题。</div>
      <label>客户当前理解<textarea className="form-input" rows={2} maxLength={1000} value={draft.currentUnderstanding} onChange={event => setDraft({ ...draft, currentUnderstanding: event.target.value })} /></label>
      <label>客户顾虑<textarea className="form-input" rows={2} maxLength={1000} value={draft.concern} onChange={event => setDraft({ ...draft, concern: event.target.value })} /></label>
      <label>本次沟通主题<input className="form-input" list="annual-consensus-topics" maxLength={120} value={currentTopic} onChange={event => setCurrentTopic(event.target.value)} placeholder="从建议主题中选一个，也可填写客户专属主题" /><datalist id="annual-consensus-topics">{topics.map(topic => <option key={topic} value={topic} />)}</datalist></label>
      <label>沟通方式<select className="form-input" value={draft.method} onChange={event => setDraft({ ...draft, method: event.target.value })}><option value="电话">电话</option><option value="到店">到店</option><option value="上门">上门</option></select></label>
      <label>沟通频率<input className="form-input" maxLength={100} value={draft.frequency} onChange={event => setDraft({ ...draft, frequency: event.target.value })} /></label>
      <label>首次沟通日期<input className="form-input" type="date" min={new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())} value={draft.firstDate} onChange={event => setDraft({ ...draft, firstDate: event.target.value })} /></label>
      {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={saveDraft}>{busy ? '保存中…' : draftSavedAt ? '保存修改' : '保存草稿'}</button><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? '安排中…' : '确认并安排首个主题'}</button></div>
    </div>
  </details>
}
