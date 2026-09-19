import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function ReportFollowUpDrafts({ patientId, canEdit }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const load = async () => {
    setBusy(true); setError('')
    try { const result = await staffAPI.getReportFollowUpDrafts(patientId); setRows(result.data || []); setDirty(false) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  useEffect(() => { let active = true; setRows([]); setDirty(false); setError(''); staffAPI.getReportFollowUpDrafts(patientId).then(result => { if (active) setRows(result.data || []) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [patientId])
  const update = (id, drafts) => { setDirty(true); setRows(prev => prev.map(row => row._id === id ? { ...row, followUpDrafts: drafts } : row)) }
  const act = async (row, action) => {
    if (action === 'generate' && (row.followUpAutomation?.status === 'skipped' || row.followUpDrafts?.length) && !window.confirm('请先对照已有随访，仅保留新增或变化事项。继续生成会替换当前未保存编辑，是否继续？')) return
    if (action === 'take_over' && !window.confirm('改由健康顾问人工核对并补充随访，确认没有新增行动时可提交空列表，是否继续？')) return
    setBusy(true); setError('')
    try {
      const result = action === 'generate'
        ? await staffAPI.generateReportFollowUpDraft(row._id, { revision: row.__v, confirmIncrement: true })
        : await staffAPI.reviewReportFollowUpDraft(row._id, { action, revision: row.__v, followUpDrafts: row.followUpDrafts || [] })
      setRows(prev => prev.map(item => item._id === row._id ? result.data : item))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section id="report-followup-drafts" style={{ background: '#fff', border: '1px solid #D7E4DD', borderRadius: 12, padding: 18, marginBottom: 20 }}>
    <h3>病历与报告随访</h3>
    <p style={{ color: '#6B7F75', fontSize: 13 }}>仅整理已审核原文中的后续建议，健康顾问终审后派发；独立于专业评估和年度方案。没有后续行动不增加任务。</p>
    <button disabled={busy} onClick={() => { if (!dirty || window.confirm('刷新会替换未提交编辑，是否继续？')) load() }} className="btn btn-secondary btn-sm">刷新状态</button>
    {error && <p role="alert" style={{ color: '#DC2626' }}>{error}</p>}
    {!rows.length && <p style={{ color: '#6B7F75' }}>暂无报告随访草稿；不会批量处理历史资料。</p>}
    {rows.map(row => {
      const status = row.followUpAutomation?.status
      const editable = canEdit && row.status === 'advisor_review' && !['queued', 'running', 'failed'].includes(status)
      return <article key={row._id} style={{ borderTop: '1px solid #E8E3DA', paddingTop: 12, marginTop: 12 }}>
        <b>{row.title}</b> · {{ advisor_review: '待顾问审核', approved: '已终审', rejected: '已退回', excluded: '原流程承接', superseded: '来源已更新', no_action: '无新增行动' }[row.status]}
        <p style={{ fontSize: 13 }}>{row.followUpAutomation?.message}</p>
        {canEdit && row.status === 'no_action' && <button disabled={busy} onClick={() => act(row, 'take_over')}>人工补充后续安排</button>}
        <details><summary>查看本次审核来源快照</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflowY: 'auto', fontSize: 12 }}>{JSON.stringify(row.sourceSnapshot, null, 2)}</pre></details>
        {(row.followUpDrafts || []).map((draft, index) => {
          const change = patch => update(row._id, row.followUpDrafts.map((item, i) => i === index ? { ...item, ...patch } : item))
          return <fieldset key={index} disabled={busy || !editable} style={{ border: '1px solid #E8E3DA', padding: 10, marginTop: 8 }}>
            <input aria-label="随访标题" value={draft.title} maxLength={40} onChange={e => change({ title: e.target.value })} />
            <input aria-label="随访日期" type="date" value={draft.date} onChange={e => change({ date: e.target.value })} />
            <select aria-label="随访类型" value={draft.category} onChange={e => change({ category: e.target.value })}>{[['medical_visit', '安排就医'], ['examination', '完善检查'], ['review', '复查随访'], ['lifestyle', '生活方式'], ['information', '资料核对']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <textarea aria-label="随访内容" value={draft.content} maxLength={3000} rows={3} onChange={e => change({ content: e.target.value })} style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }} />
            <label><input type="checkbox" checked={draft.requiresService === true} onChange={e => change({ requiresService: e.target.checked })} />需规划师安排服务</label>
            <button onClick={() => update(row._id, row.followUpDrafts.filter((_, i) => i !== index))}>移除</button>
          </fieldset>
        })}
        {canEdit && row.status === 'advisor_review' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {!['ready', 'queued', 'running'].includes(status) && <button disabled={busy} onClick={() => act(row, 'generate')}>生成/重试草稿</button>}
          {status === 'failed' && <button disabled={busy} onClick={() => act(row, 'take_over')}>改为人工核对</button>}
          {editable && <><button disabled={busy} onClick={() => update(row._id, [...(row.followUpDrafts || []), { title: '', date: '', content: '', category: 'information', requiresService: false }])}>补充草稿</button><button disabled={busy} onClick={() => act(row, 'approve')}>终审并发布</button></>}
          <button disabled={busy} onClick={() => act(row, 'reject')}>不采纳本次草稿</button>
        </div>}
        {row.status === 'approved' && row.followUpPublication?.status !== 'published' && <p style={{ color: '#B45309' }}>{row.followUpPublication?.message || '随访待发布'} {canEdit && <button disabled={busy} onClick={() => act(row, 'approve')}>重试发布</button>}</p>}
      </article>
    })}
  </section>
}
