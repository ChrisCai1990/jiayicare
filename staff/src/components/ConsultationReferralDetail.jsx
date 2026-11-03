import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import HealthInfo from './ConsultationHealthInfo'
export default function ConsultationReferralDetail({ caseId, isExpert, onViewed }) {
  const [snapshot, setSnapshot] = useState(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function show() {
    setBusy(true); setError('')
    try { const result = await staffAPI.expertConsultationReferralDetail(caseId); setSnapshot(result.data); setOpen(true) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  useEffect(() => {
    if (!snapshot || !open || !isExpert) return
    let cancelled = false
    staffAPI.expertConsultationAction(caseId, 'referral-viewed', { referralId: snapshot._id, contentVersion: snapshot.contentVersion })
      .then(() => { if (!cancelled) onViewed?.() })
      .catch(e => { if (!cancelled) setError(`查看状态未记录：${e.message}，请点击重新加载。`) })
    return () => { cancelled = true }
  }, [snapshot, open, isExpert, caseId])
  return <section style={{ margin: '12px 0' }}>
    <button className="btn btn-secondary" disabled={busy} onClick={show}>{busy ? '加载中…' : open ? '重新加载转介信' : '打开转介信详情'}</button>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {open && snapshot && <div style={{ padding: 14, border: '1px solid #DDE8E1', borderRadius: 8, marginTop: 8 }}>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>收起</button>
      <p><b>转介原因：</b>{snapshot.reason}</p><p><b>需要解决的问题：</b>{snapshot.questionList || '未填写'}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{snapshot.content}</p>
      {(snapshot.linkedDiseaseSnapshots?.length ? snapshot.linkedDiseaseSnapshots : snapshot.linkedDiseaseSnapshot ? [snapshot.linkedDiseaseSnapshot] : []).map((disease, i) => <div key={i}><b>专病档案：{disease.name}</b><HealthInfo info={{ diseaseSummary: disease.summary, diseaseCourse: disease.recentCourseEntries }} /></div>)}
      <HealthInfo info={snapshot.attachedHealthInfo} />
      {!!snapshot.sourceReports?.length && <div><b>附带报告</b>{snapshot.sourceReports.map((r, i) => <p key={i}>{r.title || r.name || '报告'} · {r.checkDate || ''}</p>)}</div>}
    </div>}
  </section>
}
