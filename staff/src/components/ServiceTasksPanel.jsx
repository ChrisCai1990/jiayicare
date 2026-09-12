import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { formatChineseDate } from '../utils/date'

export default function ServiceTasksPanel() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [group, setGroup] = useState('all')

  useEffect(() => {
    const refresh = () => staffAPI.getServiceTasks({ status: 'active', includeFuture: '1', limit: 100 })
      .then(r => setItems(r.data || []))
      .catch(() => {})
    refresh()
    const refreshIfVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    const timer = window.setInterval(refreshIfVisible, 15000)
    return () => {
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.clearInterval(timer)
    }
  }, [])

  if (!items.length) return null
  const serviceGroups = Object.values(items.reduce((result, task) => {
    const key = task.coordinationGroupId || `task:${task._id}`
    if (!result[key]) result[key] = { key, tasks: [] }
    result[key].tasks.push(task)
    return result
  }, {})).map(service => {
    const workflowModules = service.tasks[0]?.sourceHealthPlanId?.content?.workflowModules || []
    const sequenceByKey = new Map(workflowModules.map((item, sequence) => [String(item.id || item._id || ''), item.sequence ?? sequence]))
    service.tasks.sort((a, b) => (sequenceByKey.get(String(a.workflowKey || '')) ?? 999) - (sequenceByKey.get(String(b.workflowKey || '')) ?? 999))
    return { ...service, task: service.tasks[0], totalSteps: workflowModules.length || service.tasks.length }
  })
  const visibleServices = group === 'all' ? serviceGroups : serviceGroups.filter(service => service.task.taskRole === group)
  const executorCount = serviceGroups.filter(service => service.task.taskRole !== 'supervisor').length
  const supervisorCount = serviceGroups.filter(service => service.task.taskRole === 'supervisor').length

  const openTask = async (task) => {
    const sourcePlan = task.sourceHealthPlanId
    const sourcePlanId = sourcePlan?._id || sourcePlan
    if (task.workflowKey === 'system:outpatient_report_audit') {
      const reportId = task.formData?.reportIds?.[0]
      nav(`/patients/${task.patientId?._id}?tab=reports${reportId ? `&reportId=${reportId}` : ''}`)
      return
    }
    const checkupText = `${sourcePlan?.title || ''} ${sourcePlan?.content?.templateName || ''}`
    const isCheckupPlanningTask = task.taskRole !== 'supervisor'
      && task.assignedTo?.role === 'familyDoctor'
      && sourcePlanId
      && (sourcePlan?.content?.serviceDomain === 'annual_checkup'
        || sourcePlan?.content?.templateSnapshot?.serviceDomain === 'annual_checkup'
        || /体检/.test(checkupText))

    if (isCheckupPlanningTask) {
      // 客户确认后，后端会立即完成健康顾问任务。页面若尚未来得及刷新，旧卡片仍可能
      // 被点击；先重新读取有效任务，避免再次打开生成弹窗并制造一份重复草稿。
      try {
        const response = await staffAPI.getServiceTasks({ status: 'active', includeFuture: '1', limit: 100 })
        const activeItems = response.data || []
        setItems(activeItems)
        if (!activeItems.some(item => String(item._id) === String(task._id))) {
          nav(`/patients/${task.patientId?._id}?tab=plans&serviceView=checkup`)
          return
        }
      } catch {}
      nav(`/patients/${task.patientId?._id}?tab=plans&serviceView=checkup`, {
        state: { openAiCheckupDesign: true },
      })
      return
    }
    nav(`/patients/${task.patientId?._id}?tab=followups`, { state: { openFollowUp: task } })
  }

  return (
    <div className="card" style={{ marginBottom: 20, border: '1.5px solid #1E6B5035' }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>待处理服务任务</span>
          <span style={{ fontSize: 12, color: '#fff', background: '#1E6B50', padding: '2px 8px', borderRadius: 99 }}>{serviceGroups.length}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px 6px', borderTop: '1px solid #F3EFE8' }}>
        {[['all', '全部', serviceGroups.length], ['executor', '待执行', executorCount], ['supervisor', '待督办', supervisorCount]].map(([key, label, count]) => count > 0 && (
          <button key={key} onClick={() => setGroup(key)} style={{ border: group === key ? '1px solid #1E6B50' : '1px solid #DDD7CD', background: group === key ? '#EAF5F0' : '#fff', color: group === key ? '#1E6B50' : '#5F6B65', borderRadius: 16, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>{label} {count}</button>
        ))}
      </div>
      <div className="card-body" style={{ padding: '8px 20px' }}>
        {visibleServices.slice(0, 10).map((service, index) => {
          const task = service.task
          const isFuture = task.date && new Date(task.date).getTime() > Date.now()
          const isWaitingPrevious = !!task.isBlocked
          const isOutpatientEscortProgress = isWaitingPrevious && task.taskRole === 'supervisor' && /门诊一站式.*检查及专家门诊陪诊与归档/.test(task.theme || '')
          const isOutpatientReportAuditWait = isWaitingPrevious && task.taskRole === 'executor' && /门诊一站式.*查看陪诊资料并制定随访计划/.test(task.theme || '')
          return (
          <div key={task._id}
            onClick={() => openTask(task)}
            title={isOutpatientReportAuditWait ? '等待健管专员审核本次门诊病历和检验检查单' : isOutpatientEscortProgress ? '当前已进入陪诊及资料闭环阶段' : isWaitingPrevious ? '上一环节完成后即可办理' : ''}
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', cursor: isWaitingPrevious ? 'default' : 'pointer', opacity: isWaitingPrevious ? 0.78 : 1, borderBottom: index < Math.min(visibleServices.length, 10) - 1 ? '1px solid #f0ede8' : 'none' }}>
            <span style={{ fontSize: 18 }}>{isWaitingPrevious ? '⏳' : task.taskRole === 'supervisor' ? '🔎' : '✅'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1A2B24' }}>
                {task.theme}
                {service.totalSteps > 1 && <span style={{ marginLeft: 8, fontSize: 11, color: '#1E6B50', background: '#EAF5F0', padding: '2px 6px', borderRadius: 8 }}>当前环节 · 共{service.totalSteps}环节</span>}
                {isWaitingPrevious
                  ? <span style={{ marginLeft: 8, fontSize: 11, color: isOutpatientEscortProgress ? '#1E6B50' : '#667085', background: isOutpatientEscortProgress ? '#EAF5F0' : '#F2F4F7', padding: '2px 6px', borderRadius: 8 }}>{isOutpatientReportAuditWait ? '等待资料审核' : isOutpatientEscortProgress ? '陪诊及资料闭环进行中' : '等待上一环节'}</span>
                  : isFuture && <span style={{ marginLeft: 8, fontSize: 11, color: '#8A6A20', background: '#FFF4D6', padding: '2px 6px', borderRadius: 8 }}>待开始</span>}
              </div>
              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>
                {task.patientId?.name || '未知'}{isOutpatientReportAuditWait ? ' · 等待健管专员审核病历与检验检查单' : isWaitingPrevious && task.dependsOnTaskId?.assignedTo?.name ? ` · 当前执行：${task.dependsOnTaskId.assignedTo.name}` : task.assignedTo?.name ? ` · 负责人：${task.assignedTo.name}` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#9AA9A2', marginTop: 2 }}>创建：{new Date(task.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</div>
            </div>
            {!isWaitingPrevious && <span style={{ fontSize: 11, color: '#8AA89C' }}>计划：{formatChineseDate(task.date, false)}</span>}
          </div>
          )
        })}
      </div>
    </div>
  )
}
