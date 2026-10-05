import React from 'react'
import { formatChineseDate } from '../utils/date'

const OPEN_STATUSES = new Set(['planned', 'in_progress', 'missed'])

export default function FollowUpDueDateBanner({ task }) {
  if (!task || task.taskRole || !task.date) return null
  const dueDate = new Date(task.date)
  if (Number.isNaN(dueDate.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdue = OPEN_STATUSES.has(task.status) && dueDate < today

  return <div style={{ padding: '12px 14px', borderRadius: 9, border: `1px solid ${overdue ? '#F0C6BF' : '#D9E8DF'}`, background: overdue ? '#FFF4F1' : '#F4F9F6', flexShrink: 0 }}>
    <div style={{ fontSize: 12, color: '#65776F' }}>本次随访应执行日期</div>
    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
      <strong style={{ fontSize: 18, color: '#1A2B24' }}>{formatChineseDate(dueDate)}</strong>
      {overdue && <span style={{ fontSize: 12, fontWeight: 700, color: '#B42318' }}>已逾期</span>}
    </div>
    {overdue && <div style={{ marginTop: 5, fontSize: 12, color: '#8B5E56' }}>逾期按本次随访日期判断；方案内的建议开单时间属于后续安排。</div>}
  </div>
}
