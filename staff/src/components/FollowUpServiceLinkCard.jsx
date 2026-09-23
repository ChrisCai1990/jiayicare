import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import AnnualBookingCard from './AnnualBookingCard'
import itemTools from '../../../shared/annualServiceItem.cjs'

export default function FollowUpServiceLinkCard({ task, staff, onLinked }) {
  const request = task.taskRole === 'supervisor' && ((['professional_assessment', 'report_followup'].includes(task.sourceType) && task.workflowKey === `${task.sourceType}:service_request`) || (task.sourceType === 'annual_service' && task.workflowKey === 'service_request'))
  const canLink = request && (staff?.role === 'superadmin' || (staff?.role === 'healthPlanner' && String(task.assignedTo?._id || task.assignedTo) === String(staff._id)))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [followUpId, setFollowUpId] = useState('')
  const [target, setTarget] = useState('')
  useEffect(() => {
    if (!canLink) return
    let active = true
    setLoading(true)
    staffAPI.getFollowUpServiceOptions(task._id).then(res => {
      if (!active) return
      setData(res.data)
      setFollowUpId(res.data.link?.followUpId || (res.data.followUps?.length === 1 ? res.data.followUps[0]._id : ''))
    }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [task._id, canLink])
  const tracking = data?.link ? { ...data.link, revision: data.link.__v } : task.serviceTracking
  if (!request && !tracking) return itemTools.isAssistance(task) ? <AnnualBookingCard task={task} staff={staff} onLinked={onLinked} /> : null
  const booking = data?.followUps?.find(row => row._id === followUpId)?.annualBooking
  const bookingRequired = itemTools.isBookingRequest(task) && booking?.status !== 'booked'
  const canChoose = canLink && data && (!data.link || data.link.status === 'attention') && !['completed', 'cancelled'].includes(task.status)
  return <section style={{ border: '1px solid #B2D8C7', borderRadius: 8, padding: 12, background: '#F6FBF8', fontSize: 13 }}>
    <b>服务与随访关联</b>
    {tracking && <div style={{ marginTop: 8 }}>{tracking.title}<br />{tracking.message || '等待服务进度同步'}</div>}
    {loading && <p>正在读取服务…</p>}
    {error && <p role="alert" style={{ color: '#DC3545' }}>{error}</p>}
    {canChoose && itemTools.isBookingRequest(task) && <p>{bookingRequired ? '等待健管专员完成本事项预约；预约前不可安排服务。' : `预约已完成：${booking.date} · ${booking.hospital} · ${booking.department} · ${booking.note || ''}`}</p>}
    {canChoose && <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      <label>对应健管随访
        <select className="form-input" value={followUpId} disabled={loading || !!data.link} onChange={e => setFollowUpId(e.target.value)}>
          <option value="">请选择本服务要完成的事项</option>
          {(data.followUps || []).map(item => <option key={item._id} value={item._id}>{item.theme} · {item.date?.slice(0, 10)} · {item.assignedTo?.name || '未分配'}</option>)}
        </select>
      </label>
      <label>实际服务
        <select className="form-input" value={target} disabled={loading} onChange={e => setTarget(e.target.value)}>
          <option value="">请选择已建立的订单或服务方案</option>
          {(data.orders || []).map(item => <option key={`order:${item._id}`} value={`order:${item._id}`}>订单：{item.serviceName} · {item.orderNo || item.createdAt?.slice(0, 10)}{item.totalUnits > 1 ? `（整单${item.totalUnits}次全部完成后关闭随访）` : ''}</option>)}
          {(data.plans || []).map(item => <option key={`health_plan:${item._id}`} value={`health_plan:${item._id}`}>方案：{item.title} · {item.createdAt?.slice(0, 10)}</option>)}
        </select>
      </label>
      <div>请确认服务能完成上方随访事项。关联后，随访保留为进度查看；服务结束后自动更新。没有可选服务时，先按现有流程建立服务。</div>
      <button className="btn btn-primary btn-sm" disabled={loading || bookingRequired || !followUpId || !target} onClick={async () => {
        setLoading(true); setError('')
        try {
          const [targetType, targetId] = target.split(':')
          const res = await staffAPI.linkFollowUpService(task._id, { targetType, targetId, followUpId, revision: data.link?.__v })
          setData(null); onLinked(res.data)
        } catch (err) { setError(err.message || '关联失败，请重新打开后重试') } finally { setLoading(false) }
      }}>确认关联服务</button>
    </div>}
  </section>
}
