import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const statusLabel = status => ({ approved: '专业审核通过', ready_to_publish: '待健康规划师确认', publish_confirmed: '已确认可发布', changes_requested: '已退回修改' }[status] || status || '-')
const reviewText = review => review?.reviewedAt ? `${review.reviewedByName || '本人'} · ${new Date(review.reviewedAt).toLocaleString()}${review.note ? ` · ${review.note}` : ''}` : ''

export default function ContentReviewHistoryPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { staffAPI.getContentReviews({ history: '1' }).then(r => setItems(r.data || [])).catch(e => toast(e.message || '加载审核记录失败', 'error')).finally(() => setLoading(false)) }, [])
  return <div className="page-container" style={{ maxWidth: 920 }}>
    <button onClick={() => nav('/home')} style={{ border: 'none', background: 'none', color: '#1E6B50', cursor: 'pointer', padding: 0 }}>← 返回工作台</button>
    <h2 style={{ marginTop: 18 }}>我的 GEO 内容审核记录</h2>
    {loading ? <p>加载中…</p> : items.length === 0 ? <p style={{ color: '#8A968F' }}>暂无本人审核记录。</p> : items.map(item => <div key={item._id} className="card" style={{ padding: 18, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><b>{item.title}</b><span style={{ color: '#1E6B50', fontSize: 13 }}>{statusLabel(item.status)}</span></div>
      {reviewText(item.nutritionReview) && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#52615A' }}>营养审核：{reviewText(item.nutritionReview)}</p>}
      {reviewText(item.doctorReview) && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#52615A' }}>健康顾问审核：{reviewText(item.doctorReview)}</p>}
    </div>)}
  </div>
}
