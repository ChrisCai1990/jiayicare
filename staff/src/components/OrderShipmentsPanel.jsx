import React, { useState } from 'react'
import { staffAPI, getToken } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'
import { useStaff } from '../App'
import Pagination from './Pagination'
import './OrderShipmentsPanel.css'

const displayNote = note => String(note || '').split('\n')
  .filter(line => !/^已确认服务任务[:：]/.test(line.trim()))
  .join(' · ').trim()

const amount = order => Number(order.paidAmount || 0) + Number(order.healthFundAmount || 0)
const recipient = order => order.user?.contactName || order.user?.name || ''
const contactPhone = order => order.user?.contactPhone || order.user?.phone || '请核实联系电话'
const deliveryAddress = order => order.user?.deliveryAddress || '请先与客户核实收货地址'
const time = value => value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '历史记录未留时间'

export default function OrderShipmentsPanel() {
  const { staff } = useStaff()
  const resource = useWorkbenchResource(async () => (await staffAPI.getOrderShipments()).data || [], getToken(), [])
  const [historyOpen, setHistoryOpen] = useState(false), [historyPage, setHistoryPage] = useState(1)
  const history = useWorkbenchResource(async () => (await staffAPI.getOrderShipments({ view: 'history', page: historyPage, limit: 5 })).data || { items: [], total: 0, totalPages: 1 }, `${getToken()}:shipment-history:${historyPage}`, { items: [], total: 0, totalPages: 1 })
  const [selected, setSelected] = useState(null)
  const [company, setCompany] = useState(''), [tracking, setTracking] = useState('')
  const [shippingContact, setShippingContact] = useState({ recipientName: '', recipientPhone: '', deliveryAddress: '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const canShip = ['healthManager', 'superadmin'].includes(staff?.role)
  if (!resource.loading && !resource.error && !resource.data.length && !history.loading && !history.error && !history.data.total) return null
  return <section className="shipment-panel">
    <div className="shipment-panel__heading">
      <div><span className="shipment-panel__eyebrow">订单履约</span><h2>{resource.data.length ? <>待发货订单 <b>{resource.data.length}</b></> : '订单发货记录'}</h2></div>
      <span className="shipment-panel__hint">{resource.data.length ? '确认快递信息后即可完成登记' : '可查看已处理的发货记录'}</span>
    </div>
    <div className="shipment-panel__content">
      {resource.loading && <p className="shipment-panel__empty">正在加载订单…</p>}
      {resource.error && <p className="shipment-panel__empty" role="alert">{resource.error} <button onClick={resource.refresh}>重试</button></p>}
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
        {canShip ? <button className="btn btn-primary shipment-order__action" onClick={() => { setSelected(order); setCompany(''); setTracking(''); setShippingContact({ recipientName: recipient(order), recipientPhone: contactPhone(order), deliveryAddress: deliveryAddress(order) }); setError('') }}>登记发货 <span>→</span></button> : <span className="shipment-order__status">已转健管专员发货</span>}
      </article>)}
      {history.error && <p className="shipment-panel__empty" role="alert">历史记录加载失败：{history.error}</p>}
      {history.data.total > 0 && <div className="shipment-history"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setHistoryOpen(value => !value)}>{historyOpen ? '收起已处理发货' : `查看已处理发货 ${history.data.total}`}</button>
        {historyOpen && <div className="shipment-history__list">{history.data.items.map(order => { const cancelled = order.fulfillmentStatus === 'cancelled' || order.status === 'cancelled'; return <article key={order._id} className="shipment-history__item"><div><b>{order.user?.name || '客户信息待核实'} · {order.serviceName}</b><p>下单：{time(order.createdAt)}　规划师确认：{time(order.shippingHandoffAt)}　{cancelled ? '未发货，订单已取消' : `发货：${time(order.fulfillment?.shippedAt)}`}</p><p>{cancelled ? '已退款/取消' : `${order.fulfillment?.deliveryCompany || '快递公司待补'} · ${order.fulfillment?.trackingNo || '运单号待补'}`}</p></div><span>{cancelled ? '已取消' : '已发货'}</span></article>})}
          {history.data.totalPages > 1 && <Pagination compact page={history.data.page} totalPages={history.data.totalPages} onChange={setHistoryPage} />}
        </div>}
      </div>}
    </div>
    {selected && <div className="modal-overlay"><form className="modal" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError('')
      try { await staffAPI.shipOrder(selected._id, { deliveryCompany: company, trackingNo: tracking, ...shippingContact }); setSelected(null); await resource.refresh() }
      catch (err) { setError(err.message) } finally { setBusy(false) }
    }}><div className="modal-header"><h3>登记发货 · {selected.user?.name}</h3></div><div className="modal-body">
      <div className="shipment-recipient shipment-recipient--editing"><p>已带入客户档案；本次修改仅用于此订单发货。</p><label>收件人<input className="form-input" required value={shippingContact.recipientName} onChange={e => setShippingContact(value => ({ ...value, recipientName: e.target.value }))} /></label><label>联系电话<input className="form-input" required value={shippingContact.recipientPhone} onChange={e => setShippingContact(value => ({ ...value, recipientPhone: e.target.value }))} /></label><label className="shipment-recipient__address">配送地址<input className="form-input" required value={shippingContact.deliveryAddress} onChange={e => setShippingContact(value => ({ ...value, deliveryAddress: e.target.value }))} /></label></div>
      <label>快递公司<input className="form-input" required value={company} onChange={e => setCompany(e.target.value)} /></label>
      <label>运单号<input className="form-input" required value={tracking} onChange={e => setTracking(e.target.value)} /></label>
      {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    </div><div className="modal-footer"><button type="button" disabled={busy} onClick={() => setSelected(null)}>取消</button><button className="btn btn-primary" disabled={busy || !company.trim() || !tracking.trim() || !shippingContact.recipientName.trim() || !shippingContact.recipientPhone.trim() || !shippingContact.deliveryAddress.trim()}>{busy ? '提交中…' : '确认已发货'}</button></div></form></div>}
  </section>
}
