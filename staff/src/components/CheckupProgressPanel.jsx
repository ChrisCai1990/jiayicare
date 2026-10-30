import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, staffAPI } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'
import Pagination from './Pagination'

const PAGE_SIZE = 5
const STATUS = {
  pending: { label: '未完成', color: '#D97706', background: '#FEF3E2' },
  in_progress: { label: '核对中', color: '#0077B6', background: '#E7F4FB' },
  completed: { label: '已完成', color: '#1E6B50', background: '#E8F5ED' },
}

export function CheckupProgressList({ rows = [], loading = false, error = '', onRetry, onOpen, taskMode = false }) {
  const [filter, setFilter] = useState('pending')
  const [page, setPage] = useState(1)
  const pending = rows.filter(row => row.pendingCount > 0 && (!taskMode || row.workStage !== 'waiting_exam'))
  const waiting = taskMode ? rows.filter(row => row.pendingCount > 0 && row.workStage === 'waiting_exam') : []
  const completed = rows.filter(row => row.totalItems > 0 && row.pendingCount === 0)
  const booking = pending.filter(row => row.workStage === 'booking')
  const review = pending.filter(row => row.workStage === 'review')
  const unknown = pending.filter(row => !['booking', 'review'].includes(row.workStage))
  const filtered = filter === 'pending' ? pending : filter === 'booking' ? booking : filter === 'waiting' ? waiting : filter === 'review' ? review : filter === 'unknown' ? unknown : filter === 'completed' ? completed : rows
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const patients = new Set(filtered.map(row => String(row.patientId))).size
  if (!loading && !error && rows.length === 0) return null

  return <section className="card" style={{ marginBottom: 20 }} aria-label={taskMode ? '体检方案核对任务' : '体检方案进度'}>
    <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div className="card-title">{taskMode ? '体检方案核对任务' : '体检方案进度'}（{patients}位客户 · {filtered.length}份方案）</div>
      <div role="group" aria-label="体检方案状态筛选" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(taskMode ? [['pending', '待处理', pending.length], ['booking', '预约体检', booking.length], ['waiting', '已预约·待体检', waiting.length], ['review', '体检后核对', review.length], ['unknown', '阶段待确认', unknown.length], ['completed', '核对已处理', completed.length], ['all', '全部', rows.length]]
          : [['pending', '待完成', pending.length], ['completed', '已完成', completed.length], ['all', '全部', rows.length]]).map(([key, label, count]) =>
          <button key={key} type="button" className={filter === key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            aria-pressed={filter === key} onClick={() => { setFilter(key); setPage(1) }}>{label} {count}</button>)}
      </div>
    </div>
    <div className="card-body" style={{ padding: '8px 20px' }}>
      {loading && <div role="status" style={{ padding: '12px 0' }}>正在加载体检方案…</div>}
      {error && <div role="alert" style={{ color: '#B42318', padding: '12px 0' }}>
        体检方案进度加载失败{rows.length ? '，显示上次结果' : ''}：{error} <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>重试</button>
      </div>}
      {!loading && !error && filtered.length === 0 && <div style={{ padding: '16px 0', color: '#667085', textAlign: 'center' }}>
        {filter === 'completed' ? '暂无全部项目已完成的方案' : filter === 'booking' ? '暂无待预约体检的方案' : filter === 'waiting' ? '暂无已预约、待体检的方案' : filter === 'review' ? '暂无待体检后核对的方案' : filter === 'unknown' ? '暂无阶段待确认的方案' : taskMode ? '暂无待处理的体检方案' : '暂无待完成的体检方案'}
      </div>}
      {visible.map(row => {
        const status = STATUS[row.progressStatus] || STATUS.pending
        return <button type="button" key={String(row.planId)} onClick={() => onOpen(row)}
          aria-label={`查看${row.patientName}的${row.planTitle}`}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid #f0ede8', padding: '12px 0', cursor: 'pointer', font: 'inherit' }}>
          <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, minWidth: 0 }}>
            <strong style={{ color: '#1A2B24', fontSize: 14 }}>{row.patientName}</strong>
            <span style={{ color: '#8AA89C', fontSize: 12 }}>{row.patientPhone}</span>
            <span style={{ color: '#667085', fontSize: 12, overflowWrap: 'anywhere' }}>{row.planTitle}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
            {taskMode && row.pendingCount > 0 && <span style={{ color: row.workStage === 'review' ? '#0077B6' : row.workStage === 'unknown' ? '#667085' : '#8A6A20', background: row.workStage === 'review' ? '#E7F4FB' : row.workStage === 'unknown' ? '#F2F4F7' : '#FFF4D6', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>{row.workStage === 'review' ? '体检后核对' : row.workStage === 'waiting_exam' ? '已预约·待体检' : row.workStage === 'booking' ? '预约体检' : '阶段待确认'}</span>}
            <span style={{ color: status.color, background: status.background, padding: '2px 8px', borderRadius: 99 }}>{status.label}</span>
            <span style={{ color: '#52685D' }}>项目核对 {row.completedCount}/{row.totalItems} 项{row.pendingCount > 0 ? ` · 待核对 ${row.pendingCount} 项` : ''}</span>
            {row.missingReportCount > 0 && <span style={{ color: '#B45309' }}>{row.missingReportCount} 项虽标记完成，但未关联报告</span>}
            {row.unapprovedReportCount > 0 && <span style={{ color: '#B45309' }}>{row.unapprovedReportCount} 项关联报告未通过当前审核</span>}
            {row.skippedCount > 0 && <span style={{ color: '#92610F' }}>其中 {row.skippedCount} 项已跳过，仍需核对</span>}
            {taskMode && <strong style={{ color: '#1E6B50' }}>{row.pendingCount === 0 ? '查看核对记录 →' : row.workStage === 'unknown' ? '核实当前阶段 →' : ['booking', 'waiting_exam'].includes(row.workStage) ? '查看体检安排 →' : '进入逐项核对 →'}</strong>}
          </span>
        </button>
      })}
      {filtered.length > PAGE_SIZE && <nav aria-label="体检方案分页" style={{ paddingBottom: 8 }}>
        <Pagination compact page={currentPage} totalPages={pageCount} onChange={setPage} />
      </nav>}
    </div>
  </section>
}

export default function CheckupProgressPanel({ taskMode = false, patientId = '' }) {
  const nav = useNavigate()
  const resource = useWorkbenchResource(async () => {
    const response = await staffAPI.getCheckupProgress({ includeCompleted: '1' })
    return response.data || []
  }, getToken(), [])
  const rows = patientId ? resource.data.filter(row => String(row.patientId) === String(patientId)) : resource.data
  return <CheckupProgressList rows={rows} loading={resource.loading} error={resource.error} taskMode={taskMode}
    onRetry={resource.refresh} onOpen={row => taskMode && ['booking', 'waiting_exam', 'unknown'].includes(row.workStage) && row.pendingCount > 0
      ? nav(`/patients/${row.patientId}?tab=plans&serviceView=checkup`)
      : nav(`/plans/${row.planId}`)} />
}
