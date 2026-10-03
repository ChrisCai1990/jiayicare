import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

export default function AnnualReviewCommunicationPanel({ patientId, year, staff, toast, onOpenReview }) {
  const nav = useNavigate()
  const [review, setReview] = useState(null)
  const [specialtyReviews, setSpecialtyReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('no_change')
  const [note, setNote] = useState('')
  const canConfirm = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const newerSpecialtyConclusion = specialtyReviews.some(item => item.conclusion?.status === 'confirmed' && review?.conclusion?.confirmedAt && new Date(item.conclusion.confirmedAt) > new Date(review.conclusion.confirmedAt))

  const load = async () => {
    setLoading(true)
    try {
      const result = await staffAPI.getAiCaseReviews(patientId)
      const current = (result.data || []).find(item => Number(item.annualPlanYear) === Number(year) && item.reviewType === 'annual') || null
      setReview(current)
      setSpecialtyReviews((result.data || []).filter(item => item.issueKey && item.reviewType === 'specialty'))
    } catch (error) { toast(error.message || '读取年度研判失败', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId, year])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [patientId, year])

  const openReview = async () => {
    if (review) return onOpenReview(review._id)
    setBusy(true)
    try {
      const created = await staffAPI.prepareAnnualComprehensiveReview(patientId, year)
      if (!created.data.reused) {
        try { await staffAPI.sendAiCaseReviewMessage(patientId, created.data._id, { autoStart: true, requestId: `auto_${created.data._id}` }) }
        catch (error) { toast(`研判已建立，自动分析待处理：${error.message}`, 'error') }
      }
      onOpenReview(created.data._id)
    } catch (error) { toast(error.message || '建立年度研判失败', 'error') }
    finally { setBusy(false) }
  }

  const confirm = async () => {
    if (!review?.conclusion?.confirmedAt) return
    if (status === 'adjusted' && !note.trim()) return toast('请记录与客户沟通后的调整内容', 'error')
    setBusy(true)
    try {
      const result = await staffAPI.confirmAiCaseReviewCustomerDiscussion(patientId, review._id, {
        status, note: note.trim(), confirmedAt: new Date(review.conclusion.confirmedAt).toISOString(),
      })
      setReview(result.data)
      nav(`/patients/${patientId}/annual-health?year=${year}`)
    } catch (error) { toast(error.message || '保存沟通结果失败', 'error') }
    finally { setBusy(false) }
  }

  return <section style={{ margin: '0 16px 14px', padding: 14, border: '1px solid #D9E9E1', borderRadius: 10, background: '#F8FCFA' }}>
    <div style={{ fontWeight: 700, color: '#1E6B50', marginBottom: 6 }}>客户沟通前的研判核对 · {year}年度</div>
    {loading ? <div style={{ fontSize: 13 }}>正在读取研判…</div> : <>
      <div style={{ marginTop: 10, padding: 12, background: '#fff', border: '1px solid #D9E9E1', borderRadius: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>① 单个专病问题 · {specialtyReviews.length}</div>
        {!specialtyReviews.length && <div style={{ fontSize: 13, color: '#65776F' }}>尚未纳入单个问题。可从下方具体筛查结果，将肺结节等问题纳入专病研判。</div>}
        {specialtyReviews.map(item => <div key={item._id} style={{ padding: '9px 0', borderTop: '1px solid #EDF1EE', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><strong>{item.title}</strong><span style={{ color: item.conclusion?.status === 'confirmed' ? '#16845B' : '#A16620' }}>{item.conclusion?.status === 'confirmed' ? '已确认单项结论' : item.messages?.length ? '分析中，待确认' : '尚未分析'}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReview(item._id)}>打开单项研判</button></div>
          <div style={{ color: '#65776F', marginTop: 3 }}>来源：{(item.sourceLinks || []).map(row => row.source?.checkDate || row.source?.year || row.title).filter(Boolean).join('、') || '待核对'}</div>
          {item.conclusion?.status === 'confirmed' && <details style={{ marginTop: 5 }}><summary>查看已确认的单项判断与目标</summary><div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{item.conclusion.content || '暂无结论正文'}</div></details>}
        </div>)}
      </div>
      <div style={{ marginTop: 10, padding: 12, background: '#fff', border: '1px solid #D9E9E1', borderRadius: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>② 年度综合判断</div>
        {!review ? <div style={{ fontSize: 13 }}>综合重大疾病筛查维度与单项问题，确定管理优先级和目标。<button className="btn btn-primary btn-sm" style={{ marginLeft: 10 }} disabled={!canConfirm || busy} onClick={openReview}>建立年度综合研判</button></div>
      : <>
        <div style={{ fontSize: 13 }}>内部综合判断：{review.conclusion?.status === 'confirmed' ? '健康顾问已确认' : '待确认'} <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={openReview}>打开年度综合研判</button></div>
        {review.conclusion?.status === 'confirmed' ? <>
          <div style={{ fontSize: 13, marginTop: 10 }}>已确认的管理目标与干预重点：</div>
          {(review.conclusion.managementTargets || []).length ? (review.conclusion.managementTargets || []).map((row, index) => <div key={index} style={{ fontSize: 13, marginTop: 5 }}>{index + 1}. {row.goal}；干预重点：{row.focus}</div>) : <div style={{ fontSize: 13, color: '#A16620' }}>尚无逐条目标，请先核对研判结论。</div>}
          <details style={{ marginTop: 8, fontSize: 13 }}><summary>查看研判分析及待审核方案</summary><div style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{review.conclusion.content}</div></details>
          {review.customerDiscussion?.status && review.customerDiscussion.status !== 'pending' && <div style={{ marginTop: 10, fontSize: 12, color: '#1E6B50' }}>最近沟通：{review.customerDiscussion.status === 'no_change' ? '无调整' : '已调整并确认'} · {review.customerDiscussion.confirmedByName || '健康顾问'}{review.customerDiscussion.note ? ` · ${review.customerDiscussion.note}` : ''}</div>}
          {canConfirm && <div style={{ borderTop: '1px solid #D9E9E1', marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>③ 与客户沟通后的结论</div>
            {newerSpecialtyConclusion && <div style={{ color: '#A16620', fontSize: 12, marginTop: 6 }}>单项专病结论有更新，请先重新核对并确认年度综合研判，再记录客户沟通。</div>}
            {specialtyReviews.some(item => item.conclusion?.status !== 'confirmed') && <div style={{ color: '#A16620', fontSize: 12, marginTop: 6 }}>仍有单项问题未形成确认结论。沟通时请说明哪些判断或专科意见仍待核实。</div>}
            <label style={{ marginRight: 14, fontSize: 13 }}><input type="radio" checked={status === 'no_change'} onChange={() => setStatus('no_change')} /> 无调整</label>
            <label style={{ fontSize: 13 }}><input type="radio" checked={status === 'adjusted'} onChange={() => setStatus('adjusted')} /> 已在研判中调整并确认</label>
            {status === 'adjusted' && <div style={{ fontSize: 12, marginTop: 7, color: '#65776F' }}>如需修改目标，请先打开研判修改并重新确认，再回到这里记录沟通结果。</div>}
            <textarea className="form-input" rows={2} maxLength={1000} style={{ marginTop: 8 }} value={note} onChange={event => setNote(event.target.value)} placeholder={status === 'adjusted' ? '记录调整内容及客户意见（必填）' : '客户沟通摘要（选填）'} />
            <button className="btn btn-primary btn-sm" disabled={busy || newerSpecialtyConclusion} onClick={confirm}>{busy ? '保存中…' : '确认沟通并进入年度方案'}</button>
          </div>}
        </> : <div style={{ marginTop: 8, fontSize: 13, color: '#A16620' }}>研判尚未确认，请先完成内部讨论和目标确认，再与客户分析报告。</div>}
      </>}
      </div>
    </>}
  </section>
}
