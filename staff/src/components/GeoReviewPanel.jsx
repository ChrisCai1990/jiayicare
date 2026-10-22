import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaff } from '../App'
import { staffAPI, getToken } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'

// UI visibility mirrors the existing designated owners; API authorization remains authoritative.
const owners = { familyDoctor: '6a28b5b4441e73bd7deb3ba5', nutritionist: '6a28b635441e73bd7deb3c1e' }

export const canShowGeoReview = staff => staff?.staffStatus !== 'inactive' && (staff?.role === 'superadmin' || (!!owners[staff?.role] && String(staff?._id || staff?.id || '') === owners[staff.role]))

export default function GeoReviewPanel({ compact = false, onOpen, onCountChange }) {
  const { staff } = useStaff()
  const nav = useNavigate()
  const enabled = canShowGeoReview(staff)
  const resource = useWorkbenchResource(async () => (await staffAPI.getContentReviews()).data || [], getToken(), [], enabled)
  const pending = resource.data.filter(item => item.status === 'pending' && (staff?.role === 'superadmin' || item.currentRole === staff?.role))
  const countLabel = resource.loading ? '加载中' : resource.error ? '待核实' : String(pending.length)
  useEffect(() => { onCountChange?.(countLabel) }, [countLabel, onCountChange])
  if (!enabled) return null
  return <section className="card" aria-label="GEO 内容审核" style={{ padding: 18, marginBottom: 20, border: '1px solid #CFC3E9' }}>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>GEO 内容审核 · {resource.loading ? '加载中' : resource.error ? '待核实' : `待审核 ${pending.length} 篇`}</h2>
      {compact ? <button className="btn btn-secondary btn-sm" onClick={onOpen}>进入 GEO 审核</button> : <button className="btn btn-secondary btn-sm" onClick={() => nav('/content-reviews')}>审核历史</button>}
    </div>
    {resource.error && <div role="alert" style={{ color: '#B42318', marginTop: 12 }}>审核稿加载失败：{resource.error}。不能据此判断没有待审稿。<button onClick={resource.refresh}>重试</button></div>}
    {!compact && !resource.loading && !resource.error && pending.length === 0 && <p>当前没有待您审核的稿件。已退回稿不列入待办。</p>}
    {!compact && pending.length > 0 && <details open style={{ marginTop: 12 }}>
      <summary>待审稿件列表{resource.error ? '（上次加载结果）' : ''}</summary>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>{pending.map(item => <article key={item._id} style={{ padding: '12px 0', borderBottom: '1px solid #E8E5EE' }}>
        <strong>{item.title}</strong>
        {item.revisions?.length > 0 && <p style={{ margin: '6px 0', fontSize: 13 }}>修订后重新送审 · 第{item.revisions.length + 1}版 · {item.revisions[item.revisions.length - 1].changeSummary}</p>}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 12 }} onClick={() => nav(`/content-reviews/${item._id}`)}>查看并审核</button>
      </article>)}</div>
    </details>}
  </section>
}
