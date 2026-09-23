import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { formatChineseDate } from '../utils/date'
import { isCheckupDesignStage } from '../utils/checkupTaskRouting'
import { useStaff } from '../App'
import AnnualDispatchCard from './AnnualDispatchCard'
import annualDispatch from '../../../shared/annualDispatch.cjs'
import { serviceTaskTitle } from '../utils/serviceTaskTitle.mjs'

const TASKS_PER_PAGE = 5

const checkupProgress = task => {
  if (task?.workflowKey !== 'checkup_appointment:supervise') return null
  const stage = task.formData?.currentStage || 'booking'
  const stages = {
    booking: { step: 2, label: '健管专员预约中', next: '完成预约后转交就医专员' },
    medical: { step: 3, label: '就医专员办理开单与检查预约', next: '检查后提醒客户上传报告和病历' },
    manager_review: { step: 4, label: '健管专员审核报告与病历', next: '生成后续随访计划并转健康顾问审核' },
    advisor_review: { step: 5, label: '健康顾问审核后续随访计划', next: '审核通过后服务自动结束' },
  }
  return stages[stage] || stages.booking
}

const medicationProxyProgress = task => {
  if (task?.workflowKey !== 'medical_proxy:supervise' || task?.formData?.medicationProxy !== true) return null
  const stage = task.formData?.currentStage || 'booking'
  const stages = {
    booking: { step: 1, label: '健管专员预约配药门诊', next: '预约完成后由健康规划师安排就医专员' },
    planner: { step: 2, label: '健康规划师安排配药执行人员', next: '确认后直接转给就医专员' },
    execute: { step: 3, label: '就医专员配药并上传交付资料', next: '资料齐全后完成服务' },
    resolution: { step: 4, label: '健管专员制定并落实异常解决方案', next: '确认替代渠道或退费结果后结束服务' },
    completed: { step: 4, label: '代配药服务已完成', next: '服务已闭环' },
  }
  return { ...(stages[stage] || stages.booking), total: 5, steps: ['预约', '人员分配', '配药执行', '异常解决', '完成'] }
}

const medicalEscortProgress = task => {
  if (task?.workflowKey !== 'medical_proxy:supervise' || task?.formData?.medicalEscort !== true) return null
  const stage = task.formData?.currentStage || 'planner'
  const stages = {
    planner: { step: 1, label: '健康规划师分配就医专员', next: '分配后进入陪同执行' },
    execute: { step: 2, label: '就医专员执行陪同服务', next: '完成陪同并上传报告、病历等资料' },
    post_visit_audit: { step: 3, label: '健管专员审核归档资料', next: '审核归档后结束服务' },
    completed: { step: 4, label: '就医陪同服务已完成', next: '服务已闭环' },
  }
  return { ...(stages[stage] || stages.planner), total: 4, steps: ['人员分配', '陪同执行', '资料审核', '完成'], automaticAssignment: task.formData?.assignmentMode === 'automatic' }
}

