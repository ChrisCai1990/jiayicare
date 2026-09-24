import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const FIELDS = [
  ['healthProgress', '目标与健康变化'],
  ['serviceExecution', '本月服务执行及未完成原因'],
  ['customerFeedback', '客户反馈、问题及处理'],
  ['teamCollaboration', '团队协作情况'],
  ['unresolvedIssues', '遗留问题、风险与待核实事项'],
]
const emptySections = Object.fromEntries(FIELDS.map(([key]) => [key, '']))
const toId = value => String(value?._id || value || '')
const monthIndex = month => { const [year, number] = String(month || '').split('-').map(Number); return year * 12 + number - 1 }
const monthText = index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`

export default function MonthlyServiceReviewPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()
  const { staff } = useStaff()
  const [data, setData] = useState(null)
  const [pilotEnabled, setPilotEnabled] = useState(true)
  const canOrganize = ['healthPlanner', 'superadmin'].includes(staff?.role) && data?.canOrganize !== false
  const [staffList, setStaffList] = useState([])
  const [planId, setPlanId] = useState(() => searchParams.get('planId') || '')
  const [month, setMonth] = useState(() => searchParams.get('month') || '')
  const [sections, setSections] = useState(emptySections)
  const [actions, setActions] = useState([])
  const [contribution, setContribution] = useState('')
  const [contributionSection, setContributionSection] = useState('teamCollaboration')
  const [correction, setCorrection] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const reload = async () => {
    const result = await staffAPI.getMonthlyServiceReviews(id)
    setPilotEnabled(result.enabled !== false)
    setData(result.data)
    return result.data
  }
  useEffect(() => {
    reload().catch(e => setError(e.message || '加载失败'))
    staffAPI.getStaffList().then(r => setStaffList(r.data || [])).catch(() => {})
  }, [id])
  useEffect(() => {
    if (!data?.plans?.length) return
    if (!data.plans.some(plan => toId(plan._id) === planId)) setPlanId(toId(data.plans[0]._id))
  }, [data, planId])
  const plan = data?.plans?.find(item => toId(item._id) === planId)
  const months = useMemo(() => {
    if (!plan?.confirmedAt) return []
    const start = monthIndex(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date(plan.confirmedAt)))
    const end = Math.min(start + 11, monthIndex(data?.currentMonth))
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => monthText(end - i))
  }, [plan?.confirmedAt, data?.currentMonth])
  useEffect(() => {
    if (!months.length) return setMonth('')
    if (!months.includes(month)) setMonth(months[0])
  }, [months.join(','), month])
  const review = data?.reviews?.find(item => item.month === month)
  const savedActions = (review?.actions || []).map(item => ({ ...item, assigneeId: toId(item.assigneeId), dueAt: item.dueAt?.slice(0, 10) || '' }))
  const unsaved = !!review && (JSON.stringify(sections) !== JSON.stringify({ ...emptySections, ...(review.sections || {}) }) || JSON.stringify(actions) !== JSON.stringify(savedActions))
  useEffect(() => {
    setSections({ ...emptySections, ...(review?.sections || {}) })
    setActions((review?.actions || []).map(item => ({ ...item, assigneeId: toId(item.assigneeId), dueAt: item.dueAt?.slice(0, 10) || '' })))
    setContribution(''); setCorrection(''); setError(''); setMessage('')
  }, [review?._id, review?.__v, month, planId])

  const run = async (fn, success) => {
    setBusy(true); setError(''); setMessage('')
    try { await fn(); await reload(); setMessage(success) }
    catch (e) { setError(e.message || '操作失败') }
    finally { setBusy(false) }
  }
  const save = () => run(() => staffAPI.saveMonthlyServiceReview(review._id, { revision: review.__v, sections, actions }), '草稿已保存')
  const addAction = () => setActions(items => [...items, { title: '', assigneeId: '', dueAt: '', status: 'pending' }])
  const setAction = (index, patch) => setActions(items => items.map((item, i) => i === index ? { ...item, ...patch } : item))

  return <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 80px' }}>
    <button className="btn btn-secondary btn-sm" onClick={() => nav(`/patients/${id}/annual-health`)}>← 年度健康管理</button>
    <h2 style={{ margin: '18px 0 5px' }}>月度服务复盘</h2>
    <p style={{ color: '#65776F', marginTop: 0 }}>团队内部记录，不等同于阶段性健康评估；未经确认的内容不会展示给客户。</p>
    {error && <div style={{ padding: 12, background: '#FFF0F0', color: '#A12E2E', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
    {message && <div style={{ padding: 12, background: '#EAF6F0', color: '#1E6B50', borderRadius: 8, marginBottom: 12 }}>{message}</div>}
    {!data ? <div>加载中...</div> : !pilotEnabled ? <div className="card" style={{ padding: 20 }}>该客户暂未进入月度复盘试点。</div> : !data.plans?.length ? <div className="card" style={{ padding: 20 }}>该客户尚无已确认的年度持续管理方案，暂不生成月度复盘。</div> : <>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {data.plans.length > 1 ? <label style={{ flex: 2, minWidth: 220 }}>服务年度
            <select className="form-input" value={planId} onChange={e => { setPlanId(e.target.value); setMonth('') }}>
              {data.plans.map(item => <option key={item._id} value={item._id}>{item.year} 年度</option>)}
            </select>
          </label> : <div style={{ flex: 2, minWidth: 220, alignSelf: 'end', fontWeight: 600 }}>{plan?.year} 年度持续管理</div>}
          <label style={{ flex: 1, minWidth: 150 }}>服务月份
            <select className="form-input" value={month} onChange={e => setMonth(e.target.value)}>
              {months.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </div>
      {!review ? <div className="card" style={{ padding: 24 }}>
        <p>该月尚未建立复盘。建立时只汇总已有服务记录的数量，团队再核实具体情况。</p>
        {canOrganize && month && <button className="btn btn-primary" disabled={busy} onClick={() => run(() => staffAPI.createMonthlyServiceReview(id, { annualPlanId: planId, month }), '已建立月度复盘草稿')}>建立 {month} 复盘</button>}
      </div> : <>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h3 style={{ margin: 0 }}>{month} · {review.status === 'confirmed' ? '已确认' : '团队整理中'}</h3><small>更新于 {new Date(review.updatedAt).toLocaleString('zh-CN')}</small></div>
          <p style={{ color: '#52685D', marginBottom: 0 }}>系统记录：本月随访/任务 {review.facts?.followUps ?? 0} 项，已完成 {review.facts?.completed ?? 0} 项，服务记录 {review.facts?.serviceRecords ?? 0} 条。</p>
          <small style={{ color: '#8AA89C' }}>{review.facts?.note}</small>
        </div>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          {FIELDS.map(([key, label]) => <label key={key} style={{ display: 'block', marginBottom: 18, fontWeight: 600 }}>{label}
            <textarea className="form-input" rows={3} style={{ width: '100%', marginTop: 7, fontWeight: 400 }} value={sections[key] || ''} disabled={!canOrganize || review.status === 'confirmed'} onChange={e => setSections(value => ({ ...value, [key]: e.target.value }))} placeholder={key === 'unresolvedIssues' ? '如无遗留问题，请明确写“本月无遗留问题”' : '记录已核实的事实，尚未核实的内容请注明'} />
          </label>)}
          <h3>下月行动清单</h3>
          {(actions || []).map((action, index) => <div key={action._id || index} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            <input className="form-input" style={{ flex: 2, minWidth: 180 }} placeholder="具体行动" value={action.title} disabled={!canOrganize || review.status === 'confirmed'} onChange={e => setAction(index, { title: e.target.value })} />
            <select className="form-input" style={{ flex: 1, minWidth: 150 }} value={action.assigneeId} disabled={!canOrganize || review.status === 'confirmed'} onChange={e => setAction(index, { assigneeId: e.target.value })}><option value="">选择责任人</option>{staffList.filter(item => item.staffStatus !== 'inactive').map(item => <option key={item._id} value={item._id}>{item.name} · {item.role}</option>)}</select>
            <input className="form-input" type="date" value={action.dueAt} disabled={!canOrganize || review.status === 'confirmed'} onChange={e => setAction(index, { dueAt: e.target.value })} />
            {review.status === 'draft' && canOrganize && <button className="btn btn-secondary btn-sm" onClick={() => setActions(items => items.filter((_, i) => i !== index))}>移除</button>}
            {review.status === 'confirmed' && <span>{action.status === 'completed' ? '✓ 已完成' : <button className="btn btn-secondary btn-sm" disabled={busy || (staff?.role !== 'superadmin' && toId(action.assigneeId) !== toId(staff?._id))} onClick={() => run(() => staffAPI.completeMonthlyReviewAction(review._id, action._id), '行动项已完成')}>标记完成</button>}</span>}
          </div>)}
          {review.status === 'draft' && canOrganize && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-secondary" onClick={addAction}>+ 新增行动</button><button className="btn btn-secondary" disabled={busy} onClick={save}>保存草稿</button><button className="btn btn-primary" disabled={busy} onClick={() => { if (unsaved) return setError('请先保存草稿，再确认复盘'); if (window.confirm('确认后内容不可覆盖，只能追加更正。继续吗？')) run(() => staffAPI.confirmMonthlyServiceReview(review._id, { revision: review.__v }), '月度复盘已确认') }}>确认复盘</button></div>}
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>团队补充与更正</h3>
          {(review.contributions || []).map((item, index) => <div key={index} style={{ borderBottom: '1px solid #E0E8E3', padding: '8px 0' }}><b>{item.by?.name || '团队成员'}</b> · {FIELDS.find(([key]) => key === item.section)?.[1] || item.section} · {new Date(item.at).toLocaleString('zh-CN')}<div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div></div>)}
          {(review.corrections || []).map((item, index) => <div key={index} style={{ borderBottom: '1px solid #E0E8E3', padding: '8px 0' }}><b>更正 · {item.by?.name || '团队成员'}</b> · {new Date(item.at).toLocaleString('zh-CN')}<div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div></div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {review.status === 'draft' && <select className="form-input" style={{ width: 210 }} value={contributionSection} onChange={e => setContributionSection(e.target.value)}>{FIELDS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
            <textarea className="form-input" style={{ flex: 1 }} rows={2} value={review.status === 'draft' ? contribution : correction} onChange={e => review.status === 'draft' ? setContribution(e.target.value) : setCorrection(e.target.value)} placeholder={review.status === 'draft' ? '补充已核实情况' : '追加更正说明（保留原确认版本）'} />
            <button className="btn btn-secondary" disabled={busy} onClick={() => run(() => review.status === 'draft' ? staffAPI.addMonthlyReviewContribution(review._id, { section: contributionSection, content: contribution }) : staffAPI.addMonthlyReviewCorrection(review._id, { content: correction }), '记录已追加')}>追加</button>
          </div>
        </div>
      </>}
    </>}
  </div>
}
