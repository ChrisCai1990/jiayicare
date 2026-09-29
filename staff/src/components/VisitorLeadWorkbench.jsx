import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

const when = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
const directions = { medical_assistance: '就医协助', metabolic_84: '84 天体重管理', long_term: '长期健康管理' }
const nextDay = () => { const d = new Date(Date.now() + 86400000); return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }

export default function VisitorLeadWorkbench({ toast }) {
  const nav = useNavigate()
  const [tab, setTab] = useState('leads'), [status, setStatus] = useState('new'), [page, setPage] = useState(1)
  const [result, setResult] = useState({ data: [], total: 0, limit: 20 }), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [edit, setEdit] = useState(null), [form, setForm] = useState({}), [busy, setBusy] = useState(false)
  const [patients, setPatients] = useState([]), [search, setSearch] = useState(''), [options, setOptions] = useState({ orders: [], plans: [] })
  const [modalError, setModalError] = useState(''), [searching, setSearching] = useState(false)
  const generation = useRef(0), submitting = useRef(false), dialogVersion = useRef(0)
  async function load() {
    const ticket = ++generation.current; setLoading(true); setError('')
    try {
      const data = await (tab === 'leads' ? staffAPI.getVisitorLeads : staffAPI.getServiceIntakes)({ status, page })
      if (ticket === generation.current) setResult(data)
    } catch (e) { if (ticket === generation.current) setError(e.message) }
    finally { if (ticket === generation.current) setLoading(false) }
  }
  useEffect(() => { load(); return () => { generation.current++ } }, [tab, status, page])
  function switchTab(value) { setTab(value); setStatus(value === 'leads' ? 'new' : 'open'); setPage(1) }
  function closeDialog() { if (submitting.current) return; dialogVersion.current++; setEdit(null) }
  async function open(row, action) {
    const version = ++dialogVersion.current
    setEdit({ row, action }); setModalError(''); setPatients([]); setSearch(''); setOptions({ orders: [], plans: [] })
    setForm({ note: '', need: row.summary || row.topic || '', serviceDirection: '', patientId: '', customerConfirmed: false, nextContactAt: nextDay(), orderId: '', planId: '' })
    if (action === 'link') {
      setSearching(true)
      try { const r = await staffAPI.getServiceIntakeOptions(row._id); if (version === dialogVersion.current) setOptions(r.data) }
      catch (e) { if (version === dialogVersion.current) setModalError(e.message) }
      finally { if (version === dialogVersion.current) setSearching(false) }
    }
  }
  async function searchPatients() {
    if (!search.trim() || searching) return
    const version = dialogVersion.current; setSearching(true); setModalError('')
    try { const r = await staffAPI.getPatients({ search: search.trim(), limit: 20 }); if (version === dialogVersion.current) setPatients(r.data?.patients || []) }
    catch (e) { if (version === dialogVersion.current) setModalError(e.message) }
    finally { if (version === dialogVersion.current) setSearching(false) }
  }
  async function save(event) {
    event.preventDefault(); if (submitting.current) return
    submitting.current = true; setBusy(true); setModalError('')
    try {
      const { row, action } = edit
      if (action === 'convert') await staffAPI.convertVisitorLead(row._id, { ...form, nextContactAt: new Date(form.nextContactAt).toISOString() })
      else if (['contacted', 'closed', 'new'].includes(action)) await staffAPI.updateVisitorLead(row._id, { status: action, contactNote: form.note, baseUpdatedAt: row.updatedAt })
      else await staffAPI.updateServiceIntake(row._id, { ...form, action, revision: row.revision, ...(action !== 'close' ? { nextContactAt: new Date(form.nextContactAt).toISOString() } : {}) })
      setEdit(null); toast('已保存'); await load()
    } catch (e) { setModalError(e.message || '保存失败，请核对后重试') }
    finally { submitting.current = false; setBusy(false) }
  }
  const field = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }))
  return <>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      <button className={`btn ${tab === 'leads' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('leads')}>官网咨询</button>
      <button className={`btn ${tab === 'intakes' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('intakes')}>服务承接与进度</button>
      <select aria-label="筛选状态" className="form-control" style={{ width: 140 }} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
        {tab === 'leads' ? <><option value="new">待联系</option><option value="contacted">已联系</option><option value="closed">已关闭</option></> : <><option value="open">跟进中</option><option value="closed">已关闭</option></>}
        <option value="">全部</option>
      </select>
      <button className="btn btn-secondary" disabled={loading} onClick={load}>刷新</button>
    </div>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {tab === 'intakes' && <p>待跟进超时：{result.overdue || 0} 项。这里只追踪承接，实际支付、履约和专业审核在原服务中办理。</p>}
    {loading ? <p>正在加载…</p> : result.data?.length ? <div style={{ display: 'grid', gap: 14 }}>{result.data.map(row => <article className="card" key={row._id}>
      <div className="card-body">
        {tab === 'leads' ? <>
          <h3>{row.name} · {row.topic}</h3><p>{row.phone} · {[row.city, row.contactWindow].filter(Boolean).join(' / ')}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{row.summary || '未填写沟通要点'}</p>
          <p>来源：{row.source} · 提交：{when(row.createdAt)} · 负责人：{row.assignedTo?.name || '待认领'}</p>
          {row.status === 'new' && <p style={{ color: row.overdue ? '#b91c1c' : '#52655b' }}>{row.overdue ? '已超过首次响应时间 · ' : '首次响应截止：'}{when(row.responseDueAt)}</p>}
          {row.contactNote && <p>联系记录：{row.contactNote}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {row.status === 'new' && <button className="btn btn-primary" onClick={() => open(row, 'contacted')}>记录联系并承接</button>}
            {row.intakeId ? <button className="btn btn-primary" onClick={() => switchTab('intakes')}>查看服务承接</button> : row.status === 'contacted' && <button className="btn btn-primary" onClick={() => open(row, 'convert')}>确认客户与服务需求</button>}
            {row.status === 'contacted' && !row.intakeId && <button className="btn btn-secondary" onClick={() => open(row, 'closed')}>不再跟进</button>}
            {row.status === 'closed' && <button className="btn btn-secondary" onClick={() => open(row, 'new')}>重新跟进</button>}
          </div>
        </> : <>
          <h3>{row.customer?.name} · {directions[row.serviceDirection]}</h3><p>{row.need}</p>
          <p><strong>{row.progress.stage}</strong> · {row.progress.waiting}</p>
          <p>来源：{row.source} · 下次跟进：{when(row.nextContactAt)} {row.progress.overdue && <strong style={{ color: '#b91c1c' }}>已超时</strong>}</p>
          {row.order && <p>关联订单：{row.order.serviceName} · {row.order.tradeStatus || row.order.status}</p>}
          {row.plan && <p>关联服务：{row.plan.title}</p>}
          {!!row.progress.current.length && <ul>{row.progress.current.map(task => <li key={task.id}>{task.label} · {task.assignee}{task.blocked ? ' · 等待前置环节' : ''}</li>)}</ul>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => nav(`/patients/${row.patientId}`)}>客户档案与订单</button>
            {row.planId && <button className="btn btn-secondary" onClick={() => nav(`/plans/${row.planId}`)}>打开服务方案</button>}
            {row.status === 'open' && <>
              {!row.orderId && !row.planId && <button className="btn btn-primary" onClick={() => open(row, 'link')}>关联实际服务</button>}
              <button className="btn btn-secondary" onClick={() => open(row, 'followup')}>追加跟进</button>
              <button className="btn btn-secondary" disabled={!row.progress.canClose} onClick={() => open(row, 'close')}>记录承接结论</button>
            </>}
          </div>
          <details style={{ marginTop: 12 }}><summary>跟进记录（{row.events?.length || 0}）</summary>{row.events?.map((item, i) => <p key={i}>{when(item.at)} · {item.note}</p>)}</details>
        </>}
      </div>
    </article>)}</div> : <p>当前没有符合条件的记录。</p>}
    <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
      <button className="btn btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>上一页</button>
      <span>第 {page} 页 · 共 {result.total || 0} 条</span>
      <button className="btn btn-secondary" disabled={page * result.limit >= result.total || loading} onClick={() => setPage(p => p + 1)}>下一页</button>
    </div>
    {edit && <div className="modal-overlay" onClick={closeDialog}><div className="modal" role="dialog" aria-modal="true" aria-label="服务承接" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, width: '94vw', maxHeight: '90vh', overflowY: 'auto' }}>
      <form onSubmit={save}><div className="modal-header"><h3>服务承接</h3><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>关闭</button></div>
      <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
        {edit.action === 'convert' && <>
          <label>搜索已有客户（姓名或手机号）<div style={{ display: 'flex', gap: 8 }}><input className="form-control" value={search} onChange={e => setSearch(e.target.value)} /><button type="button" className="btn btn-secondary" disabled={searching} onClick={searchPatients}>搜索</button></div></label>
          <label>客户<select required className="form-control" value={form.patientId} onChange={field('patientId')}><option value="">请选择已核实身份的客户</option>{patients.map(p => <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>)}</select></label>
          <p>没有客户档案时，请先通过现有建档流程完成授权与建档，再回到此处关联。</p>
          <label>服务方向<select required className="form-control" value={form.serviceDirection} onChange={field('serviceDirection')}><option value="">请选择</option>{Object.entries(directions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>确认后的服务需求<textarea required maxLength={1000} className="form-control" value={form.need} onChange={field('need')} /></label>
          <label><input required type="checkbox" checked={form.customerConfirmed} onChange={e => setForm(v => ({ ...v, customerConfirmed: e.target.checked }))} /> 已向客户核实身份，并确认可关联本次服务需求</label>
        </>}
        {edit.action === 'link' && <>
          <label>本次订单<select className="form-control" value={form.orderId} onChange={field('orderId')}><option value="">请选择订单</option>{options.orders.map(o => <option key={o._id} value={o._id}>{o.serviceName} · {when(o.createdAt)}</option>)}</select></label>
          <label>本次服务方案<select className="form-control" value={form.planId} onChange={field('planId')}><option value="">请选择方案</option>{options.plans.map(p => <option key={p._id} value={p._id}>{p.title}</option>)}</select></label>
          <p>请只选择本次需求对应的服务；关联后保留原订单与服务流程。</p>
        </>}
        {['convert', 'link', 'followup'].includes(edit.action) && <label>下次跟进时间<input required className="form-control" type="datetime-local" value={form.nextContactAt} onChange={field('nextContactAt')} /></label>}
        {edit.action !== 'convert' && <label>{edit.action === 'close' ? '承接结论及后续安排' : '本次沟通记录'}<textarea required maxLength={1000} className="form-control" value={form.note} onChange={field('note')} /></label>}
        {modalError && <p role="alert" style={{ color: '#b91c1c' }}>{modalError}</p>}
      </div><div className="modal-footer"><button type="submit" className="btn btn-primary" disabled={busy || searching}>{busy ? '正在保存…' : '确认保存'}</button></div></form>
    </div></div>}
  </>
}
