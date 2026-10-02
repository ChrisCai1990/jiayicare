import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaff } from '../App'
import { getToken, staffAPI } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'
import Pagination from './Pagination'

const date = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未设定'
export default function ServiceSupervisionPanel() {
  const { staff } = useStaff()
  const nav = useNavigate()
  const resource = useWorkbenchResource(async () => (await staffAPI.getServiceSupervision()).data, getToken(), { services: [], inbox: [] })
  const [normalOpen, setNormalOpen] = useState(false)
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
  const { services, inbox } = resource.data
  const attention = services.filter(s => s.attention)
  const rows = [...attention, ...(normalOpen ? services.filter(s => !s.attention) : [])]
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
  if (!resource.loading && !resource.error && staff?.role !== 'familyDoctor' && !inbox.length && !notice) return null
  const history = service => <details style={{ marginTop: 8 }}><summary>督办记录 {service.history.length}</summary>{service.history.map(r => <div key={r._id} style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
    <div>{r.kind === 'coordinate' ? '请求协调' : '提醒处理'} · {r.senderName} → {r.recipientName} · {date(r.createdAt)}</div>
    <div>{r.note}</div><div style={{ color: '#667085' }}>{r.handledAt ? `处理反馈（${date(r.handledAt)}）：${r.response}` : '尚无处理反馈（实际进度以原服务为准）'}</div>
  </div>)}</details>
  return <section className="card" style={{ marginBottom: 20 }} aria-label="服务督办">
    <div className="card-header"><div className="card-title">{staff?.role === 'familyDoctor' ? '服务进度总览' : '历史协调提醒'}{attention.length > 0 ? ` · ${attention.length}项需关注` : ''}{inbox.length > 0 ? ` · ${inbox.length}条待反馈` : ''}</div></div>
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
        {s.attention && <div style={{ color: '#B45309', marginTop: 6 }}>{s.reasons.join(' · ') || '已请求规划师协调'}</div>}
        {s.current.map((c, i) => <div key={c.taskId || i} style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span>{c.label} · {c.person?.name || '处理人待核对'}{c.blocked ? ' · 等待前置环节' : ''} · 计划时间：{date(c.dueAt)}</span>
        </div>)}
        <p>下一步：{s.current.some(c => c.blocked) ? '等待原任务的前置事项完成。' : s.current.some(c => !c.person) ? '原任务负责人待核对，不自动转交其他人员。' : '由当前处理人在原服务中办理并记录结果。'}</p>
        <div style={{ color: '#667085', whiteSpace: 'pre-wrap' }}>最新进展：{s.latest ? `${date(s.latest.at)} · ${s.latest.content}` : '暂无处理记录，请查看原服务进度。'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>{s.coordinator && <span>原服务协调规划师：{s.coordinator.name}</span>}<button className="btn btn-secondary btn-sm" onClick={() => openSource(s)}>查看原服务</button></div>
        {!!s.history.length && history(s)}
      </article>)}
      {rows.length > 5 && <Pagination compact page={currentPage} totalPages={Math.ceil(rows.length / 5)} onChange={setPage} />}
      {services.length > attention.length && <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => { setNormalOpen(!normalOpen); setPage(1) }}>{normalOpen ? '收起正常进度' : `查看正常进度 ${services.length - attention.length}项`}</button>}
      {!resource.loading && !resource.error && staff?.role === 'familyDoctor' && !services.length && <span style={{ color: '#667085' }}>暂无进行中的服务。</span>}
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
