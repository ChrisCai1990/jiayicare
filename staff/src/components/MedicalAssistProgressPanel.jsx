import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

export default function MedicalAssistProgressPanel() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

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
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => nav(`/patients/${item.patientId}?tab=${item.source === 'plan' ? 'plans' : 'followups'}`)}>查看详情</button>
          </div>
          <div style={{ fontSize: 12, color: '#52685D', marginTop: 5 }}>总督办：{item.supervisorName} · 当前环节：{item.stage}{item.assignee ? ` · 处理人：${item.assignee}` : ''}</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 3 }}>{item.waitingReason}{item.total ? ` · 已生成任务完成 ${item.completed}/${item.total}` : ''}</div>
        </div>) }
    </div>
  </div>
}
