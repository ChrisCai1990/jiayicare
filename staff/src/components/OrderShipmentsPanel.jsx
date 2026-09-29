import React, { useState } from 'react'
import { staffAPI, getToken } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'
import './OrderShipmentsPanel.css'

const displayNote = note => String(note || '').split('\n')
  .filter(line => !/^已确认服务任务[:：]/.test(line.trim()))
  .join(' · ').trim()

const amount = order => Number(order.paidAmount || 0) + Number(order.healthFundAmount || 0)
const recipient = order => order.user?.contactName || order.user?.name || '请核实收件人'
const contactPhone = order => order.user?.contactPhone || order.user?.phone || '请核实联系电话'
const deliveryAddress = order => order.user?.deliveryAddress || '请先与客户核实收货地址'

export default function OrderShipmentsPanel() {
  const resource = useWorkbenchResource(async () => (await staffAPI.getOrderShipments()).data || [], getToken(), [])
  const [selected, setSelected] = useState(null)
  const [company, setCompany] = useState(''), [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <section className="shipment-panel">
    <div className="shipment-panel__heading">
      <div><span className="shipment-panel__eyebrow">订单履约</span><h2>待发货订单 <b>{resource.data.length}</b></h2></div>
      <span className="shipment-panel__hint">确认快递信息后即可完成登记</span>
    </div>
    <div className="shipment-panel__content">
      {resource.loading && <p className="shipment-panel__empty">正在加载订单…</p>}
      {resource.error && <p className="shipment-panel__empty" role="alert">{resource.error} <button onClick={resource.refresh}>重试</button></p>}
      {!resource.loading && !resource.error && !resource.data.length && <p className="shipment-panel__empty">暂无待发货订单</p>}
      {resource.data.map(order => <article className="shipment-order" key={order._id}>
        <div className="shipment-order__main">
          <div className="shipment-order__top">
            <div className="shipment-order__customer"><span className="shipment-order__avatar">{(order.user?.name || '?').slice(0, 1)}</span><div><strong>{order.user?.name || '客户信息待核实'}</strong><span>{order.serviceName}</span></div></div>
            <span className="shipment-order__status">待发货</span>
          </div>
          <div className="shipment-order__facts">
            <span>规格：{order.specificationLabel || '待核实'}</span>
            {amount(order) > 0 && <span>实付 ¥{amount(order).toFixed(2)}</span>}
          </div>
          <div className="shipment-order__address"><span>配送至</span><p>{deliveryAddress(order)}<i />{recipient(order)} · {contactPhone(order)}</p></div>
          {displayNote(order.note) && <p className="shipment-order__note">备注：{displayNote(order.note)}</p>}
        </div>
        <button className="btn btn-primary shipment-order__action" onClick={() => { setSelected(order); setCompany(''); setTracking(''); setError('') }}>登记发货 <span>→</span></button>
      </article>)}
    </div>
    {selected && <div className="modal-overlay"><form className="modal" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError('')
      try { await staffAPI.shipOrder(selected._id, { deliveryCompany: company, trackingNo: tracking }); setSelected(null); await resource.refresh() }
      catch (err) { setError(err.message) } finally { setBusy(false) }
    }}><div className="modal-header"><h3>登记发货 · {selected.user?.name}</h3></div><div className="modal-body">
      <div className="shipment-recipient"><div><span>收件人</span><strong>{recipient(selected)}</strong></div><div><span>联系电话</span><strong>{contactPhone(selected)}</strong></div><div className="shipment-recipient__address"><span>配送地址</span><strong>{deliveryAddress(selected)}</strong></div></div>
      <label>快递公司<input className="form-input" required value={company} onChange={e => setCompany(e.target.value)} /></label>
      <label>运单号<input className="form-input" required value={tracking} onChange={e => setTracking(e.target.value)} /></label>
      {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    </div><div className="modal-footer"><button type="button" disabled={busy} onClick={() => setSelected(null)}>取消</button><button className="btn btn-primary" disabled={busy || !company.trim() || !tracking.trim()}>{busy ? '提交中…' : '确认已发货'}</button></div></form></div>}
  </section>
}
