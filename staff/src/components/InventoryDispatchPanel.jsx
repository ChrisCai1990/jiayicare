import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function InventoryDispatchPanel() {
  const [items, setItems] = useState([])
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const refresh = () => staffAPI.inventoryDispatches('pending').then(r => setItems(r.data))
  useEffect(() => {
    refresh().catch(e => setError(e.message))
    const timer = window.setInterval(() => refresh().catch(e => setError(e.message)), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const update = (id, key, value) => setDrafts(all => ({ ...all, [id]:{ ...all[id], [key]:value } }))
  const complete = async item => {
    setBusy(item._id); setError('')
    try { await staffAPI.completeInventoryDispatch(item._id, drafts[item._id] || {}); await refresh() }
    catch (e) { setError(e.message) }
    finally { setBusy('') }
  }
  return <section className="card" style={{ padding:20, marginBottom:20 }}>
    <h2>待确认出库</h2><p>核对实际领取人或寄送信息后确认，确认时扣减实物库存。</p>
    {error && <p role="alert" style={{ color:'#b91c1c' }}>{error}</p>}
    {items.length === 0 ? <p>暂无待出库任务</p> : items.map(item => {
      const delivery = item.delivery || {}
      const draft = drafts[item._id] || {}
      const field = (key, label, fallback) => <label key={key} style={{ display:'block', marginTop:8 }}>{label}<input className="form-input" value={draft[key] ?? fallback ?? ''} onChange={e => update(item._id, key, e.target.value)} /></label>
      return <div key={item._id} style={{ borderTop:'1px solid #e5e7eb', padding:'14px 0' }}>
        <strong>{item.materialId?.name || '物资'} · {item.payload?.units} 件</strong>
        <p>使用客户：{item.userId?.name || '内部领用'}　录入人员：{item.actorId?.name || '-'}　动作：{item.type === 'issue' ? '领用' : '发放/实际使用'}</p>
        {delivery.method === 'pickup' ? <><p>交付方式：线下领取</p>{field('pickupBy', '谁线下拿走', delivery.pickupBy)}</> : <><p>交付方式：寄送</p>{field('recipientName', '收件人', delivery.recipientName)}{field('recipientPhone', '联系电话', delivery.recipientPhone)}{field('deliveryAddress', '寄送地址', delivery.deliveryAddress)}{field('carrier', '快递公司', '')}{field('trackingNo', '运单号', '')}</>}
        <button className="btn btn-primary" type="button" disabled={busy === item._id} style={{ marginTop:12 }} onClick={() => complete(item)}>确认出库</button>
      </div>
    })}
  </section>
}
