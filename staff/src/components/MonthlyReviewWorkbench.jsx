import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'

export default function MonthlyReviewWorkbench() {
  const { staff } = useStaff()
  const nav = useNavigate()
  const [items, setItems] = useState({ pending: [], actions: [] })
  useEffect(() => {
    if (!staff?.role) return
    staffAPI.getMonthlyReviewWorkbench().then(result => setItems(result.data || { pending: [], actions: [] })).catch(() => {})
  }, [staff?.role])
  if (!items.pending?.length && !items.actions?.length) return null
  return <div className="card" style={{ marginBottom: 20 }}>
    <div className="card-header"><div className="card-title">月度服务复盘与行动 <span style={{ color: '#1E6B50' }}>{items.pending.length + items.actions.length}</span></div></div>
    <div style={{ padding: '8px 18px 18px' }}>
      {items.pending.map(item => <button key={`${item.annualPlanId}:${item.month}`} type="button" onClick={() => nav(`/patients/${item.patientId}/monthly-reviews?planId=${item.annualPlanId}&month=${item.month}`)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 0', border: 0, borderBottom: '1px solid #EDF0EC', background: 'none', cursor: 'pointer' }}>
        <b>{item.patientName || '客户'}</b> · {item.month} 服务复盘待确认 <span style={{ color: '#65776F' }}>→</span>
      </button>)}
      {items.actions.map(item => <button key={`${item.reviewId}:${item.actionId}`} type="button" onClick={() => nav(`/patients/${item.patientId}/monthly-reviews?planId=${item.annualPlanId}&month=${item.month}`)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 0', border: 0, borderBottom: '1px solid #EDF0EC', background: 'none', cursor: 'pointer' }}>
        <b>{item.month} 复盘行动</b> · {item.title} · 截止 {new Date(item.dueAt).toLocaleDateString('zh-CN')} <span style={{ color: '#65776F' }}>→</span>
      </button>)}
    </div>
  </div>
}
