import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { formatChineseDate } from '../utils/date'

export default function ServiceTasksPanel() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [group, setGroup] = useState('all')

  useEffect(() => {
    staffAPI.getFollowUps({ status: 'active', sourceType: 'health_plan', scope: 'assigned', includeFuture: '1', limit: 100 })
      .then(r => setItems(r.data?.followUps || []))
      .catch(() => {})
  }, [])

  if (!items.length) return null
  const visibleItems = group === 'all' ? items : items.filter(item => item.taskRole === group)
  const executorCount = items.filter(item => item.taskRole !== 'supervisor').length
  const supervisorCount = items.filter(item => item.taskRole === 'supervisor').length

  return (
    <div className="card" style={{ marginBottom: 20, border: '1.5px solid #1E6B5035' }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>待处理服务任务</span>
          <span style={{ fontSize: 12, color: '#fff', background: '#1E6B50', padding: '2px 8px', borderRadius: 99 }}>{items.length}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px 6px', borderTop: '1px solid #F3EFE8' }}>
        {[['all', '全部', items.length], ['executor', '待执行', executorCount], ['supervisor', '待督办', supervisorCount]].map(([key, label, count]) => count > 0 && (
          <button key={key} onClick={() => setGroup(key)} style={{ border: group === key ? '1px solid #1E6B50' : '1px solid #DDD7CD', background: group === key ? '#EAF5F0' : '#fff', color: group === key ? '#1E6B50' : '#5F6B65', borderRadius: 16, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>{label} {count}</button>
        ))}
      </div>
      <div className="card-body" style={{ padding: '8px 20px' }}>
        {visibleItems.slice(0, 10).map((task, index) => {
          const isFuture = task.date && new Date(task.date).getTime() > Date.now()
          return (
          <div key={task._id}
            onClick={() => nav(`/patients/${task.patientId?._id}?tab=followups`, { state: { openFollowUp: task } })}
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', cursor: 'pointer', borderBottom: index < Math.min(visibleItems.length, 10) - 1 ? '1px solid #f0ede8' : 'none' }}>
            <span style={{ fontSize: 18 }}>{task.taskRole === 'supervisor' ? '🔎' : '✅'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1A2B24' }}>
                {task.theme}
                {isFuture && <span style={{ marginLeft: 8, fontSize: 11, color: '#8A6A20', background: '#FFF4D6', padding: '2px 6px', borderRadius: 8 }}>待开始</span>}
              </div>
              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>
                {task.patientId?.name || '未知'}{task.assignedTo?.name ? ` · 负责人：${task.assignedTo.name}` : ''}
              </div>
            </div>
            <span style={{ fontSize: 11, color: '#8AA89C' }}>{formatChineseDate(task.date, false)}</span>
          </div>
          )
        })}
      </div>
    </div>
  )
}
