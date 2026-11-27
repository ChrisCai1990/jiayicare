import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { staffAPI } from '../api'
import { usePermission } from '../App'
import Pagination from './Pagination'
import { ArrowLeft, ChevronRight, ClipboardList, CreditCard, Search } from 'lucide-react'
import './custodyLedger.css'

const states = { none: '未寄存', stored: '在库', lent: '已借出', released: '已取回' }
const actions = { deposit: '登记寄存', lend: '登记借出', return: '归还入库', release: '客户取回' }
const choices = { none: ['deposit'], released: ['deposit'], stored: ['lend', 'release'], lent: ['return', 'release'] }
const persons = { deposit: '交卡人', lend: '领卡人', return: '送回人', release: '领回人' }
const time = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
const overdue = card => card.state === 'lent' && new Date(card.current.dueAt) < new Date()
function localNow() {
  const now = new Date()
  return new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function EventDetails({ event: e }) {
  if (!e) return null
  return <div>{time(e.at)} · {persons[e.action]} {e.person} · 经办人 {e.actor}
    {e.location && <div>{e.action === 'lend' ? '使用地点' : '存放位置'}：{e.location}</div>}
    {e.purpose && <div>{e.action === 'lend' ? '用途' : '实际使用情况'}：{e.purpose}</div>}
    {e.serviceLabel && <div>关联服务：{e.serviceLabel}</div>}
    {e.dueAt && <div>预计归还：{time(e.dueAt)}</div>}
  </div>
}
export function CustodyLedger() {
  const [mode, setMode] = useState('active')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setData(null); setError('')
    staffAPI.getPatients({ custody: mode, search, page, limit: 20 }).then(res => {
      if (active) setData(res.data)
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [mode, search, page, reload])
  const can = usePermission()
  const filters = { active: '寄存中', stored: '在库', lent: '已借出', overdue: '逾期未还', released: '已取回' }
  const initialView = mode === 'active' && !search
  return <main className="page custody-ledger">
    <Link className="custody-back" to="/patients"><ArrowLeft size={15} />我的会员</Link>
    <header className="custody-heading"><span className="custody-icon"><CreditCard size={25} /></span><h1>医保卡台账</h1></header>
    <section className="custody-panel" aria-label="医保卡记录">
      <div className="custody-tools">
        <div role="group" aria-label="医保卡状态" className="custody-filters">
          {Object.entries(filters).map(([key, label]) => <button type="button" key={key} aria-pressed={mode === key}
            onClick={() => { setPage(1); setMode(key) }}>{label}</button>)}
        </div>
        <label className="custody-search"><Search size={16} /><input type="search" aria-label="搜索会员" placeholder="搜索姓名、手机号或客户编号" value={search}
          onChange={e => { setPage(1); setSearch(e.target.value) }} /></label>
      </div>
      <div className="custody-caption"><h2>{filters[mode]}记录</h2>{data && <span>共 {data.total} 位会员</span>}</div>
      {error && <div className="custody-message" role="alert">{error}<button className="btn btn-secondary" onClick={() => setReload(n => n + 1)}>重试</button></div>}
      {!data && !error && <div className="custody-message" role="status">正在读取台账…</div>}
      {data && !data.patients.length && <div className="custody-message">
        <span className="custody-empty-icon"><ClipboardList size={32} strokeWidth={1.5} /></span>
        <strong>{search ? '未找到匹配的会员' : '暂无' + filters[mode] + '记录'}</strong>
        {initialView && can('patients','edit') && <><p>打开会员的客户概览，在「医保卡寄存」中登记第一张卡。</p><Link className="btn btn-secondary" to="/patients">前往会员列表<ChevronRight size={15} /></Link></>}
        {!initialView && <button className="btn btn-secondary" onClick={() => { setMode('active'); setSearch(''); setPage(1) }}>重置筛选</button>}
      </div>}
      {data?.patients.map(card => <article className="custody-row" key={card._id}>
        <div className="custody-member"><Link to={'/patients/' + card._id + '?tab=info#card-custody'}>{card.member.name || '查看会员'}<ChevronRight size={15} /></Link>
          <span className={'custody-status ' + (overdue(card) ? 'overdue' : card.state)}>{overdue(card) ? '逾期未还' : states[card.state]}</span></div>
        <div className="custody-details"><EventDetails event={card.current} /></div>
      </article>)}
      {data?.total > 20 && <Pagination page={page} totalPages={Math.ceil(data.total / 20)} onChange={setPage} />}
    </section>
  </main>
}
export default function CardCustody({ patientId, services }) {
  const can = usePermission()
  const [card, setCard] = useState(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    setCard(null)
    staffAPI.getCardCustody(patientId).then(res => { if (active) setCard(res.data) })
      .catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [patientId, reload])
  function field(name, label, type = 'text', required = true) {
    return <label>{label}<input className="form-control" type={type} required={required} maxLength={160}
      value={form[name] || ''} onChange={e => setForm({ ...form, [name]: e.target.value })} /></label>
  }
  async function save(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      await staffAPI.saveCardCustody(patientId, { ...form, at: new Date(form.at).toISOString(),
        dueAt: form.dueAt && new Date(form.dueAt).toISOString(), revision: card.revision })
      setForm(null); setReload(n => n + 1)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <section className="card" id="card-custody"><div className="card-header"><strong>医保卡寄存</strong>
    {card && <span>{states[card.state]} {overdue(card) && '· 逾期未还'}</span>}</div>
    <div className="card-body">{error && <p role="alert">{error} <button onClick={() => { setError(''); setForm(null); setReload(n => n + 1) }}>刷新记录</button></p>}
    {!card && !error && '正在读取…'}
    {card && <><EventDetails event={card.current} />
      {!form && can('patients', 'edit') && choices[card.state].map(action => <button key={action} className="btn btn-secondary btn-sm"
        onClick={() => { setError(''); setForm({ action, at: localNow() }) }}>{actions[action]}</button>)}
      {form && <form onSubmit={save}><fieldset disabled={busy} style={{ display: 'grid', gap: 8, border: 0 }}>
        <legend>{actions[form.action]}</legend>{field('person', persons[form.action])}{field('at', '交接时间', 'datetime-local')}
        {form.action !== 'release' && field('location', form.action === 'lend' ? '使用地点' : '存放位置')}
        {form.action === 'lend' && <>{field('purpose', '用途')}{field('dueAt', '预计归还时间', 'datetime-local')}
          <label>关联服务（选填）<select className="form-control" value={form.serviceId || ''} onChange={e => setForm({ ...form, serviceId: e.target.value })}>
            <option value="">请选择</option>{services.map(s => <option key={s._id} value={s._id}>{s.date?.slice(0,10)} {s.title || '服务记录'}</option>)}</select></label></>}
        {['release','return'].includes(form.action) && field('purpose', '实际使用情况（选填）', 'text', false)}
        <div><button className="btn btn-primary" type="submit">{busy ? '保存中…' : '确认交接'}</button> <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>取消</button></div>
      </fieldset></form>}
      {!!card.history.length && <details><summary>交接记录（{card.history.length}）</summary>
        {card.history.slice().reverse().map((e,i) => <div key={i} style={{ marginTop: 10 }}><strong>{actions[e.action]}</strong><EventDetails event={e} /></div>)}</details>}
    </>}</div></section>
}
