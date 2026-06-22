import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

const TYPE_CONFIG = {
  report_review:   { icon: '📋', label: '体检报告待审核', color: '#0077B6', priority: 2 },
  trend_review:    { icon: '📈', label: 'AI趋势分析待审核', color: '#22A06B', priority: 3 },
  plan_review:     { icon: '📝', label: 'AI管理方案待审核', color: '#22A06B', priority: 3 },
  push_review:     { icon: '📣', label: '内容推送待审核', color: '#8e44ad', priority: 4 },
  followup_review: { icon: '📅', label: '随访建议待审核', color: '#D97706', priority: 4 },
  risk_alert:      { icon: '⚠️', label: '风险预警待处理', color: '#DC3545', priority: 1 },
  coach_review:    { icon: '💬', label: 'AI教练消息待审核', color: '#D97706', priority: 4 },
  transfer_human:  { icon: '🔔', label: 'AI对话转人工', color: '#DC3545', priority: 1 },
  draft_review:    { icon: '✏️', label: 'AI文案待审核', color: '#4A6558', priority: 4 },
}

function formatTime(date) {
  const d = new Date(date)
  const now = new Date()
  const diff = now - d
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}

export default function AiTodosPanel() {
  const nav = useNavigate()
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    staffAPI.getAiTodos()
      .then(r => setTodos(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || todos.length === 0) return null

  const overdueCount = todos.filter(t => t.overdue).length

  return (
    <div className="card" style={{ marginBottom: 20, border: overdueCount > 0 ? '1.5px solid #DC354540' : undefined }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="card-title">AI 待审核任务</div>
          <span style={{
            background: overdueCount > 0 ? '#DC3545' : '#1E6B50',
            color: '#fff', fontSize: 11, fontWeight: 700,
            borderRadius: 99, padding: '1px 8px', lineHeight: '18px',
          }}>{todos.length}</span>
          {overdueCount > 0 && (
            <span style={{ fontSize: 12, color: '#DC3545', fontWeight: 500 }}>
              {overdueCount} 项超24小时
            </span>
          )}
        </div>
      </div>
      <div className="card-body" style={{ padding: '4px 20px 12px' }}>
        {todos.map((todo, i) => {
          const cfg = TYPE_CONFIG[todo.type] || { icon: '📌', label: todo.type, color: '#8AA89C' }
          return (
            <div
              key={todo.id}
              onClick={() => nav(todo.link)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '10px 0',
                borderBottom: i < todos.length - 1 ? '1px solid #f0ede8' : 'none',
                cursor: 'pointer',
                background: todo.overdue ? '#FFF8F8' : 'transparent',
                margin: todo.overdue ? '0 -20px' : undefined,
                padding: todo.overdue ? '10px 20px' : '10px 0',
              }}
            >
              {/* 类型图标 */}
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: cfg.color + '15', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 16,
              }}>
                {cfg.icon}
              </div>

              {/* 内容 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                  {todo.overdue && (
                    <span style={{ fontSize: 11, color: '#DC3545', background: '#DC354515', padding: '1px 6px', borderRadius: 4 }}>
                      超时
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#1A2B24', marginBottom: 2 }}>
                  <span style={{ fontWeight: 500 }}>{todo.patientName}</span>
                  {todo.summary && (
                    <span style={{ color: '#8AA89C', marginLeft: 8 }}>{todo.summary}</span>
                  )}
                </div>
              </div>

              {/* 时间 + 箭头 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: '#8AA89C' }}>{formatTime(todo.createdAt)}</span>
                <span style={{ fontSize: 14, color: '#C0B8AE' }}>›</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
