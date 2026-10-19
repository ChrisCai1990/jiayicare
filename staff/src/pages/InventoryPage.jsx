import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { staffAPI } from '../api'
import PatientPicker from '../components/PatientPicker'
import InventoryLedger from '../../../shared/InventoryLedger'
import InventoryBatchPicker from '../../../shared/InventoryBatchPicker'
import SearchableProductSelect from '../../../shared/SearchableProductSelect'

const labels = { receipt:'入库', issue:'领用', use:'发放/实际使用', return:'归还/退回', loss:'报损', manual_sale:'录入客户消费' }
export default function InventoryPage() {
  const [params] = useSearchParams()
  const patientId = params.get('patientId') || ''
  const [data, setData] = useState({ products:[], recent:[] })
  const [people, setPeople] = useState([])
  const [orders, setOrders] = useState([])
  const [form, setForm] = useState({ productId:'', serviceProductId:'', requestId:crypto.randomUUID(), type:'use', units:1, userId:patientId, assigneeId:'', fromIssued:false, orderId:'', batchNo:'', expiresAt:'', sourceReceiptId:'', serialNo:'', note:'', unitPrice:'' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => staffAPI.inventory().then(r => setData(r.data))
  useEffect(() => { load().catch(e => setError(e.message)) }, [])
  useEffect(() => { staffAPI.inventoryPeople().then(r => setPeople(r.data)).catch(e => setError(e.message)) }, [])
  useEffect(() => { if (patientId) setForm(f => ({ ...f, userId:patientId, orderId:'' })) }, [patientId])
  useEffect(() => {
    let active = true
    setOrders([])
    if (form.userId) staffAPI.patientInventoryConsumption(form.userId).then(r => { if (active) setOrders(r.data.orders || []) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [form.userId])
  const product = data.products.find(p => p._id === form.productId)
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try { await staffAPI.inventoryEntry(form); await load(); setMessage('记录已保存'); setForm(f => ({ ...f, requestId:crypto.randomUUID(), units:1, batchNo:'', expiresAt:'', sourceReceiptId:'', serialNo:'', note:'' })) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
    <h1>物资与设备</h1><p>记录领用、发放/实际使用、客户消费和归还。客户消费会出现在客户消费记录中；使用记录不会重复计入销售额。</p>
    {error && <div role="alert" style={{ color:'#b91c1c' }}>{error}</div>}
    {message && <div role="status" style={{ color:'#166534' }}>{message}</div>}
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:18 }}>
      <form className="card" style={{ padding:20 }} onSubmit={save}>
        <h2>登记流水</h2>
        <label className="form-label">物资</label><SearchableProductSelect products={data.products} value={form.productId} onChange={productId => { const p = data.products.find(x => x._id === productId); setForm({ ...form, productId, batchNo:'', expiresAt:'', sourceReceiptId:'', serviceProductId:'', unitPrice:'', fromIssued:form.type === 'use' && p?.inventoryTracking?.kind === 'reusable', orderId:'' }) }} optionLabel={p => `${p.name} · 可用 ${p.stock} ${p.inventoryTracking?.unit || ''}`} />
        <label className="form-label">动作</label><select className="form-input" value={form.type} onChange={e => setForm({ ...form, type:e.target.value, batchNo:'', expiresAt:'', sourceReceiptId:'', fromIssued:e.target.value === 'use' && product?.inventoryTracking?.kind === 'reusable', orderId:'' })}>{['issue','use','return','manual_sale'].map(type => <option key={type} value={type}>{labels[type]}</option>)}</select>
        {['issue','use','manual_sale'].includes(form.type) && <><label className="form-label">用于服务{form.type === 'manual_sale' ? '（必选）' : '（可选）'}</label><SearchableProductSelect products={product?.linkedProducts || []} value={form.serviceProductId} placeholder="选择关联服务" onChange={serviceProductId => setForm({ ...form, serviceProductId, orderId:'', unitPrice:product?.linkedProducts.find(p => p._id === serviceProductId)?.originalPrice ?? '' })} /></>}
        <label className="form-label">数量</label><input className="form-input" type="number" min="1" required value={form.units} onChange={e => setForm({ ...form, units:e.target.value })} />
        {['use','manual_sale'].includes(form.type) && <><label className="form-label">使用/购买客户</label><PatientPicker value={form.userId} onChange={userId => setForm(f => ({ ...f, userId, orderId:'' }))} /></>}
        {['issue','use','return'].includes(form.type) && <><label className="form-label">领用/归还人员{['issue','return'].includes(form.type) ? '（必填）' : ''}</label><select className="form-input" required={['issue','return'].includes(form.type) || form.fromIssued} value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId:e.target.value })}><option value="">选择人员</option>{people.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select>
          {form.type === 'use' && <label><input type="checkbox" checked={form.fromIssued} onChange={e => setForm({ ...form, fromIssued:e.target.checked, orderId:'' })} /> 从已领用物资中使用（库存不再重复扣减）</label>}</>}
        {form.type === 'use' && <><label className="form-label">消费来源订单（可选）</label><select className="form-input" value={form.orderId} onChange={e => setForm({ ...form, orderId:e.target.value })}><option value="">未关联订单</option>{orders.filter(o => product?.linkedProductIds?.includes(o.serviceId) && (!form.serviceProductId || o.serviceId === form.serviceProductId)).map(o => <option key={o._id} value={o._id}>{o.orderNo} · {o.serviceName}</option>)}</select><p>订单只关联消费来源；直接发放扣实物库存，从已领用物资中使用不再扣减。</p></>}
        {form.type === 'manual_sale' && <><label className="form-label">后台维护的售价</label><input className="form-input" type="number" min="0" step="0.01" required readOnly value={form.unitPrice} /><p>此处只记录服务消费，不扣实物库存。请核对收款凭据，实际发放另行登记。</p></>}
        {form.type !== 'manual_sale' && <InventoryBatchPicker batches={product?.receiptBatches || []} value={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />}
        {product?.inventoryTracking?.kind === 'reusable' && <><label className="form-label">设备序列号</label><input className="form-input" value={form.serialNo} onChange={e => setForm({ ...form, serialNo:e.target.value })} /></>}
        <label className="form-label">备注/凭据{form.type === 'manual_sale' ? '（必填）' : ''}</label><textarea className="form-input" required={form.type === 'manual_sale'} value={form.note} onChange={e => setForm({ ...form, note:e.target.value })} />
        <button className="btn btn-primary" disabled={busy || !form.productId || (['use','manual_sale'].includes(form.type) && !form.userId)}>保存</button>
      </form>
      <section className="card" style={{ padding:20 }}><h2>可用库存</h2><table className="table"><thead><tr><th>物资</th><th>可用</th><th>提示</th></tr></thead><tbody>{data.products.map(p => <tr key={p._id}><td>{p.name}</td><td>{p.needsOpeningCount ? `待核实（旧账面 ${p.stock}）` : `${p.stock} ${p.inventoryTracking?.unit || ''}`}</td><td>{p.needsOpeningCount ? '期初待实盘核实，请联系管理员' : Number(p.stock) <= Number(p.inventoryTracking?.minStock || 0) ? '低库存' : '-'}</td></tr>)}</tbody></table></section>
    </div>
    <InventoryLedger products={data.products} records={data.recent} />
  </div>
}
