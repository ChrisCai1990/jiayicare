import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

export default function MedicalAssistProgressPanel() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let active = true
    const refresh = () => staffAPI.getMedicalAssistProgress()
      .then(response => { if (active) setItems(response.data || []) })
      .catch(() => { if (active) setItems([]) })
      .finally(() => { if (active) setLoading(false) })
    refresh()
    const refreshIfVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refreshIfVisible)
    const timer = window.setInterval(refreshIfVisible, 30000)
    return () => { active = false; window.removeEventListener('focus', refreshIfVisible); window.clearInterval(timer) }
  }, [])

  return <div className="card" style={{ marginBottom: 20, border: '1.5px solid #2563EB35' }}>
    <div className="card-header"><div className="card-title">就医协助进程 <span style={{ fontSize: 12, color: '#667085' }}>只读 · {items.length} 项进行中</span></div></div>
    <div className="card-body" style={{ padding: '8px 20px' }}>
      {loading ? <div style={{ padding: '12px 0', color: '#667085' }}>加载中...</div> : !items.length ? <div style={{ padding: '12px 0', color: '#667085' }}>暂无进行中的就医协助</div> : items.map((item, index) =>
        <div key={item.id} style={{ padding: '12px 0', borderBottom: index < items.length - 1 ? '1px solid #f0ede8' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div><strong>{item.patientName || '未知客户'} · {item.title}</strong>{item.startedBySelf && <span style={{ marginLeft: 8, fontSize: 11, color: '#2563EB' }}>由我发起</span>}</div>
            <button type="button" className="btn btn-secondary btn-sm" aria-expanded={expandedId === item.id} onClick={() => setExpandedId(current => current === item.id ? null : item.id)}>{expandedId === item.id ? '收起进程' : '查看完整进程'}</button>
          </div>
          <div style={{ fontSize: 12, color: '#52685D', marginTop: 5 }}>总督办：{item.supervisorName} · 当前环节：{item.stage}{item.assignee ? ` · 处理人：${item.assignee}` : ''}</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 3 }}>{item.waitingReason}{item.total ? ` · 已生成任务完成 ${item.completed}/${item.total}` : ''}</div>
          {expandedId === item.id && <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: '#F7FAF8' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>本次服务全流程</div>
            {item.source === 'plan' && <div style={{ fontSize: 12, marginBottom: 8, color: '#52685D' }}>方案建立：{item.stage === '方案待完善与推送' ? '待完善与推送' : '已进入岗位执行'}</div>}
            {(item.stages || []).length ? <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 8 }}>
              {item.stages.map(stage => <li key={stage.id} style={{ fontSize: 13, color: '#1A2B24' }}>
                <strong>{stage.label}</strong> · {({ planned: '待执行', in_progress: '进行中', missed: '已逾期', completed: '已完成', cancelled: '已取消' })[stage.status] || stage.status || '待确认'}
                {stage.blocked && ' · 等待前置环节'}{stage.assignee && ` · 处理人：${stage.assignee}`}{stage.taskRole === 'supervisor' && ' · 总督办'}
              </li>)}
            </ol> : <div style={{ fontSize: 12, color: '#667085' }}>尚未生成岗位任务</div>}
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => nav(`/patients/${item.patientId}?tab=plans&serviceView=medical`)}>查看客户就医服务档案</button>
          </div>}
        </div>) }
    </div>
  </div>
}
