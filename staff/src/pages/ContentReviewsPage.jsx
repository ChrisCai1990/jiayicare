import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const roleName = role => role === 'nutritionist' ? '营养师' : '健康顾问/医师'
const reviewName = review => review?.status === 'approved' ? '已通过' : review?.status === 'returned' ? '已退回' : '待审核'

export default function ContentReviewsPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await staffAPI.getContentReviews()
      const found = (r.data || []).find(x => x._id === id)
      setItem(found || null)
    } catch (e) { toast(e.message || '加载审核稿失败', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const submit = async action => {
    const note = action === 'return' ? window.prompt('请填写退回修改意见（仅填写内容审核意见）：') : window.prompt('审核备注（可留空）：', '')
    if (action === 'return' && !note?.trim()) return
    setSubmitting(true)
    try {
      const r = await staffAPI.reviewContentReview(id, { action, note: note || '' })
      toast(r.message || '审核已保存', 'success')
      nav('/home')
    } catch (e) { toast(e.message || '审核保存失败', 'error') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="page-container">加载审核稿…</div>
  if (!item) return <div className="page-container"><button onClick={() => nav('/home')}>返回工作台</button><p style={{ marginTop: 16 }}>该审核稿已不在您的待处理列表，可能已完成或已转交下一环节。</p></div>
  return <div className="page-container" style={{ maxWidth: 920 }}>
    <button onClick={() => nav('/home')} style={{ border: 'none', background: 'none', color: '#1E6B50', cursor: 'pointer', padding: 0 }}>← 返回工作台</button>
    <div className="card" style={{ marginTop: 16, padding: 24 }}>
      <div style={{ fontSize: 13, color: '#7C3AED', fontWeight: 600 }}>官网 GEO 内容审核 · 当前环节：{roleName(item.currentRole)}</div>
      <h2 style={{ margin: '8px 0' }}>{item.title}</h2>
      <p style={{ color: '#66756E' }}>{item.summary}</p>
      <div style={{ display: 'flex', gap: 18, margin: '16px 0', fontSize: 13, color: '#52615A' }}>
        <span>营养审核：{reviewName(item.nutritionReview)}</span>
        <span>医师审核：{reviewName(item.doctorReview)}</span>
        <span>来源更新：{item.sourceUpdatedAt || '-'}</span>
      </div>
      <div style={{ background: '#F8FAF9', border: '1px solid #E3E9E6', borderRadius: 10, padding: 18, whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#22352C' }}>{item.sourceContent}</div>
      <p style={{ fontSize: 12, color: '#8A968F', marginTop: 14 }}>审核通过后只会标记为“待发布”，不会自动公开到官网。</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button disabled={submitting} onClick={() => submit('approve')} className="btn btn-primary">审核通过</button>
        <button disabled={submitting} onClick={() => submit('return')} className="btn btn-outline">退回修改</button>
      </div>
    </div>
  </div>
}
