import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function CheckupPreparationReadiness({ task }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setState(null); setError('')
    staffAPI.getCheckupPreparationReadiness(task._id).then(res => { if (active) setState(res.data) })
      .catch(err => { if (active) setError(err.message || '汇合状态读取失败') })
    return () => { active = false }
  }, [task._id, task.updatedAt])
  return <div style={{ margin: '12px 0', padding: 10, background: '#fff', border: '1px solid #B2D8C7', borderRadius: 6 }}>
    <b>双岗位准备进度</b>
    {error && <p role="alert" style={{ color: '#DC3545' }}>{error}</p>}
    {!state && !error && <p>正在核对当前方案、资源和服务期…</p>}
    {state && <>
      {state.readyForServiceLink
        ? <p>顾问方案、客户确认及规划师资源凭据已齐备，等待衔接现有体检服务。</p>
        : <ul>{state.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.role === 'healthPlanner' ? '健康规划师' : '健康顾问'}：{issue.message}</li>)}</ul>}
      <small>当前仅核对准备条件；不会自动下单、预约或启动旧服务。服务承接尚未启用。</small>
    </>}
  </div>
}
