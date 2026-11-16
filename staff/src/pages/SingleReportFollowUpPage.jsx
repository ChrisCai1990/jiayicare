import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStaff } from '../App'
import { staffAPI } from '../api'
import { useAiWorkbench } from '../components/AiWorkbenchProvider'
import ReportFollowUpDrafts from '../components/ReportFollowUpDrafts'

export default function SingleReportFollowUpPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const { staff } = useStaff()
  const { setData: setTodos } = useAiWorkbench()
  const [nextTodo, setNextTodo] = useState(null)
  const [completionMessage, setCompletionMessage] = useState('')
  const canEdit = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const year = Number(searchParams.get('year')) || new Date().getFullYear()
  const reviewDraftId = searchParams.get('reviewDraftId')

  useEffect(() => { setNextTodo(null); setCompletionMessage('') }, [id, reviewDraftId])

  const findNextTodo = async completedDraftId => {
    setNextTodo(null)
    setCompletionMessage('正在查找这位客户的下一项待办…')
    try {
      const { data = [] } = await staffAPI.getAiTodos()
      setTodos(data)
      const currentLink = `/patients/${id}/report-followup?reviewDraftId=${completedDraftId}`
      if (data.some(todo => todo.patientId === id && todo.link === currentLink)) {
        setCompletionMessage('本次随访仍有待完成的发布步骤，请按页面提示处理。')
        return
      }
      const remaining = data.filter(todo => todo.patientId === id && todo.link && todo.link !== currentLink)
      setNextTodo(remaining[0] || null)
      setCompletionMessage(remaining.length ? `本次审核已完成，这位客户还有 ${remaining.length} 项待办。` : '本次审核已完成，这位客户目前没有其他待办。')
    } catch {
      setCompletionMessage('本次审核已完成，暂时无法读取下一项待办。请返回工作台刷新。')
    }
  }

  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
    <button type="button" className="btn btn-secondary" onClick={() => nav('/home')} style={{ marginBottom: 18 }}>返回工作台</button>
    <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>单次随访方案</h1>
    <p style={{ color: '#61746a', margin: '0 0 24px' }}>核对本次就医或检查资料，确认本次随访安排。</p>
    {completionMessage && <div role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '12px 16px', marginBottom: 18, borderRadius: 8, background: '#EAF5F0', color: '#1E6B50' }}>
      <span>{completionMessage}</span>
      {nextTodo && <button type="button" className="btn btn-primary" onClick={() => nav(nextTodo.link, { state: { sourceTodo: nextTodo } })}>处理下一项：{nextTodo.label}</button>}
    </div>}
    <ReportFollowUpDrafts key={`${id}:${reviewDraftId || ''}`} patientId={id} year={year} canEdit={canEdit} singleOnly onCompleted={findNextTodo} />
  </main>
}
