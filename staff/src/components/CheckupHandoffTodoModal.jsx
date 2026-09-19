import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import CheckupPreparationReadiness from './CheckupPreparationReadiness'

export default function CheckupHandoffTodoModal({ todo, staff, onClose }) {
  const [task, setTask] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setTask(null); setError('')
    staffAPI.getCheckupPreparation(todo.taskId).then(result => { if (active) setTask(result.data.task) })
      .catch(err => { if (active) setError(err.message || '任务读取失败，请刷新后重试') })
    return () => { active = false }
  }, [todo.taskId])
  return <div role="dialog" aria-modal="true" aria-label="体检服务异常核对" style={{ position: 'fixed', inset: 0, background: '#0006', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ background: '#fff', padding: 20, width: 'min(680px, 95vw)', maxHeight: '85vh', overflow: 'auto', borderRadius: 12 }}>
      <button onClick={onClose} style={{ float: 'right' }}>关闭</button>
      <h3>体检服务异常核对 · {todo.patientName}</h3>
      <p>沿用原准备任务。请按提示核对原服务或岗位信息后再重试，不需重复录入方案。</p>
      {error && <p role="alert" style={{ color: '#DC3545' }}>{error}</p>}
      {!task && !error && <p>正在核对任务权限…</p>}
      {task && <CheckupPreparationReadiness task={task} staff={staff} />}
    </div>
  </div>
}