export default function ServiceTasksPanel() {
  const nav = useNavigate()
  const { staff } = useStaff()
  const [dispatchTask, setDispatchTask] = useState(null)
  const [items, setItems] = useState([])
  const [group, setGroup] = useState('all')
  const [timeGroup, setTimeGroup] = useState('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const refresh = () => staffAPI.getServiceTasks({ status: 'active', includeFuture: '1', limit: 100 })
      .then(r => setItems((r.data || []).filter(task => task.taskRole === 'supervisor' || task.serviceTracking?.status !== 'waiting')))
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

  if (!items.length && !dispatchTask) return null
  const serviceGroups = Object.values(items.reduce((result, task) => {
    const key = task.annualBookingTask || (task.sourceType === 'annual_service' && task.workflowKey === 'service_request') ? `request:${task._id}` : task.coordinationGroupId || `task:${task._id}`
    if (!result[key]) result[key] = { key, tasks: [] }
    result[key].tasks.push(task)
    return result
  }, {})).map(service => {
    const workflowModules = service.tasks[0]?.sourceHealthPlanId?.content?.workflowModules || []
    const sequenceByKey = new Map(workflowModules.map((item, sequence) => [String(item.id || item._id || ''), item.sequence ?? sequence]))
    service.tasks.sort((a, b) => (sequenceByKey.get(String(a.workflowKey || '')) ?? 999) - (sequenceByKey.get(String(b.workflowKey || '')) ?? 999))
    const supervisor = service.tasks.find(task => task.workflowKey === 'medical_proxy:supervise' && ['planned', 'in_progress', 'missed'].includes(task.status))
    // The API returns this staff member's tasks. A read-only supervisor card must
    // not hide their actionable assignment for the same service.
    const proxyAction = service.tasks.find(task => String(task.workflowKey || '').startsWith('medical_proxy:') && task.workflowKey !== 'medical_proxy:supervise' && !task.isBlocked && ['planned', 'in_progress', 'missed'].includes(task.status))
    return { ...service, task: proxyAction || supervisor || service.tasks[0], totalSteps: workflowModules.length || service.tasks.length }
  })
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const weekEnd = new Date(todayStart); weekEnd.setDate(weekEnd.getDate() + 8)
  const monthEnd = new Date(todayStart); monthEnd.setDate(monthEnd.getDate() + 31)
  const bucketOf = value => {
    const date = new Date(value)
    if (date < todayStart) return 'overdue'
    if (date < tomorrowStart) return 'today'
    if (date < weekEnd) return 'week'
    if (date < monthEnd) return 'month'
    return 'later'
  }
  const roleServices = group === 'all' ? serviceGroups : serviceGroups.filter(service => service.task.taskRole === group)
  const visibleServices = roleServices
    .filter(service => timeGroup === 'all' || bucketOf(service.task.date) === timeGroup)
    .sort((a, b) => new Date(a.task.date) - new Date(b.task.date))
  const pageCount = Math.max(1, Math.ceil(visibleServices.length / TASKS_PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const pagedServices = visibleServices.slice((currentPage - 1) * TASKS_PER_PAGE, currentPage * TASKS_PER_PAGE)
  const executorCount = serviceGroups.filter(service => service.task.taskRole !== 'supervisor').length
  const supervisorCount = serviceGroups.filter(service => service.task.taskRole === 'supervisor').length

  const openTask = async (task) => {
    if (annualDispatch.dedicated(task)) { setDispatchTask(task); return }
    if (task.sourceType === 'report_followup' && task.workflowKey === 'report_followup:advisor_review') {
      nav(`/patients/${task.patientId?._id}/annual-health#report-followup-drafts`)
      return
    }
    if (task.sourceType === 'professional_assessment' && task.workflowKey === 'professional_assessment:advisor_review') {
      nav(`/patients/${task.patientId?._id}/annual-health#professional-assessments`)
      return
    }
    if (task.sourceType === 'professional_assessment' && task.workflowKey === 'professional_assessment:professional_review') {
      nav(`/patients/${task.patientId?._id}?tab=referrals`)
      return
    }
    const sourcePlan = task.sourceHealthPlanId
    const sourcePlanId = sourcePlan?._id || sourcePlan
    if (task.workflowKey === 'system:outpatient_report_audit') {
      const reportId = task.formData?.reportIds?.[0]
      nav(`/patients/${task.patientId?._id}?tab=reports${reportId ? `&reportId=${reportId}` : ''}`)
      return
    }
    const checkupText = `${sourcePlan?.title || ''} ${sourcePlan?.content?.templateName || ''}`
    const isCheckupPlanningTask = task.taskRole !== 'supervisor'
      && isCheckupDesignStage(task)
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
          <button key={key} onClick={() => { setGroup(key); setPage(1) }} style={{ border: group === key ? '1px solid #1E6B50' : '1px solid #DDD7CD', background: group === key ? '#EAF5F0' : '#fff', color: group === key ? '#1E6B50' : '#5F6B65', borderRadius: 16, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>{label} {count}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '4px 20px 8px', flexWrap: 'wrap' }}>
        {[['all', '全部计划'], ['today', '今日'], ['week', '未来7天'], ['month', '未来30天'], ['later', '30天以后'], ['overdue', '已逾期']].map(([key, label]) => {
          const count = key === 'all' ? roleServices.length : roleServices.filter(service => bucketOf(service.task.date) === key).length
          return <button key={key} onClick={() => { setTimeGroup(key); setPage(1) }} style={{ border: timeGroup === key ? '1px solid #1E6B50' : '1px solid #DDD7CD', background: timeGroup === key ? '#EAF5F0' : '#fff', color: timeGroup === key ? '#1E6B50' : '#5F6B65', borderRadius: 16, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>{label} {count}</button>
        })}
      </div>
      <div className="card-body" style={{ padding: '8px 20px' }}>
        {pagedServices.map((service, index) => {
          const task = service.task
          const isFuture = task.date && new Date(task.date).getTime() > Date.now()
          const isWaitingPrevious = !!task.isBlocked
          const progress = task.taskRole === 'supervisor' ? null : checkupProgress(task) || medicationProxyProgress(task) || medicalEscortProgress(task)
          const isOutpatientEscortProgress = isWaitingPrevious && task.taskRole === 'supervisor' && /门诊一站式.*检查及专家门诊陪诊与归档/.test(task.theme || '')
          const isOutpatientReportAuditWait = isWaitingPrevious && task.taskRole === 'executor' && /门诊一站式.*查看陪诊资料并制定随访计划/.test(task.theme || '')
          return (
          <div key={task._id}
            onClick={() => openTask(task)}
            title={isOutpatientReportAuditWait ? '等待健管专员审核本次门诊病历和检验检查单' : isOutpatientEscortProgress ? '当前已进入陪诊及资料闭环阶段' : isWaitingPrevious ? '上一环节完成后即可办理' : ''}
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', cursor: isWaitingPrevious ? 'default' : 'pointer', opacity: isWaitingPrevious ? 0.78 : 1, borderBottom: index < pagedServices.length - 1 ? '1px solid #f0ede8' : 'none' }}>
            <span style={{ fontSize: 18 }}>{isWaitingPrevious ? '⏳' : task.taskRole === 'supervisor' ? '🔎' : '✅'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1A2B24' }}>
                {serviceTaskTitle(task)}
                {progress && <span style={{ marginLeft: 8, fontSize: 11, color: '#1E6B50', background: '#EAF5F0', padding: '2px 6px', borderRadius: 8 }}>进度 {progress.step}/{progress.total || 5}</span>}
                {service.totalSteps > 1 && <span style={{ marginLeft: 8, fontSize: 11, color: '#1E6B50', background: '#EAF5F0', padding: '2px 6px', borderRadius: 8 }}>当前环节 · 共{service.totalSteps}环节</span>}
                {isWaitingPrevious
                  ? <span style={{ marginLeft: 8, fontSize: 11, color: isOutpatientEscortProgress ? '#1E6B50' : '#667085', background: isOutpatientEscortProgress ? '#EAF5F0' : '#F2F4F7', padding: '2px 6px', borderRadius: 8 }}>{isOutpatientReportAuditWait ? '等待资料审核' : isOutpatientEscortProgress ? '陪诊及资料闭环进行中' : '等待上一环节'}</span>
                  : isFuture && <span style={{ marginLeft: 8, fontSize: 11, color: '#8A6A20', background: '#FFF4D6', padding: '2px 6px', borderRadius: 8 }}>待开始</span>}
              </div>
              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>
                {task.patientId?.name || '未知'}{isOutpatientReportAuditWait ? ' · 等待健管专员审核病历与检验检查单' : isWaitingPrevious && task.dependsOnTaskId?.assignedTo?.name ? ` · 当前执行：${task.dependsOnTaskId.assignedTo.name}` : task.assignedTo?.name ? ` · 负责人：${task.assignedTo.name}` : ''}
              </div>
              {task.taskRole === 'supervisor' && <div style={{ fontSize: 12, color: '#52685D', marginTop: 5 }}>
                <div>已生成执行任务：完成 {task.supervisionProgress?.completed ?? 0} / {task.supervisionProgress?.total ?? 0}（非服务完成率）</div>
                {(task.supervisionProgress?.current || []).map(row => <div key={row.id}>当前环节：<b>{row.label}</b> · 处理人：{row.assignee}{row.blocked ? ' · 等待解锁' : ''}</div>)}
                <div>{task.supervisionProgress?.message || '进度待核对，未推断服务已完成'}</div>
              </div>}
              {progress && <div style={{ fontSize: 12, color: '#52685D', marginTop: 3 }}>当前阶段：<b>{progress.label}</b>　下一步：{progress.next}</div>}
              {progress?.steps && <div style={{ marginTop: 7, maxWidth: 680 }}>
                <div style={{ height: 7, borderRadius: 99, background: '#E3ECE7', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, ((progress.step - 1) / Math.max(1, progress.total - 1)) * 100))}%`, height: '100%', borderRadius: 99, background: '#1E6B50', transition: 'width .2s ease' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${progress.steps.length}, minmax(0, 1fr))`, gap: 4, marginTop: 4 }}>
                  {progress.steps.map((label, stepIndex) => <span key={label} style={{ fontSize: 10, color: stepIndex + 1 <= progress.step ? '#1E6B50' : '#9AA9A2', textAlign: stepIndex === 0 ? 'left' : stepIndex === progress.steps.length - 1 ? 'right' : 'center', fontWeight: stepIndex + 1 === progress.step ? 700 : 400 }}>{label}</span>)}
                </div>
              </div>}
              <div style={{ fontSize: 11, color: '#9AA9A2', marginTop: 2 }}>创建：{new Date(task.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</div>
            </div>
            {!isWaitingPrevious && <span style={{ fontSize: 11, color: '#8AA89C' }}>计划执行：{formatChineseDate(task.date, false)}</span>}
          </div>
          )
        })}
      </div>
      {pageCount > 1 && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '4px 20px 14px', borderTop: '1px solid #F3EFE8' }}>
        <span style={{ fontSize: 12, color: '#667085' }}>第 {currentPage} / {pageCount} 页</span>
        <button type="button" aria-label="上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} style={{ border: '1px solid #DDD7CD', background: '#fff', color: '#1E6B50', borderRadius: 6, padding: '3px 9px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.45 : 1 }}>上一页</button>
        <button type="button" aria-label="下一页" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} style={{ border: '1px solid #DDD7CD', background: '#fff', color: '#1E6B50', borderRadius: 6, padding: '3px 9px', cursor: currentPage === pageCount ? 'not-allowed' : 'pointer', opacity: currentPage === pageCount ? 0.45 : 1 }}>下一页</button>
      </div>}
      {dispatchTask && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 780 }}>
        <div className="modal-header"><h3>{dispatchTask.careFlowId ? '就医协助 · 全流程办理' : annualDispatch.isExecution(dispatchTask) ? '就医协助 · 办理记录' : '就医协助 · 派单安排'}</h3><button className="modal-close" onClick={() => setDispatchTask(null)}>×</button></div>
        <div className="modal-body"><AnnualDispatchCard key={dispatchTask._id} task={dispatchTask} staff={staff} onLinked={updated => { setDispatchTask(updated); staffAPI.getServiceTasks({ status: 'active', includeFuture: '1', limit: 100 }).then(r => setItems(r.data || [])) }} /></div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setDispatchTask(null)}>关闭</button></div>
      </div></div>}
    </div>
  )
}
