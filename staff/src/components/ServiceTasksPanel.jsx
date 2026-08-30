import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { formatChineseDate } from '../utils/date'

export default function ServiceTasksPanel() {
  const nav = useNavigate()
  const [items, setItems] = useState([])

  useEffect(() => {
    staffAPI.getFollowUps({ status: 'active', sourceType: 'health_plan', scope: 'assigned', limit: 100 })
      .then(r => setItems(r.data?.followUps || []))
      .catch(() => {})
  }, [])

  if (!items.length) return null

  return (
    <div className="card" style={{ marginBottom: 20, border: '1.5px solid #1E6B5035' }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>待处理服务任务</span>
          <span style={{ fontSize: 12, color: '#fff', background: '#1E6B50', padding: '2px 8px', borderRadius: 99 }}>{items.length}</span>
        </div>
      </div>
      <div className="card-body" style={{ padding: '8px 20px' }}>
        {items.slice(0, 10).map((task, index) => (
          <div key={task._id}
            onClick={() => nav(`/patients/${task.patientId?._id}?tab=followups`, { state: { openFollowUp: task } })}
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', cursor: 'pointer', borderBottom: index < Math.min(items.length, 10) - 1 ? '1px solid #f0ede8' : 'none' }}>
            <span style={{ fontSize: 18 }}>{task.taskRole === 'supervisor' ? '🔎' : '✅'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1A2B24' }}>{task.theme}</div>
              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>
                {task.patientId?.name || '未知'}{task.assignedTo?.name ? ` · 负责人：${task.assignedTo.name}` : ''}
              </div>
            </div>
            <span style={{ fontSize: 11, color: '#8AA89C' }}>{formatChineseDate(task.date, false)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
