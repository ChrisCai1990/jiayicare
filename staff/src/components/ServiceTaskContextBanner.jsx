import React from 'react'
import { isCheckupBookingTask, isCheckupOnsiteTask } from './CheckupBookingForm'
import { isCheckupReportCollectionTask } from './CheckupReportCollectionForm'

const isCheckupPlan = task => {
  const plan = task?.sourceHealthPlanId
  const content = plan?.content || {}
  return content.serviceDomain === 'annual_checkup'
    || content.templateSnapshot?.serviceDomain === 'annual_checkup'
    || /体检/.test(`${content.templateName || ''} ${plan?.title || ''}`)
}

function nodeLabel(task) {
  if (isCheckupReportCollectionTask(task)) return '体检报告回收（本次体检服务最终收尾）'
  if (isCheckupOnsiteTask(task)) return '体检日陪诊执行'
  if (isCheckupBookingTask(task)) return '体检预约确认'
  if (task?.taskRole === 'supervisor') return '独立服务订单督办核验'
  return task?.theme || '服务任务执行'
}

export default function ServiceTaskContextBanner({ task }) {
  if (!task?.taskRole || !task?.sourceHealthPlanId) return null
  const title = task.sourceHealthPlanId?.title || '未命名服务方案'
  const checkup = isCheckupPlan(task)
  return <div style={{ padding: '11px 13px', border: `1px solid ${checkup ? '#B9DDD0' : '#E8DCC8'}`, borderRadius: 9, background: checkup ? '#F2F8F5' : '#FFFAF2', flexShrink: 0 }}>
    <div style={{ fontSize: 12, color: '#65776F' }}>所属服务方案</div>
    <div style={{ marginTop: 3, fontSize: 14, fontWeight: 750, color: '#1A2B24' }}>{title}</div>
    <div style={{ marginTop: 5, fontSize: 12, color: checkup ? '#1E6B50' : '#9A6700' }}>当前节点：{nodeLabel(task)}</div>
    {!checkup && task.taskRole === 'supervisor' && <div style={{ marginTop: 4, fontSize: 12, color: '#8A6A35' }}>这是另一笔就医代办服务的督办任务，不是体检一站式报告收尾。</div>}
  </div>
}
