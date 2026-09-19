import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function CheckupPreparationReadiness({ task }) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [services, setServices] = useState([])
  const [link, setLink] = useState(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const planner = task.formData?.annualCheckupPreparation?.role === 'healthPlanner'
  useEffect(() => {
    let active = true
    setState(null); setError(''); setServices([]); setLink(null); setSelected('')
    const fetchState = planner ? staffAPI.getCheckupPreparationServices : staffAPI.getCheckupPreparationReadiness
    fetchState(task._id).then(res => {
      if (!active) return
      setState(planner ? res.data.readiness : res.data)
      if (planner) { setServices(res.data.services || []); setLink(res.data.link) }
    })
      .catch(err => { if (active) setError(err.message || '汇合状态读取失败') })
    return () => { active = false }
  }, [task._id, task.updatedAt, planner])
  return <div style={{ margin: '12px 0', padding: 10, background: '#fff', border: '1px solid #B2D8C7', borderRadius: 6 }}>
    <b>双岗位准备进度</b>
    {error && <p role="alert" style={{ color: '#DC3545' }}>{error}</p>}
    {!state && !error && <p>正在核对当前方案、资源和服务期…</p>}
    {state && <>
      {state.readyForServiceLink
        ? <p>顾问方案、客户确认及规划师资源凭据已齐备，等待衔接现有体检服务。</p>
        : <ul>{state.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.role === 'healthPlanner' ? '健康规划师' : '健康顾问'}：{issue.message}</li>)}</ul>}
      {link && <p>已关联：{link.serviceTitle || '本次体检服务'}。关联已保存，等待安全启用预约衔接；尚未启动预约。</p>}
      {planner && state.readyForServiceLink && !link && <div>
        {services.length ? <>
          <select className="form-input" disabled={busy} value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">选择已按原流程建立的本次体检服务</option>
            {services.map(service => <option key={service._id} value={service._id}>{service.title} · {service.date}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" disabled={busy || !selected} onClick={async () => {
            setBusy(true); setError('')
            try {
              const service = services.find(row => row._id === selected)
              const res = await staffAPI.linkCheckupPreparationService(task._id, { servicePlanId: selected, updatedAt: service.updatedAt })
              setLink(res.data)
            } catch (err) { setError(err.message || '关联失败，请重新打开核对') } finally { setBusy(false) }
          }}>关联本次服务（不下单、不预约）</button>
        </> : <p>暂无符合条件的服务。请先按原服务流程安排，并核对客户、日期、订单及执行状态；系统不会代为下单。</p>}
      </div>}
      <small>关联不代表预约或履约完成。实际预约解锁尚未启用，不会回退使用最近的旧服务。</small>
    </>}
  </div>
}
