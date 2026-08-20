import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'

export default function SymptomTodosPanel() {
  const nav = useNavigate()
  const { staff } = useStaff()
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    staffAPI.getAiTodos()
      .then(r => setTodos((r.data || []).filter(t => ['symptom_verify', 'symptom_review'].includes(t.type))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!['healthManager', 'familyDoctor', 'superadmin'].includes(staff?.role) || loading) return null

  const resolve = async (e, todo) => {
    e.stopPropagation()
    const decisionNote = window.prompt('请填写健康顾问处理意见：', '')
    if (decisionNote === null) return
    try {
      await staffAPI.resolveSymptom(todo.id.replace(/^symptom_/, ''), { status: 'resolved', decisionNote })
      setTodos(items => items.filter(item => item.id !== todo.id))
    } catch (err) { window.alert(err.message || '处理失败') }
  }

  return (
    <div className="card" style={{ marginBottom: 20, border: todos.length ? '1.5px solid #DC354550' : undefined }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🩺 {staff?.role === 'healthManager' ? '不适主诉待核实' : '不适主诉待处理'}</span>
          {todos.length > 0 && <span style={{ fontSize: 12, color: '#fff', background: '#DC3545', borderRadius: 99, padding: '2px 8px' }}>{todos.length}</span>}
        </div>
      </div>
      <div className="card-body" style={{ padding: '4px 20px 12px' }}>
        {todos.length === 0 ? (
          <div style={{ color: '#8AA89C', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>暂无待处理不适主诉</div>
        ) : todos.map((todo, index) => (
          <div key={todo.id} onClick={() => nav(todo.link)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', cursor: 'pointer', borderBottom: index < todos.length - 1 ? '1px solid #F0EDE8' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#DC354515', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🩺</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A2B24' }}>{todo.patientName}</div>
              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>{todo.summary || '客户不适主诉待处理'}</div>
            </div>
            {todo.type === 'symptom_review' && <button className="btn btn-primary btn-sm" onClick={e => resolve(e, todo)}>处理</button>}
            {todo.type === 'symptom_verify' && <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); nav(todo.link) }}>立即核实</button>}
            <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); nav(todo.link) }}>查看档案</button>
          </div>
        ))}
      </div>
    </div>
  )
}
