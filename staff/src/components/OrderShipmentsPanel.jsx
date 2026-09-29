import React, { useState } from 'react'
import { staffAPI, getToken } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'

export default function OrderShipmentsPanel() {
  const resource = useWorkbenchResource(async () => (await staffAPI.getOrderShipments()).data || [], getToken(), [])
  const [selected, setSelected] = useState(null)
  const [company, setCompany] = useState(''), [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <div className="card" style={{ marginBottom: 20 }}>
    <div className="card-header"><div className="card-title">待发货订单 · {resource.data.length}</div></div>
    <div className="card-body">
      {resource.loading && <p>正在加载…</p>}
      {resource.error && <p role="alert">{resource.error} <button onClick={resource.refresh}>重试</button></p>}
      {!resource.loading && !resource.error && !resource.data.length && <p>暂无待发货订单</p>}
      {resource.data.map(order => <div key={order._id} style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
        <strong>{order.user?.name} · {order.serviceName}</strong>
        <p>{order.specificationLabel} · {order.note}</p>
        <p>配送地址：{order.user?.deliveryAddress || '请先与客户核实'} · 联系电话：{order.user?.contactPhone || order.user?.phone || '请核实'}</p>
        <button className="btn btn-primary btn-sm" onClick={() => { setSelected(order); setCompany(''); setTracking(''); setError('') }}>登记发货</button>
      </div>)}
    </div>
    {selected && <div className="modal-overlay"><form className="modal" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError('')
      try { await staffAPI.shipOrder(selected._id, { deliveryCompany: company, trackingNo: tracking }); setSelected(null); await resource.refresh() }
      catch (err) { setError(err.message) } finally { setBusy(false) }
    }}><div className="modal-header"><h3>登记发货 · {selected.user?.name}</h3></div><div className="modal-body">
      <label>快递公司<input className="form-input" required value={company} onChange={e => setCompany(e.target.value)} /></label>
      <label>运单号<input className="form-input" required value={tracking} onChange={e => setTracking(e.target.value)} /></label>
      {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    </div><div className="modal-footer"><button type="button" disabled={busy} onClick={() => setSelected(null)}>取消</button><button className="btn btn-primary" disabled={busy || !company.trim() || !tracking.trim()}>{busy ? '提交中…' : '确认已发货'}</button></div></form></div>}
  </div>
}
