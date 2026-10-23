import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { staffAPI } from '../api'
import InventoryCustomerPicker from '../components/InventoryCustomerPicker'
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
  const [form, setForm] = useState({ productId:'', serviceProductId:'', requestId:crypto.randomUUID(), type:'use', units:1, userId:patientId, assigneeId:'', fromIssued:false, orderId:'', batchNo:'', expiresAt:'', sourceReceiptId:'', serialNo:'', note:'', unitPrice:'', delivery:{ method:'pickup', pickupBy:'', recipientName:'', recipientPhone:'', deliveryAddress:'' } })
  const [dispatches, setDispatches] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => staffAPI.inventory().then(r => setData(r.data))
  const loadDispatches = () => staffAPI.inventoryDispatches('mine').then(r => setDispatches(r.data))
  useEffect(() => { load().catch(e => setError(e.message)) }, [])
  useEffect(() => { loadDispatches().catch(e => setError(e.message)) }, [])
  useEffect(() => { staffAPI.inventoryPeople().then(r => setPeople(r.data)).catch(e => setError(e.message)) }, [])
  useEffect(() => { if (patientId) setForm(f => ({ ...f, userId:patientId, orderId:'' })) }, [patientId])
  useEffect(() => {
    let active = true
    setOrders([])
    if (form.userId) staffAPI.patientInventoryConsumption(form.userId).then(r => { if (active) setOrders(r.data.orders || []) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [form.userId])
  useEffect(() => {
    if (!form.userId) return
    let active = true
    staffAPI.inventoryUser(form.userId).then(r => {
      if (!active) return
      const user = r.data
      setForm(f => f.userId !== form.userId ? f : ({ ...f, delivery: { ...f.delivery,
        recipientName:user.contactName || user.name || '', recipientPhone:user.contactPhone || user.phone || '',
        deliveryAddress:user.deliveryAddress || '', pickupBy:f.delivery.pickupBy || user.name || '' } }))
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [form.userId])
  const product = data.products.find(p => p._id === form.productId)
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try { await staffAPI.inventoryEntry(form); await Promise.all([load(), loadDispatches()]); setMessage(['issue','use'].includes(form.type) ? '已提交健管专员工作台，确认出库后才扣减库存' : '记录已保存'); setForm(f => ({ ...f, requestId:crypto.randomUUID(), units:1, batchNo:'', expiresAt:'', sourceReceiptId:'', serialNo:'', note:'' })) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const correct = async (row, action) => {
    const reason = window.prompt(action === 'void' ? '请输入撤销误录原因' : '请输入客户退回原因')
    if (!reason?.trim()) return
    const units = action === 'customer_return' ? Number(window.prompt('本次退回数量', String(row.units))) : undefined
    if (action === 'customer_return' && (!Number.isInteger(units) || units < 1)) return setError('退回数量无效')
    try { await staffAPI.correctInventoryEntry(row._id, { action, reason, units }); await load(); setMessage(action === 'void' ? '已生成冲正记录' : '已登记客户退回') }
    catch (e) { setError(e.message) }
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
        {['issue','use','manual_sale'].includes(form.type) && <><label className="form-label">使用/购买客户{form.type === 'issue' ? '（寄送必选）' : ''}</label><InventoryCustomerPicker value={form.userId} onChange={userId => setForm(f => ({ ...f, userId, orderId:'', delivery:{ ...f.delivery, pickupBy:'', recipientName:'', recipientPhone:'', deliveryAddress:'' } }))} /></>}
        {['issue','use','return'].includes(form.type) && <><label className="form-label">领用/归还人员{['issue','return'].includes(form.type) ? '（必填）' : ''}</label><select className="form-input" required={['issue','return'].includes(form.type) || form.fromIssued} value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId:e.target.value })}><option value="">选择人员</option>{people.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select>
          {form.type === 'use' && <label><input type="checkbox" checked={form.fromIssued} onChange={e => setForm({ ...form, fromIssued:e.target.checked, orderId:'' })} /> 从已领用物资中使用（库存不再重复扣减）</label>}</>}
        {['issue','use'].includes(form.type) && <><label className="form-label">交付方式</label><select className="form-input" value={form.delivery.method} onChange={e => setForm(f => ({ ...f, delivery:{ ...f.delivery, method:e.target.value } }))}><option value="pickup">线下领取</option><option value="shipping">需要寄送</option></select>
          {form.delivery.method === 'pickup' ? <><label className="form-label">谁线下拿走（必填）</label><input className="form-input" required value={form.delivery.pickupBy} onChange={e => setForm(f => ({ ...f, delivery:{ ...f.delivery, pickupBy:e.target.value } }))} /></> : <><p>收件信息默认带出客户系统资料，可在本次申请中核实修改。</p>{[['recipientName','收件人'],['recipientPhone','联系电话'],['deliveryAddress','寄送地址']].map(([key,label]) => <React.Fragment key={key}><label className="form-label">{label}（必填）</label><input className="form-input" required value={form.delivery[key]} onChange={e => setForm(f => ({ ...f, delivery:{ ...f.delivery, [key]:e.target.value } }))} /></React.Fragment>)}</>}
        </>}
        {form.type === 'use' && <><label className="form-label">消费来源订单（可选）</label><select className="form-input" value={form.orderId} onChange={e => setForm({ ...form, orderId:e.target.value })}><option value="">未关联订单</option>{orders.filter(o => product?.linkedProductIds?.includes(o.serviceId) && (!form.serviceProductId || o.serviceId === form.serviceProductId)).map(o => <option key={o._id} value={o._id}>{o.orderNo} · {o.serviceName}</option>)}</select><p>订单只关联消费来源；直接发放扣实物库存，从已领用物资中使用不再扣减。</p></>}
        {form.type === 'manual_sale' && <><label className="form-label">后台维护的售价</label><input className="form-input" type="number" min="0" step="0.01" required readOnly value={form.unitPrice} /><p>此处只记录服务消费，不扣实物库存。请核对收款凭据，实际发放另行登记。</p></>}
        {form.type !== 'manual_sale' && <InventoryBatchPicker batches={product?.receiptBatches || []} value={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />}
        {product?.inventoryTracking?.kind === 'reusable' && <><label className="form-label">设备序列号</label><input className="form-input" value={form.serialNo} onChange={e => setForm({ ...form, serialNo:e.target.value })} /></>}
        <label className="form-label">备注/凭据{form.type === 'manual_sale' ? '（必填）' : ''}</label><textarea className="form-input" required={form.type === 'manual_sale'} value={form.note} onChange={e => setForm({ ...form, note:e.target.value })} />
        <button className="btn btn-primary" disabled={busy || !form.productId || (['use','manual_sale'].includes(form.type) && !form.userId) || (form.type === 'issue' && form.delivery.method === 'shipping' && !form.userId)}>{['issue','use'].includes(form.type) ? '提交出库申请' : '保存'}</button>
      </form>
      <section className="card" style={{ padding:20 }}><h2>可用库存</h2><table className="table"><thead><tr><th>物资</th><th>可用</th><th>提示</th></tr></thead><tbody>{data.products.map(p => <tr key={p._id}><td>{p.name}</td><td>{p.needsOpeningCount ? `待核实（旧账面 ${p.stock}）` : `${p.stock} ${p.inventoryTracking?.unit || ''}`}</td><td>{p.needsOpeningCount ? '期初待实盘核实，请联系管理员' : Number(p.stock) <= Number(p.inventoryTracking?.minStock || 0) ? '低库存' : '-'}</td></tr>)}</tbody></table></section>
    </div>
    <section className="card" style={{ padding:20, marginTop:18 }}><h2>我的出库申请</h2>{dispatches.length ? <table className="table"><thead><tr><th>提交时间</th><th>物资 / 客户</th><th>交付方式</th><th>状态</th><th>操作</th></tr></thead><tbody>{dispatches.map(item => <tr key={item._id}><td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td><td>{item.materialId?.name || '-'} · {item.userId?.name || '内部领用'} · {item.payload?.units} 件</td><td>{item.delivery?.method === 'shipping' ? `寄送：${item.delivery.recipientName}，${item.delivery.deliveryAddress}` : `线下领取：${item.delivery?.pickupBy || '-'}`}</td><td>{{ pending:'待健管专员出库', processing:'处理中', completed:'已出库', cancelled:'已撤销' }[item.status]}</td><td>{item.status === 'pending' && <button type="button" onClick={async () => { const reason = window.prompt('请输入撤销原因'); if (!reason?.trim()) return; try { await staffAPI.cancelInventoryDispatch(item._id, reason); await loadDispatches() } catch (e) { setError(e.message) } }}>撤销申请</button>}</td></tr>)}</tbody></table> : <p>暂无申请</p>}</section>
    <InventoryLedger products={data.products} records={data.recent} onEntryCorrection={correct} />
  </div>
}
