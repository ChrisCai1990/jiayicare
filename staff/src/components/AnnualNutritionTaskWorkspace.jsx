import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import AssignedNutritionAssessmentForm from './AssignedNutritionAssessmentForm'

export default function AnnualNutritionTaskWorkspace({ patientId, tasks = [], selectedTaskId = '', onSaved }) {
  const [taskId, setTaskId] = useState(selectedTaskId)
  const [task, setTask] = useState(null)
  const [error, setError] = useState('')
  const annualTasks = tasks.filter(row => row.workflowKey === 'annual_nutrition_assessment'
    && row.sourceAnnualPlanId && row.status !== 'cancelled')

  useEffect(() => { if (selectedTaskId) setTaskId(selectedTaskId) }, [selectedTaskId])
  useEffect(() => {
    if (!taskId) { setTask(null); return }
    let active = true
    setError('')
    staffAPI.getAnnualNutritionAssessment(taskId)
      .then(result => { if (active) setTask(result.data) })
      .catch(err => { if (active) setError(err.message || '年度营养评估任务加载失败') })
    return () => { active = false }
  }, [taskId])

  if (!annualTasks.length && !taskId) return null
  return <section style={{ padding: '14px 20px', borderTop: '1px solid #EDF2EE' }}>
    <h3 style={{ marginTop: 0 }}>年度服务营养评估</h3>
    {!taskId && annualTasks.map(row => <button key={row._id} type="button" className="btn btn-secondary btn-sm" style={{ marginRight: 8 }} onClick={() => setTaskId(row._id)}>
      {row.theme || '年度营养评估'} · {row.status === 'completed' ? '查看结果' : '开始评估'}
    </button>)}
    {taskId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setTaskId(''); setTask(null) }}>返回任务列表</button>}
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {taskId && !task && !error && <p role="status">正在读取年度营养评估任务…</p>}
    {task?.status === 'completed' && <p>评估结论：{task.formData?.assignedNutritionAssessment?.summary || task.executedContent || '已完成'}</p>}
    {task && ['planned', 'in_progress', 'missed'].includes(task.status) && <AssignedNutritionAssessmentForm
      key={`${task._id}:${task.updatedAt}`} patientId={patientId} task={task} kind="annual"
      onSaved={updated => { setTask(updated); onSaved?.(updated) }} />}
  </section>
}
