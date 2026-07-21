import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const TYPE_CONFIG = {
  report_parse:    { icon: '📄', label: '体检报告待解析', color: '#D97706', priority: 2 },
  report_review:   { icon: '📋', label: '体检报告待审核', color: '#0077B6', priority: 2 },
  report_familydoctor_review: { icon: '🩺', label: '体检报告待医生审核', color: '#7C3AED', priority: 2 },
  archive_review:  { icon: '🗂️', label: '健康档案问卷待审核', color: '#0077B6', priority: 3 },
  summary_review:  { icon: '🩺', label: 'AI健康分析待审核', color: '#22A06B', priority: 2 },
  lifestyle_review:{ icon: '🌿', label: '生活方式评估待审核', color: '#16A34A', priority: 3 },
  trend_review:    { icon: '📈', label: 'AI趋势分析待审核', color: '#22A06B', priority: 3 },
  plan_review:     { icon: '📝', label: 'AI管理方案待审核', color: '#22A06B', priority: 3 },
  push_review:     { icon: '📣', label: '内容推送待审核', color: '#8e44ad', priority: 4 },
  medication_review:  { icon: '💊', label: '药物待审核', color: '#0077B6', priority: 2 },
  supplement_review:  { icon: '🧪', label: '营养素待审核', color: '#16A34A', priority: 3 },
  risk_review:        { icon: '⚠️', label: '风险预警待处理', color: '#DC3545', priority: 1 },
  bp_alert_review:    { icon: '🩸', label: '血压监测异常', color: '#DC3545', priority: 1 },
  risk_alert:      { icon: '⚠️', label: '风险预警待处理', color: '#DC3545', priority: 1 },
  transfer_human:       { icon: '🔔', label: 'AI对话转人工', color: '#DC3545', priority: 1 },
  draft_review:         { icon: '✏️', label: 'AI文案待审核', color: '#4A6558', priority: 4 },
  nutrition_plan_review:{ icon: '🥗', label: 'AI营养方案待审核', color: '#16A34A', priority: 3 },
  checkup_plan_review:  { icon: '🏥', label: 'AI体检方案待审核', color: '#0077B6', priority: 3 },
  followup_review:      { icon: '📅', label: '随访计划待审核', color: '#0077B6', priority: 3 },
  service_draft_review: { icon: '🤖', label: 'AI随访草稿待审核', color: '#7C3AED', priority: 3 },
  medical_assist_plan_review: { icon: '🚑', label: 'AI就医协助方案待审核', color: '#0077B6', priority: 2 },
  supply_plan_review:  { icon: '📦', label: '定期配药/配营养素待安排', color: '#D97706', priority: 3 },
}

function formatTime(date) {
  const d = new Date(date)
  const now = new Date()
  const diff = now - d
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}

const PAGE_SIZE = 5

export default function AiTodosPanel() {
  const nav = useNavigate()
  const { staff } = useStaff()
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  useEffect(() => {
    staffAPI.getAiTodos()
      .then(r => setTodos(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const resolveAlert = (e, todo) => {
    e.stopPropagation()
    const recordId = todo.id.replace(/^bp_alert_/, '')
    staffAPI.resolveHealthRecordAlert(recordId)
      .then(() => setTodos(ts => ts.filter(t => t.id !== todo.id)))
      .catch(() => {})
  }

  const resolveTransfer = (e, todo) => {
    e.stopPropagation()
    const logId = todo.id.replace(/^transferhuman_/, '')
    staffAPI.resolveChatTransfer(logId)
      .then(() => setTodos(ts => ts.filter(t => t.id !== todo.id)))
      .catch(() => {})
  }

  const resolveSupplyPlan = (e, todo) => {
    e.stopPropagation()
    const planId = todo.id.replace(/^supply_plan_/, '')
    staffAPI.confirmSupplyPlan(planId)
      .then(() => setTodos(ts => ts.filter(t => t.id !== todo.id)))
      .catch(() => {})
  }

  if (loading) return null

  const overdueCount = todos.filter(t => t.overdue).length
  const pageCount = Math.max(1, Math.ceil(todos.length / PAGE_SIZE))
  const curPage = Math.min(page, pageCount - 1)
  const pageTodos = todos.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="card" style={{ marginBottom: 20, border: overdueCount > 0 ? '1.5px solid #DC354540' : undefined }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="card-title">AI 待审核任务</div>
          {staff?.roleLabel && staff?.role !== 'superadmin' && (
            <span style={{ fontSize: 12, color: '#8AA89C' }}>· {staff.roleLabel}（仅显示本人可审核项）</span>
          )}
          {todos.length > 0 && (
            <span style={{
              background: overdueCount > 0 ? '#DC3545' : '#1E6B50',
              color: '#fff', fontSize: 11, fontWeight: 700,
              borderRadius: 99, padding: '1px 8px', lineHeight: '18px',
            }}>{todos.length}</span>
          )}
          {overdueCount > 0 && (
            <span style={{ fontSize: 12, color: '#DC3545', fontWeight: 500 }}>
              {overdueCount} 项超24小时
            </span>
          )}
        </div>
      </div>
      <div className="card-body" style={{ padding: '4px 20px 12px' }}>
        {todos.length === 0 && (
          <div style={{ color: '#8AA89C', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            暂无待审核任务
          </div>
        )}
        {pageTodos.map((todo, i) => {
          const cfg = TYPE_CONFIG[todo.type] || { icon: '📌', label: todo.type, color: '#8AA89C' }
          return (
            <div
              key={todo.id}
              onClick={() => nav(todo.link)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                borderBottom: i < pageTodos.length - 1 ? '1px solid #f0ede8' : 'none',
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

              {/* 时间 + 箭头 / 操作 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: '#8AA89C' }}>{formatTime(todo.createdAt)}</span>
                {todo.type === 'bp_alert_review' ? (
                  <button
                    onClick={(e) => resolveAlert(e, todo)}
                    style={{ fontSize: 11, color: '#1E6B50', background: 'none', border: '1px solid #1E6B50', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
                  >标记已处理</button>
                ) : todo.type === 'transfer_human' ? (
                  <button
                    onClick={(e) => resolveTransfer(e, todo)}
                    style={{ fontSize: 11, color: '#1E6B50', background: 'none', border: '1px solid #1E6B50', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
                  >标记已联系</button>
                ) : todo.type === 'supply_plan_review' ? (
                  <button
                    onClick={(e) => resolveSupplyPlan(e, todo)}
                    style={{ fontSize: 11, color: '#1E6B50', background: 'none', border: '1px solid #1E6B50', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
                  >标记已安排</button>
                ) : (
                  <span style={{ fontSize: 14, color: '#C0B8AE' }}>›</span>
                )}
              </div>
            </div>
          )
        })}
        {todos.length > PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 10 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={curPage === 0}
              style={{ border: 'none', background: 'none', color: curPage === 0 ? '#C0B8AE' : '#1E6B50', cursor: curPage === 0 ? 'default' : 'pointer', fontSize: 13 }}
            >‹ 上一页</button>
            <span style={{ fontSize: 12, color: '#8AA89C' }}>{curPage + 1} / {pageCount}</span>
            <button
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={curPage === pageCount - 1}
              style={{ border: 'none', background: 'none', color: curPage === pageCount - 1 ? '#C0B8AE' : '#1E6B50', cursor: curPage === pageCount - 1 ? 'default' : 'pointer', fontSize: 13 }}
            >下一页 ›</button>
          </div>
        )}
      </div>
    </div>
  )
}
