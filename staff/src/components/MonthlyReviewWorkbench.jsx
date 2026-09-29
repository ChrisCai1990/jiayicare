import useWorkbenchResource from '../hooks/useWorkbenchResource'
import { getToken } from '../api'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'

export default function MonthlyReviewWorkbench() {
  const { staff } = useStaff()
  const nav = useNavigate()
  const { data: items, loading, error, refresh } = useWorkbenchResource(
    async () => (await staffAPI.getMonthlyReviewWorkbench()).data || { pending: [], actions: [] },
    getToken(), { pending: [], actions: [] }, !!staff?.role)
  if (!loading && !error && !items.pending?.length && !items.actions?.length) return null
  return <div className="card" style={{ marginBottom: 20 }}>
    <div className="card-header"><div className="card-title">月度服务复盘与行动 <span style={{ color: '#1E6B50' }}>{items.pending.length + items.actions.length}</span></div></div>
    <div style={{ padding: '8px 18px 18px' }}>
      {loading && <div role="status">正在加载月度复盘…</div>}
      {error && <div role="alert" style={{ color: '#B42318' }}>月度复盘加载失败：{error} <button onClick={refresh}>重试</button></div>}
      {items.pending.map(item => <button key={`${item.annualPlanId}:${item.month}`} type="button" onClick={() => nav(`/patients/${item.patientId}/monthly-reviews?planId=${item.annualPlanId}&month=${item.month}`)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 0', border: 0, borderBottom: '1px solid #EDF0EC', background: 'none', cursor: 'pointer' }}>
        <b>{item.patientName || '客户'}</b> · {item.month} 服务复盘待确认 <span style={{ color: '#65776F' }}>→</span>
      </button>)}
      {items.actions.map(item => <button key={`${item.reviewId}:${item.actionId}`} type="button" onClick={() => nav(`/patients/${item.patientId}/monthly-reviews?planId=${item.annualPlanId}&month=${item.month}`)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 0', border: 0, borderBottom: '1px solid #EDF0EC', background: 'none', cursor: 'pointer' }}>
        <b>{item.month} 复盘行动</b> · {item.title} · 截止 {new Date(item.dueAt).toLocaleDateString('zh-CN')} <span style={{ color: '#65776F' }}>→</span>
      </button>)}
    </div>
  </div>
}
