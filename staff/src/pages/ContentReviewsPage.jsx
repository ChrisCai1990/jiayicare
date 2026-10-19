import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const roleName = role => role === 'nutritionist' ? '营养师' : '健康顾问/医师'
const reviewName = review => review?.status === 'approved' ? '已通过' : review?.status === 'returned' ? '已退回' : '待审核'

export default function ContentReviewsPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  // 内容规则以受控稿件模板为准；旧任务记录中的历史链路不能让体检资料整理稿被误归到营养审核。
  const reviewChain = item?.slug === 'checkup-report-organization' ? ['familyDoctor'] : (item?.reviewChain || [])
  const requiresNutrition = reviewChain.includes('nutritionist')
  const requiresDoctor = reviewChain.includes('familyDoctor')
  const finalReviewer = item && reviewChain[reviewChain.length - 1] === item.currentRole

  const load = async () => {
    setLoading(true)
    try {
      const r = await staffAPI.getContentReviews()
      let found = (r.data || []).find(x => x._id === id)
      if (!found) {
        const history = await staffAPI.getContentReviews({ history: '1' })
        found = (history.data || []).find(x => x._id === id)
      }
      setItem(found || null)
    } catch (e) { toast(e.message || '加载审核稿失败', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const submit = async action => {
    if (item?.status !== 'pending') return
    const note = action === 'return' ? window.prompt('请填写退回修改意见（仅填写内容审核意见）：') : window.prompt('审核备注（可留空）：', '')
    if (action === 'return' && !note?.trim()) return
    if (note === null) return
    setSubmitting(true)
    try {
      const r = await staffAPI.reviewContentReview(id, { action, note: note || '' })
      toast(r.message || '审核已保存', 'success')
      nav('/home')
    } catch (e) {
      const message = e.message || '审核保存失败'
      toast(message, 'error')
      if (finalReviewer && action === 'approve') window.alert(`审核或发布未完成：${message}`)
    }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="page-container">加载审核稿…</div>
  if (!item) return <div className="page-container"><button onClick={() => nav('/home')}>返回工作台</button><p style={{ marginTop: 16 }}>该审核稿已不在您的待处理列表，可能已完成或已转交下一环节。</p></div>
  return <div className="page-container" style={{ maxWidth: 920 }}>
    <button onClick={() => nav('/home')} style={{ border: 'none', background: 'none', color: '#1E6B50', cursor: 'pointer', padding: 0 }}>← 返回工作台</button>
    <div className="card" style={{ marginTop: 16, padding: 24 }}>
      <div style={{ fontSize: 13, color: '#7C3AED', fontWeight: 600 }}>官网 GEO 内容审核 · {item.status === 'changes_requested' ? '已退回，等待编辑修订；修订后重新送审' : item.status === 'pending' ? `当前环节：${roleName(item.currentRole)}` : '历史记录（只读）'}</div>
      <h2 style={{ margin: '8px 0' }}>{item.title}</h2>
      <p style={{ color: '#66756E' }}>{item.summary}</p>
      <div style={{ display: 'flex', gap: 18, margin: '16px 0', fontSize: 13, color: '#52615A' }}>
        <span>营养审核：{requiresNutrition ? reviewName(item.nutritionReview) : '无需审核（体检资料整理稿）'}</span>
        <span>健康顾问审核：{requiresDoctor ? reviewName(item.doctorReview) : '无需审核（服务说明/非医疗健康教育稿）'}</span>
        <span>来源更新：{item.sourceUpdatedAt || '-'}</span>
      </div>
      <div style={{ background: '#F8FAF9', border: '1px solid #E3E9E6', borderRadius: 10, padding: 18, whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#22352C' }}>{item.sourceContent}</div>
      {!!item.revisions?.length && <section style={{ marginTop: 18 }}><h3>本次修订与历史版本</h3>{[...item.revisions].reverse().map((revision, index) => <details key={index} open={index === 0} style={{ marginTop: 12 }}>
        <summary>{new Date(revision.at).toLocaleString()} · {revision.changeSummary}</summary>
        <p>退回意见：{revision.returnNote}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>修改前：{revision.before?.sourceContent}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>修改后：{revision.after?.sourceContent}</p>
      </details>)}</section>}
      <details style={{ marginTop: 18 }}><summary>审核流转记录</summary>{(item.auditLog || []).map((entry, index) => <p key={index}>{new Date(entry.at).toLocaleString()} · {entry.byName || ''} · {({ return: '退回修改', resubmit: '修订后重新送审', approve: '审核通过', publish: '发布' })[entry.action] || entry.action}：{entry.note || '无备注'}</p>)}</details>
      {item.status === 'pending' && <><p style={{ fontSize: 12, color: '#8A968F', marginTop: 14 }}>{finalReviewer ? '核对正文及公开范围后，审核通过将直接发布到官网知识中心。' : '审核通过后转给下一位专业审核人。'}</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button disabled={submitting} onClick={() => submit('approve')} className="btn btn-primary">{finalReviewer ? '审核通过并发布官网' : '审核通过'}</button><button disabled={submitting} onClick={() => submit('return')} className="btn btn-outline">退回修改</button>
      </div></>}
    </div>
  </div>
}
