import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'

const money = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`

export default function PartnerTeamEarningsPage() {
  const [rows, setRows] = useState({ rows: [], count: 0, page: 1, pageSize: 10 })
  const [payment, setPayment] = useState({})
  const [people, setPeople] = useState(new Map())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async (page = 1) => setRows((await adminAPI.partnerTeamEarnings({ page })).data)
  useEffect(() => {
    Promise.all([load(), adminAPI.employees({ limit: 500 }), adminAPI.marketPartners()])
      .then(([, staff, partners]) => setPeople(new Map([
        ...(staff.data || []).map(item => [`staff:${item._id}`, item.name]),
        ...(partners.data || []).map(item => [`partner:${item._id}`, item.name]),
      ]))).catch(err => setError(err.message))
  }, [])
  const name = (type, id) => people.get(`${type}:${id}`) || '已停用人员'
  const submit = async item => {
    setBusy(true); setError('')
    try {
      const data = payment[item._id]
      if (item.status === 'reversal_due') await adminAPI.recoverPartnerTeamEarning(item._id, data)
      else await adminAPI.payPartnerTeamEarning(item._id, data)
      await load(rows.page)
    } catch (err) { setError(err.message || '保存失败') }
    finally { setBusy(false) }
  }
  return <div className="page" style={{ maxWidth: 1240 }}>
    <div className="page-header"><div><div className="page-title">负责人逐笔核对</div>
      <div className="page-subtitle">仅登记已经完成的转账或追回；应计与实发分开核对</div></div></div>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    <section style={{ background: '#fff', border: '1px solid #dbe5de', borderRadius: 10, padding: 18 }}>
      <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>订单</th><th>负责人／成员</th><th>来源</th><th>规则</th><th>基数</th><th>应计／已发</th><th>状态</th><th>登记实际转账或追回</th></tr></thead><tbody>
        {rows.rows.map(item => <tr key={item._id}>
          <td>{item.orderId?.orderNo || String(item.orderId)}<br />{item.orderId?.serviceName}</td>
          <td>{name(item.leaderType, item.leaderId)}（{item.leaderType === 'staff' ? '员工' : '市场'}）／{name(item.memberType, item.memberId)}（{item.memberType === 'staff' ? '员工' : '市场'}）</td>
          <td>{item.activity === 'service' ? '服务' : '推广'}</td>
          <td>v{item.ruleVersion} · {item.calculationType === 'percentage' ? `${item.basisPoints / 100}%` : money(item.fixedCents)}</td>
          <td>{money(item.basisCents)}</td><td>{money(item.accruedCents)}／{money(item.paidCents - item.recoveredCents)}</td>
          <td>{({ estimated: '预估', pending: '待发', paid: '已发', reversal_due: '待追回', cancelled: '已取消' })[item.status]}</td>
          <td>{['pending', 'reversal_due'].includes(item.status) && <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" type="number" min="0.01" step="0.01" placeholder="金额（元）"
              value={payment[item._id]?.amount || ''} onChange={event => setPayment(old => ({ ...old, [item._id]: { ...old[item._id], amount: event.target.value } }))} style={{ width: 110 }} />
            <input className="form-input" placeholder="银行流水号" value={payment[item._id]?.reference || ''}
              onChange={event => setPayment(old => ({ ...old, [item._id]: { ...old[item._id], reference: event.target.value } }))} style={{ width: 130 }} />
            <button className="btn btn-sm" disabled={busy || !payment[item._id]?.amount || !payment[item._id]?.reference} onClick={() => submit(item)}>
              {item.status === 'reversal_due' ? '登记追回' : '登记转账'}</button>
          </div>}</td>
        </tr>)}
      </tbody></table></div>
      {!rows.rows.length && <p>暂无逐笔记录</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>共 {rows.count} 笔 · 第 {rows.page} 页</span>
        <button className="btn btn-sm" disabled={rows.page <= 1} onClick={() => load(rows.page - 1)}>上一页</button>
        <button className="btn btn-sm" disabled={rows.page * rows.pageSize >= rows.count} onClick={() => load(rows.page + 1)}>下一页</button></div>
    </section>
  </div>
}
