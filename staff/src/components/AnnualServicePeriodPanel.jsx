import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function AnnualServicePeriodPanel({ planId, staff }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ sourceType: 'paid_order', sourceOrderId: '', contractReference: '', startDate: '', endDate: '', verified: false })
  useEffect(() => {
    let active = true
    setData(null); setError('')
    if (planId) staffAPI.getAnnualServicePeriod(planId).then(res => { if (active) setData(res.data) }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [planId])
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const save = async () => {
    setBusy(true); setError('')
    try { const res = await staffAPI.confirmAnnualServicePeriod(planId, form); setData(res.data) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="card" style={{ padding: 16, marginBottom: 20 }}>
    <strong>续约凭据与新年度启用</strong>
    <p style={{ fontSize: 13 }}>修改档案中的到期日期不代表续约。客户可先确认方案；有有效凭据且服务期开始后，系统才派发新年度任务。</p>
    {error && <p style={{ color: '#B42318' }}>{error}</p>}
    {!planId ? <p>请先保存本年度草稿，再由所属健康规划师核对续约凭据。</p> : data && <>
      <p>{data.activation?.allowed ? '已满足任务启用条件' : data.activation?.reason}{data.warning ? `；${data.warning}` : ''}</p>
      {data.period?.activationStatus === 'failed' && <p style={{ color: '#B42318' }}>任务同步未完成，系统每日重试；请核对岗位配置，无需重复确认续约。</p>}
      {data.period ? <p>已留存{data.period.sourceType === 'paid_order' ? '已支付年度订单' : '线下合同'}凭据：{data.period.startDate} 至 {data.period.endDate}。确认记录不可直接覆盖。</p> : ['healthPlanner', 'superadmin'].includes(staff?.role) ? <div style={{ display: 'grid', gap: 10, maxWidth: 600 }}>
        <label>续约凭据<select className="form-input" value={form.sourceType} onChange={e => update('sourceType', e.target.value)}><option value="paid_order">已支付年度服务订单</option><option value="offline_contract">已核验的线下合同</option></select></label>
        {form.sourceType === 'paid_order' ? <label>年度订单<select className="form-input" value={form.sourceOrderId} onChange={e => update('sourceOrderId', e.target.value)}><option value="">请选择</option>{(data.orders || []).map(order => <option key={order._id} value={order._id}>{order.orderNo || order._id} · {order.serviceName}</option>)}</select></label> : <>
          <label>合同编号<input className="form-input" value={form.contractReference} onChange={e => update('contractReference', e.target.value)} maxLength={200} /></label>
          <label><input type="checkbox" checked={form.verified} onChange={e => update('verified', e.target.checked)} /> 已核验线下合同及约定服务期</label>
        </>}
        <label>服务开始日期<input className="form-input" type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></label>
        <label>服务结束日期<input className="form-input" type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '确认中…' : '确认续约凭据及服务期'}</button>
      </div> : <p>由该客户所属健康规划师在工作台核对凭据。</p>}
    </>}
  </section>
}
