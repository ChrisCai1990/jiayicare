import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { staffAPI } from '../api'

const labels = { receipt:'入库', issue:'领用', use:'实际使用', return:'归还/退回', loss:'报损', manual_sale:'录入客户消费' }
export default function InventoryPage() {
  const [params] = useSearchParams()
  const patientId = params.get('patientId') || ''
  const [data, setData] = useState({ products:[], recent:[] })
  const [people, setPeople] = useState([])
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ productId:'', type:'use', units:1, userId:patientId, assigneeId:'', fromIssued:false, orderId:'', batchNo:'', serialNo:'', note:'', unitPrice:'' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => staffAPI.inventory().then(r => setData(r.data))
  useEffect(() => { load().catch(e => setError(e.message)) }, [])
  useEffect(() => { staffAPI.inventoryPeople().then(r => setPeople(r.data)).catch(e => setError(e.message)) }, [])
  useEffect(() => { if (patientId) setForm(f => ({ ...f, userId:patientId })) }, [patientId])
  useEffect(() => { if (form.userId) staffAPI.patientInventoryConsumption(form.userId).then(r => setOrders(r.data.orders || [])).catch(() => setOrders([])); else setOrders([]) }, [form.userId])
  const product = data.products.find(p => p._id === form.productId)
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try { await staffAPI.inventoryEntry(form); await load(); setMessage('记录已保存'); setForm(f => ({ ...f, units:1, batchNo:'', serialNo:'', note:'' })) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
    <h1>物资与设备</h1><p>记录领用、实际使用、客户消费和归还。客户消费会出现在客户消费记录中；使用记录不会重复计入销售额。</p>
    {error && <div role="alert" style={{ color:'#b91c1c' }}>{error}</div>}
    {message && <div role="status" style={{ color:'#166534' }}>{message}</div>}
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:18 }}>
      <form className="card" style={{ padding:20 }} onSubmit={save}>
        <h2>登记流水</h2>
        <label className="form-label">物资</label><select className="form-input" required value={form.productId} onChange={e => { const p = data.products.find(x => x._id === e.target.value); setForm({ ...form, productId:e.target.value, unitPrice:p?.originalPrice ?? '', fromIssued:form.type === 'use' && p?.inventoryTracking?.kind === 'reusable', orderId:'' }) }}><option value="">选择物资</option>{data.products.map(p => <option key={p._id} value={p._id}>{p.name} · 可用 {p.stock} {p.inventoryTracking?.unit}</option>)}</select>
        <label className="form-label">动作</label><select className="form-input" value={form.type} onChange={e => setForm({ ...form, type:e.target.value, fromIssued:e.target.value === 'use' && product?.inventoryTracking?.kind === 'reusable', orderId:'' })}>{['issue','use','return','manual_sale'].map(type => <option key={type} value={type}>{labels[type]}</option>)}</select>
        <label className="form-label">数量</label><input className="form-input" type="number" min="1" required value={form.units} onChange={e => setForm({ ...form, units:e.target.value })} />
        {['use','manual_sale'].includes(form.type) && <><label className="form-label">使用/购买客户</label>{patientId && <p>已从客户详情带入客户</p>}<div style={{ display:'flex', gap:6 }}><input className="form-input" placeholder="输入客户姓名或手机号" value={search} onChange={e => setSearch(e.target.value)} /><button className="btn btn-secondary" type="button" onClick={() => staffAPI.inventoryUsers(search).then(r => setUsers(r.data)).catch(e => setError(e.message))}>查找</button></div><select className="form-input" required value={form.userId} onChange={e => setForm({ ...form, userId:e.target.value })}><option value="">选择客户</option>{patientId && !users.some(u => u._id === patientId) && <option value={patientId}>当前客户</option>}{users.map(u => <option key={u._id} value={u._id}>{u.name} · {u.phone || u.patientNo || ''}</option>)}</select></>}
        {['issue','use','return'].includes(form.type) && <><label className="form-label">领用/归还人员{['issue','return'].includes(form.type) ? '（必填）' : ''}</label><select className="form-input" required={['issue','return'].includes(form.type) || form.fromIssued} value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId:e.target.value })}><option value="">选择人员</option>{people.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select>
          {form.type === 'use' && <label><input type="checkbox" checked={form.fromIssued} onChange={e => setForm({ ...form, fromIssued:e.target.checked, orderId:'' })} /> 从已领用物资中使用（库存不再重复扣减）</label>}</>}
        {form.type === 'use' && !form.fromIssued && <><label className="form-label">关联客户已购买的商城订单（如适用）</label><select className="form-input" value={form.orderId} onChange={e => setForm({ ...form, orderId:e.target.value, units:e.target.value ? 1 : form.units })}><option value="">未关联，直接从可用库存扣减</option>{orders.filter(o => o.serviceId === form.productId).map(o => <option key={o._id} value={o._id}>{o.orderNo} · {o.serviceName}</option>)}</select>{form.orderId && <p>此订单下单时已预占库存，记录使用时不再扣减。</p>}</>}
        {form.type === 'manual_sale' && <><label className="form-label">后台维护的售价</label><input className="form-input" type="number" min="0" step="0.01" required readOnly value={form.unitPrice} /><p>仅记录消费，不代表款项已收取。请核对收款凭据。</p></>}
        <label className="form-label">批次号</label><input className="form-input" value={form.batchNo} onChange={e => setForm({ ...form, batchNo:e.target.value })} />
        {product?.inventoryTracking?.kind === 'reusable' && <><label className="form-label">设备序列号</label><input className="form-input" value={form.serialNo} onChange={e => setForm({ ...form, serialNo:e.target.value })} /></>}
        <label className="form-label">备注/凭据{form.type === 'manual_sale' ? '（必填）' : ''}</label><textarea className="form-input" required={form.type === 'manual_sale'} value={form.note} onChange={e => setForm({ ...form, note:e.target.value })} />
        <button className="btn btn-primary" disabled={busy || !form.productId}>保存</button>
      </form>
      <section className="card" style={{ padding:20 }}><h2>可用库存</h2><table className="table"><thead><tr><th>物资</th><th>可用</th><th>提示</th></tr></thead><tbody>{data.products.map(p => <tr key={p._id}><td>{p.name}</td><td>{p.stock} {p.inventoryTracking?.unit}</td><td>{Number(p.stock) <= Number(p.inventoryTracking?.minStock || 0) ? '低库存' : '-'}</td></tr>)}</tbody></table></section>
    </div>
    <section className="card" style={{ padding:20, marginTop:18 }}><h2>最近记录</h2><div style={{ overflowX:'auto' }}><table className="table"><thead><tr><th>时间</th><th>物资</th><th>动作</th><th>数量</th><th>结存</th><th>客户</th></tr></thead><tbody>{data.recent.map(x => <tr key={x._id}><td>{new Date(x.createdAt).toLocaleString('zh-CN')}</td><td>{data.products.find(p => p._id === x.productId)?.name || '-'}</td><td>{labels[x.type] || x.type}</td><td>{x.units}</td><td>{x.balanceAfter}</td><td>{x.userId?.name || '-'}</td></tr>)}</tbody></table></div></section>
  </div>
}
