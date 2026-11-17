import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function PublishedAnnualConsensus({ patientId, plan, topics, onSaved, toast }) {
  const [draft, setDraft] = useState({ currentUnderstanding: '', concern: '', method: '电话', frequency: '每次沟通后确定下一次时间', firstDate: '', topics: topics.join('\n') })
  const [currentTopic, setCurrentTopic] = useState(topics[0] || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [task, setTask] = useState(null)
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const existing = (plan.moduleData?.health_consensus?.records || []).length > 0
  const selectedTopics = draft.topics.split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 10)
  const toggleTopic = (topic, checked) => {
    const next = checked ? [...selectedTopics, topic].slice(0, 10) : selectedTopics.filter(value => value !== topic)
    setDraft(previous => ({ ...previous, topics: next.join('\n') }))
    if (!checked && currentTopic === topic) setCurrentTopic(next[0] || '')
  }
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
        method: saved.method || '电话', frequency: saved.frequency || '', firstDate: saved.firstDate || '',
        topics: (saved.topicPath || []).join('\n') })
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
        topicPath: selectedTopics, currentTopic: selectedTopics.includes(currentTopic) ? currentTopic : selectedTopics[0] || '',
        method: draft.method, frequency: draft.frequency, firstDate: draft.firstDate,
      })
      setDraftSavedAt(result.data.draft.savedAt)
      onSaved({ ...plan, updatedAt: result.data.updatedAt })
      toast(result.message || '共识草稿已保存')
    } catch (cause) { setError(cause.message || '保存草稿失败，请刷新后核对') }
    finally { setBusy(false) }
  }
  const save = async () => {
    const topicPath = currentTopic && selectedTopics.includes(currentTopic)
      ? [currentTopic, ...selectedTopics.filter(value => value !== currentTopic)] : selectedTopics
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
  return <details open style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>健康认知与共识 · {draftSavedAt ? '草稿已保存，可继续修改' : '选择主题并保存'}</summary>
    <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={saveDraft}>{busy ? '保存中…' : draftSavedAt ? '保存修改' : '保存草稿'}</button><span style={{ fontSize: 12, color: '#62776A' }}>{draftSavedAt ? `上次保存：${new Date(draftSavedAt).toLocaleString('zh-CN')}` : '保存草稿不会安排任务或通知客户'}</span></div>
      <div style={{ fontSize: 12, color: '#62776A' }}>全部主题保存在同一沟通计划中，首次只生成一条任务；每次沟通后选择继续当前主题、进入下一主题或结束。</div>
      <label>客户当前理解<textarea className="form-input" rows={2} maxLength={1000} value={draft.currentUnderstanding} onChange={event => setDraft({ ...draft, currentUnderstanding: event.target.value })} /></label>
      <label>客户顾虑<textarea className="form-input" rows={2} maxLength={1000} value={draft.concern} onChange={event => setDraft({ ...draft, concern: event.target.value })} /></label>
      <fieldset style={{ border: '1px solid #DCE7DF', borderRadius: 8, padding: 10 }}><legend>选择沟通主题（最多 10 个）</legend>
        <div style={{ display: 'grid', gap: 6 }}>{topics.map(topic => <label key={topic}><input type="checkbox" checked={selectedTopics.includes(topic)} disabled={!selectedTopics.includes(topic) && selectedTopics.length >= 10} onChange={event => toggleTopic(topic, event.target.checked)} /> {topic}</label>)}</div>
      </fieldset>
      <label>本次先沟通的主题<select className="form-input" value={selectedTopics.includes(currentTopic) ? currentTopic : selectedTopics[0] || ''} onChange={event => setCurrentTopic(event.target.value)}><option value="">请选择本次主题</option>{selectedTopics.map(topic => <option key={topic} value={topic}>{topic}</option>)}</select></label>
      <label>已选主题与后续顺序（每行一个，可调整或加入自定义主题）<textarea className="form-input" rows={Math.max(3, Math.min(10, selectedTopics.length))} maxLength={1300} value={draft.topics} onChange={event => setDraft({ ...draft, topics: event.target.value })} /></label>
      <label>沟通方式<select className="form-input" value={draft.method} onChange={event => setDraft({ ...draft, method: event.target.value })}><option value="电话">电话</option><option value="到店">到店</option><option value="上门">上门</option></select></label>
      <label>沟通频率<input className="form-input" maxLength={100} value={draft.frequency} onChange={event => setDraft({ ...draft, frequency: event.target.value })} /></label>
      <label>首次沟通日期<input className="form-input" type="date" min={new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())} value={draft.firstDate} onChange={event => setDraft({ ...draft, firstDate: event.target.value })} /></label>
      {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={saveDraft}>{busy ? '保存中…' : draftSavedAt ? '保存修改' : '保存草稿'}</button><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? '安排中…' : '确认并安排首个主题'}</button></div>
    </div>
  </details>
}
