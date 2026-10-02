import React, { useState } from 'react'

export default function PackageHistoryReview({ entitlement, saving, onSave, onCancel }) {
  const pools = entitlement.rights?.sharedEntitlementPools || []
  const products = entitlement.rights?.productEntitlements || []
  const records = (entitlement.usageRecords || []).filter(row => row.status !== 'cancelled')
  const [poolUsed, setPoolUsed] = useState(() => pools.map(() => ''))
  const [productUsed, setProductUsed] = useState(() => products.map(item => item.poolKey && pools.some(pool => pool.key === item.poolKey) ? '0' : ''))
  const [note, setNote] = useState('')
  const setAt = (setter, index, value) => setter(current => current.map((item, at) => at === index ? value : item))
  const countRecorded = item => records.filter(row => item.key ? row.poolKey === item.key : !row.poolKey && String(row.productId) === String(item.productId)).length
  const input = (item, index, values, setter) => <div key={`${item.key || item.productId}:${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '7px 0', borderBottom: '1px solid #E7ECE7' }}>
    <label style={{ flex: '1 1 220px' }}>{item.name || item.productName} · 总计 {item.count} 次 · 新台账已记 {countRecorded(item)} 次</label>
    <input className="form-input" type="number" min="0" max={Math.max(0, Number(item.count) - countRecorded(item))} step="1" required value={values[index]} onChange={event => setAt(setter, index, event.target.value)} style={{ width: 110 }} aria-label={`${item.name || item.productName}历史已用次数`} />
  </div>
  return <form onSubmit={event => {
    event.preventDefault()
    onSave({ poolUsed: poolUsed.map(Number), productUsed: productUsed.map(Number), note: note.trim() })
  }} style={{ padding: 16, border: '1px solid #DCA54B', borderRadius: 10, background: '#FFFCF3' }}>
    <strong>核对「{entitlement.packageName}」历史次数</strong>
    <p style={{ fontSize: 12, color: '#6B5C43' }}>只填旧服务已用次数；新台账中的预占和已核销次数由系统合并计算。共用服务只在共享池填写一次。保存后将显示可用余额，并留下核对依据。</p>
    {pools.map((item, index) => input(item, index, poolUsed, setPoolUsed))}
    {products.map((item, index) => item.poolKey && pools.some(pool => pool.key === item.poolKey) ? null : input(item, index, productUsed, setProductUsed))}
    <label style={{ display: 'block', marginTop: 12, fontSize: 13 }}>核对依据（例如订单、服务档案和核对日期）</label>
    <textarea className="form-input" required minLength={8} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} rows={2} style={{ width: '100%', marginTop: 6 }} />
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-primary btn-sm" disabled={saving || !note.trim()}>{saving ? '保存中…' : '确认历史次数'}</button><button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>取消</button></div>
  </form>
}
