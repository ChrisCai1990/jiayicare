import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaff } from '../App'
import { getToken, staffAPI } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'
import Pagination from './Pagination'

const date = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未设定'
const decisionActions = { intake: '确认客户需求并转交顾问', advisor: '确认方案并发起转介', booking: '完成预约和客户沟通', specialist: '整理专家并回复转介', advisor_review: '审核专科回复并归档', planner_final: '确认服务并完成验收' }
export default function ServiceSupervisionPanel() {
  const { staff } = useStaff()
  const nav = useNavigate()
  const resource = useWorkbenchResource(async () => (await staffAPI.getServiceSupervision({ includeCompleted: '1' })).data, getToken(), { services: [], completed: [], inbox: [] })
  const [statusFilter, setStatusFilter] = useState('pending')
  const [page, setPage] = useState(1)
  const [inboxPage, setInboxPage] = useState(1)
  const [form, setForm] = useState(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(null)
  const previewRequest = useRef(0)
  const openSource = async service => {
    if (!service.taskId) { nav(service.href); return }
    const request = ++previewRequest.current
    setPreview({ loading: true })
    try { const result = await staffAPI.getSupervisionTask(service.taskId); if (request === previewRequest.current) setPreview({ task: result.data }) }
    catch (e) { if (request === previewRequest.current) setPreview({ error: e.message }) }
  }
  const { services = [], completed = [], inbox = [] } = resource.data
  const attention = services.filter(s => s.attention)
  const rows = statusFilter === 'pending' ? services : statusFilter === 'completed' ? completed : [...services, ...completed]
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 5)))
  const currentInboxPage = Math.min(inboxPage, Math.max(1, Math.ceil(inbox.length / 5)))
  const start = value => { setForm(value); setNote(''); setError(''); setNotice('') }
  const submit = async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      if (form.request) await staffAPI.respondServiceSupervision(form.request._id, { response: note })
      setNotice('处理反馈已保存，顾问可查看回执。')
      setForm(null); await resource.refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  if (!resource.loading && !resource.error && staff?.role !== 'familyDoctor' && !services.length && !inbox.length && !notice) return null
  const history = service => <details style={{ marginTop: 8 }}><summary>督办记录 {service.history.length}</summary>{service.history.map(r => <div key={r._id} style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
    <div>{r.kind === 'coordinate' ? '请求协调' : '提醒处理'} · {r.senderName} → {r.recipientName} · {date(r.createdAt)}</div>
    <div>{r.note}</div><div style={{ color: '#667085' }}>{r.handledAt ? `处理反馈（${date(r.handledAt)}）：${r.response}` : '尚无处理反馈（实际进度以原服务为准）'}</div>
  </div>)}</details>
  return <section className="card" style={{ marginBottom: 20 }} aria-label="服务督办">
    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}><div className="card-title">{services.length || staff?.role === 'familyDoctor' ? '服务进度总览' : '历史协调提醒'}{attention.length > 0 ? ` · ${attention.length}项需关注` : ''}{inbox.length > 0 ? ` · ${inbox.length}条待反馈` : ''}</div>{staff?.role === 'familyDoctor' && <div role="group" aria-label="服务进度状态筛选" style={{ display: 'flex', gap: 6 }}>{[['pending', '待完成', services.length], ['completed', '已完成', completed.length], ['all', '全部', services.length + completed.length]].map(([key, label, count]) => <button key={key} type="button" className={statusFilter === key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} aria-pressed={statusFilter === key} onClick={() => { setStatusFilter(key); setPage(1) }}>{label} {count}</button>)}</div>}</div>
    <div className="card-body">
      {staff?.role === 'familyDoctor' && <p style={{ marginTop: 0, fontSize: 13, color: '#667085' }}>查看所属客户的完整服务进度。随访由健管专员督导，就医协助由健康规划师督导；需要整体健康判断时在本人专业待办中处理。</p>}
      {resource.loading && <div role="status">正在读取服务进度…</div>}
      {resource.error && <div role="alert">进度更新失败：{resource.error} <button onClick={resource.refresh}>重试</button></div>}
      {notice && <p role="status">{notice}</p>}
      {inbox.slice((currentInboxPage - 1) * 5, currentInboxPage * 5).map(r => <article key={r._id} style={{ padding: '12px 0', borderBottom: '1px solid #E3ECE7' }}>
        <b>{r.kind === 'coordinate' ? '顾问请求协调' : '顾问提醒处理'} · {r.service.patientName} · {r.service.title}</b>
        <p style={{ whiteSpace: 'pre-wrap' }}>{r.senderName}：{r.note}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button className="btn btn-secondary btn-sm" onClick={() => openSource(r.service)}>查看原服务</button><button className="btn btn-primary btn-sm" onClick={() => start({ request: r })}>填写处理反馈</button></div>
      </article>)}
      {inbox.length > 5 && <Pagination compact page={currentInboxPage} totalPages={Math.ceil(inbox.length / 5)} onChange={setInboxPage} />}
      {rows.slice((currentPage - 1) * 5, currentPage * 5).map(s => <article key={s.key} style={{ padding: '14px 0', borderBottom: '1px solid #E3ECE7', fontSize: 13 }}>
        <div style={{ fontSize: 15 }}><b>{s.patientName} · {s.title}</b></div>
        {s.progress && <div style={{ marginTop: 8, padding: '8px 10px', background: '#F0F8F4', borderRadius: 8 }}>
          <b>当前进度：{s.progress.label}</b>{s.progress.step && s.progress.total ? ` · 第 ${s.progress.step}/${s.progress.total} 步` : ''} · 负责人：{s.current.map(c => c.person?.name || '待核对').filter((name, index, names) => names.indexOf(name) === index).join('、') || '待核对'}
          {s.progress.observed ? <div style={{ marginTop: 8 }}>
            <b style={{ fontSize: 12 }}>已生成任务进度{s.progress.generatedTotal ? ` · 已完成 ${s.progress.generatedCompleted}/${s.progress.generatedTotal}` : ' · 任务待核对'}</b>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5, fontSize: 12 }}>
              <thead><tr><th scope="col" style={{ textAlign: 'left', padding: '5px 7px', borderBottom: '1px solid #D6E5DC' }}>任务环节</th><th scope="col" style={{ textAlign: 'left', padding: '5px 7px', borderBottom: '1px solid #D6E5DC', width: 90 }}>状态</th></tr></thead>
              <tbody>{s.progress.steps?.map(stage => <tr key={stage.key}><td style={{ padding: '6px 7px', borderBottom: '1px solid #E1ECE5' }}>{stage.label}</td><td style={{ padding: '6px 7px', borderBottom: '1px solid #E1ECE5', color: stage.statusLabel === '已逾期' ? '#B45309' : stage.state === 'past' ? '#1E6B50' : '#425B4D', fontWeight: stage.state === 'current' || stage.statusLabel === '已逾期' ? 700 : 400 }}>{stage.statusLabel || '待核对'}</td></tr>)}</tbody>
            </table>
          </div> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>{s.progress.steps?.map((stage, index) => <span key={stage.key} title={stage.label} style={{ padding: '2px 6px', borderRadius: 5, background: stage.state === 'current' ? '#1E6B50' : stage.state === 'past' ? '#D9EEE3' : '#E9EFEC', color: stage.state === 'current' ? '#fff' : '#426457' }}>{index + 1}. {stage.label}{stage.state === 'blocked' ? '（待前置）' : ''}</span>)}</div>}
          {(s.progress.observed || s.progress.note) && <div style={{ marginTop: 6, color: '#667085', fontSize: 12 }}>{s.progress.note || '以上为已生成的服务任务，后续环节以原服务流转为准。'}</div>}
        </div>}
        {s.attention && <div style={{ color: '#B45309', marginTop: 6 }}>{s.reasons.join(' · ') || '已请求规划师协调'}</div>}
        {s.current.map((c, i) => <div key={c.taskId || i} style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span>{c.label} · {c.person?.name || '处理人待核对'}{c.blocked ? ' · 等待前置环节' : ''} · 计划时间：{date(c.dueAt)}</span>
        </div>)}
        <p>下一步：{s.status === 'completed' ? '服务已完成，请查看原服务记录。' : s.actionTaskId ? `请办理本人任务：${decisionActions[s.actionStage] || '处理当前环节'}。` : s.current.some(c => c.blocked) ? '等待原任务的前置事项完成。' : s.current.some(c => !c.person) ? '原任务负责人待核对，不自动转交其他人员。' : '由当前处理人在原服务中办理并记录结果。'}</p>
        <div style={{ color: '#667085', whiteSpace: 'pre-wrap' }}>最新进展：{s.latest ? `${date(s.latest.at)} · ${s.latest.content}` : '暂无处理记录，请查看原服务进度。'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>{s.coordinator && <span>原服务协调规划师：{s.coordinator.name}</span>}
          {s.actionTaskId && <button className="btn btn-primary btn-sm" onClick={() => nav(`/patients/${s.patientId}?tab=followups&followUpId=${s.actionTaskId}`)}>{decisionActions[s.actionStage] || '办理当前任务'}</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => openSource(s)}>查看原服务</button></div>
        {!!s.history.length && history(s)}
      </article>)}
      {rows.length > 5 && <Pagination compact page={currentPage} totalPages={Math.ceil(rows.length / 5)} onChange={setPage} />}
      {!resource.loading && !resource.error && staff?.role === 'familyDoctor' && !rows.length && <span style={{ color: '#667085' }}>暂无{statusFilter === 'completed' ? '已完成' : '待完成'}的服务。</span>}
      {form && <form onSubmit={submit} style={{ marginTop: 16, padding: 16, background: '#F3F7F5', borderRadius: 8 }}>
        <b>{form.request ? '填写实际处理反馈' : `${form.kind === 'coordinate' ? '请求协调' : '提醒处理'} → ${form.person.name}`} · {(form.service || form.request.service).title}</b>
        <p style={{ color: '#667085', fontSize: 13 }}>{form.request ? '反馈供顾问查看。实际服务仍在原入口办理。' : '说明需要跟进的具体事项，接收人会在工作台看到。'}</p>
        <textarea aria-label="督办说明或处理反馈" value={note} onChange={e => setNote(e.target.value)} required maxLength={1000} rows={3} style={{ width: '100%', boxSizing: 'border-box' }} />
        {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn btn-primary btn-sm" disabled={busy || !note.trim()}>{busy ? '提交中…' : '提交'}</button><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setForm(null)}>取消</button></div>
      </form>}
      {preview && <div className="modal-overlay"><div className="modal" role="dialog" aria-label="原任务只读进度" style={{ maxWidth: 680 }}>
        <div className="modal-header"><h3>{preview.task?.theme || '原服务任务'}</h3></div>
        <div className="modal-body" style={{ whiteSpace: 'pre-wrap' }}>
          {preview.loading && <p role="status">加载中…</p>}{preview.error && <p role="alert">{preview.error}</p>}
          {preview.task && <><p>处理人：{preview.task.assigneeName} · 状态：{{ planned: '待办理', in_progress: '办理中', missed: '已错过', completed: '已完成', cancelled: '已取消' }[preview.task.status] || '待核对'}</p>
            <p>原任务要求：{preview.task.plannedContent || preview.task.content || '未填写'}</p>
            {preview.task.executedContent && <p>实际结果：{preview.task.executedContent}</p>}
            {(preview.task.progressRecords || []).map((r, i) => <p key={r.requestId || i}>{date(r.recordedAt)} · {r.staffName || '处理记录'}：{r.content}</p>)}
            <p>任务执行仍由原负责人从工作台办理。</p></>}
        </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => { previewRequest.current++; setPreview(null) }}>关闭</button></div>
      </div></div>}
    </div>
  </section>
}
