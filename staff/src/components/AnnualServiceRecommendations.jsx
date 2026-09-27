import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const EMPTY = { finding: '', evidence: '', recommendation: '', timeframe: '', nextStep: '' }
const INPUTS = [
  ['finding', '发现的问题', '如：体检记录提示牙结石'],
  ['evidence', '客观依据', '填写报告名称、日期或已核实的记录'],
  ['recommendation', '建议服务', '如：建议口腔科评估是否需要洁牙'],
  ['timeframe', '建议时机', '如：近期，可与客户商量'],
  ['nextStep', '下一步说明', '如：具体处理以口腔医生评估为准'],
]

export default function AnnualServiceRecommendations({ planId, pushedAt, canEdit, toast }) {
  const [rows, setRows] = useState([])
  const [draft, setDraft] = useState(EMPTY)
  const [editingId, setEditingId] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    if (!planId) { setRows([]); return () => { active = false } }
    staffAPI.getAnnualServiceRecommendations(planId).then(res => { if (active) setRows(res.data || []) }).catch(err => toast(err.message || '读取服务建议失败'))
    return () => { active = false }
  }, [planId])

  const reset = () => { setEditingId(''); setDraft(EMPTY) }
  const save = async () => {
    if (!draft.finding.trim() || !draft.evidence.trim() || !draft.recommendation.trim()) { toast('请填写发现的问题、客观依据和服务建议'); return }
    setBusy(true)
    try {
      const res = editingId
        ? await staffAPI.updateAnnualServiceRecommendation(planId, editingId, draft)
        : await staffAPI.addAnnualServiceRecommendation(planId, draft)
      setRows(prev => editingId ? prev.map(row => row._id === editingId ? res.data : row) : [...prev, res.data])
      reset()
      toast('建议草稿已保存；单独发布后客户才能看到')
    } catch (err) { toast(err.message || '保存服务建议失败') }
    finally { setBusy(false) }
  }
  const publish = async row => {
    if (!pushedAt) { toast('请先审核并推送年度方案'); return }
    if (!window.confirm(`确认向客户发布「${row.recommendation}」？发布后不能覆盖原文。`)) return
    setBusy(true)
    try {
      const res = await staffAPI.publishAnnualServiceRecommendation(planId, row._id)
      setRows(prev => prev.map(item => item._id === row._id ? res.data : item))
      if (editingId === row._id) reset()
      toast('服务建议已发布；不会自动生成任务或订单')
    } catch (err) { toast(err.message || '发布失败') }
    finally { setBusy(false) }
  }
  const markHandled = async row => {
    const note = window.prompt('请记录实际联系结果或已发起的服务（不会自动创建订单）：')
    if (note === null) return
    if (!note.trim()) { toast('请填写实际处理记录'); return }
    setBusy(true)
    try {
      const res = await staffAPI.handleAnnualServiceRecommendation(planId, row._id, note.trim())
      setRows(prev => prev.map(item => item._id === row._id ? res.data : item))
      toast('客户意向已记录处理，顾问待办将关闭')
    } catch (err) { toast(err.message || '记录处理失败') }
    finally { setBusy(false) }
  }

  return <section style={{ background: '#fff', border: '1px solid #CFE3D9', borderRadius: 12, marginBottom: 16, padding: 18 }}>
    <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2B24' }}>💡 服务建议（非执行任务）</div>
    <div style={{ fontSize: 12, color: '#6B8177', margin: '5px 0 14px' }}>健康顾问核实依据后单独发布。客户选择“需要协助”只记录意向；具体服务仍须由工作人员按现有流程发起。</div>
    {!planId && <div style={{ color: '#8AA89C', fontSize: 13 }}>请先保存年度方案，再添加服务建议。</div>}
    {rows.map(row => <div key={row._id} style={{ borderTop: '1px solid #E8EEE9', padding: '12px 0', fontSize: 13, lineHeight: 1.7 }}>
      <div><strong>{row.recommendation}</strong> <span style={{ color: row.status === 'published' ? '#1E6B50' : '#D97706' }}>· {row.status === 'published' ? '已发布' : '草稿'}</span></div>
      <div>发现：{row.finding}；依据：{row.evidence}</div>
      {row.timeframe && <div>建议时机：{row.timeframe}</div>}
      {row.nextStep && <div>下一步：{row.nextStep}</div>}
      {row.status === 'published' && <div style={{ color: '#1E6B50' }}>客户选择：{row.response === 'interested' ? '需要协助，请人工联系并发起服务' : row.response === 'declined' ? '暂不安排' : '尚未选择'}</div>}
      {row.handledAt && <div style={{ color: '#6B8177' }}>已处理：{row.handlingNote}</div>}
      {canEdit && row.status === 'published' && row.response === 'interested' && !row.handledAt && <button type="button" disabled={busy} onClick={() => markHandled(row)}>记录联系或服务发起结果</button>}
      {canEdit && row.status === 'draft' && <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <button type="button" disabled={busy} onClick={() => { setEditingId(row._id); setDraft(Object.fromEntries(Object.keys(EMPTY).map(key => [key, row[key] || '']))) }}>编辑草稿</button>
        <button type="button" disabled={busy || !pushedAt} onClick={() => publish(row)}>发布给客户</button>
      </div>}
    </div>)}
    {planId && canEdit && <div style={{ borderTop: '1px solid #E8EEE9', paddingTop: 12 }}>
      <strong style={{ fontSize: 13 }}>{editingId ? '编辑建议草稿' : '新增服务建议'}</strong>
      {INPUTS.map(([key, label, placeholder]) => <label key={key} style={{ display: 'block', fontSize: 12, color: '#4A6558', marginTop: 10 }}>
        {label}{['finding', 'evidence', 'recommendation'].includes(key) ? ' *' : ''}
        <input value={draft[key]} onChange={event => setDraft(prev => ({ ...prev, [key]: event.target.value }))} placeholder={placeholder} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid #D9E2DC', borderRadius: 7 }} />
      </label>)}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}><button type="button" disabled={busy} onClick={save}>保存建议草稿</button>{editingId && <button type="button" onClick={reset}>取消编辑</button>}</div>
    </div>}
  </section>
}
