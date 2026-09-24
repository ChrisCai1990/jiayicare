import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const roleName = role => role === 'nutritionist' ? '营养师' : role === 'healthPlanner' ? '健康规划师' : '健康顾问/医师'
const reviewName = review => review?.status === 'approved' ? '已通过' : review?.status === 'returned' ? '已退回' : '待审核'

export default function ContentReviewsPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [checklist, setChecklist] = useState({ professionalReviewCompleted: false, contentAndBoundaryChecked: false, contactAndLinksChecked: false, privacyChecked: false, scopeChecked: false })
  const requiresDoctor = item?.reviewChain?.includes('familyDoctor')
  const targetPath = item?.slug ? `/knowledge/guides/${item.slug}.html` : '/knowledge/'

  const load = async () => {
    setLoading(true)
    try {
      const r = await staffAPI.getContentReviews()
      const found = (r.data || []).find(x => x._id === id)
      setItem(found || null)
    } catch (e) { toast(e.message || '加载审核稿失败', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const submit = async action => {
    const note = action === 'return' ? window.prompt('请填写退回修改意见（仅填写内容审核意见）：') : window.prompt('审核备注（可留空）：', '')
    if (action === 'return' && !note?.trim()) return
    setSubmitting(true)
    try {
      if (action === 'publish' && !Object.values(checklist).every(Boolean)) { toast('请先完成发布前核对清单', 'error'); return }
      const r = await staffAPI.reviewContentReview(id, { action, note: note || '', checklist })
      toast(r.message || '审核已保存', 'success')
      nav('/home')
    } catch (e) { toast(e.message || '审核保存失败', 'error') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="page-container">加载审核稿…</div>
  if (!item) return <div className="page-container"><button onClick={() => nav('/home')}>返回工作台</button><p style={{ marginTop: 16 }}>该审核稿已不在您的待处理列表，可能已完成或已转交下一环节。</p></div>
  return <div className="page-container" style={{ maxWidth: 920 }}>
    <button onClick={() => nav('/home')} style={{ border: 'none', background: 'none', color: '#1E6B50', cursor: 'pointer', padding: 0 }}>← 返回工作台</button>
    <div className="card" style={{ marginTop: 16, padding: 24 }}>
      <div style={{ fontSize: 13, color: '#7C3AED', fontWeight: 600 }}>官网 GEO 内容审核 · 当前环节：{roleName(item.currentRole)}</div>
      <h2 style={{ margin: '8px 0' }}>{item.title}</h2>
      <p style={{ color: '#66756E' }}>{item.summary}</p>
      <div style={{ display: 'flex', gap: 18, margin: '16px 0', fontSize: 13, color: '#52615A' }}>
        <span>营养审核：{reviewName(item.nutritionReview)}</span>
        <span>健康顾问审核：{requiresDoctor ? reviewName(item.doctorReview) : '无需审核（服务说明/非医疗健康教育稿）'}</span>
        <span>来源更新：{item.sourceUpdatedAt || '-'}</span>
      </div>
      <div style={{ background: '#F8FAF9', border: '1px solid #E3E9E6', borderRadius: 10, padding: 18, whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#22352C' }}>{item.sourceContent}</div>
      <p style={{ fontSize: 12, color: '#8A968F', marginTop: 14 }}>{item.currentRole === 'healthPlanner' ? '核对无误后直接发布到官网；如不适合发布，请退回上一专业审核环节修改。' : '审核通过后将转入下一环节；专业审核全部通过后，由健康规划师核对并直接发布。'}</p>
      {item.currentRole === 'healthPlanner' && <div style={{ border: '1px solid #DCE7E1', borderRadius: 10, padding: 16, marginTop: 14 }}>
        <b style={{ fontSize: 14 }}>发布前核对清单（须全部确认）</b>
        <div style={{ marginTop: 10, padding: 12, background: '#F8FAF9', borderRadius: 8, fontSize: 12, lineHeight: 1.7, color: '#52615A' }}>
          <div><b>审核链路：</b>{requiresDoctor ? '营养师 → 健康顾问 → 健康规划师' : '营养师 → 健康规划师（本稿无需健康顾问审核）'}</div>
          <div><b>发布范围：</b>官网 GEO 知识中心，面向公开访客</div>
          <div><b>目标页面：</b>{targetPath}</div>
          <div><b>固定联系方式：</b>客服电话 19106761448；官网 https://jiaycare.com</div>
        </div>
        {[
          ['professionalReviewCompleted', requiresDoctor ? '营养师与健康顾问专业审核均已完成' : '营养师审核已完成（本稿无需健康顾问审核）'],
          ['contentAndBoundaryChecked', '标题、摘要、正文与健康教育服务边界已核对（核对上方正文首尾的服务边界说明）'],
          ['contactAndLinksChecked', '客服电话、官网链接与跳转内容已核对（核对本清单上方的固定联系方式）'],
          ['privacyChecked', '不含个人隐私、病历或未经授权的医疗信息'],
          ['scopeChecked', '已确认本次公开范围与目标页面（核对本清单上方的发布范围和目标页面）'],
        ].map(([key, label]) => <label key={key} style={{ display: 'block', marginTop: 10, fontSize: 13, color: '#34453C', cursor: 'pointer' }}><input type="checkbox" checked={checklist[key]} onChange={e => setChecklist(x => ({ ...x, [key]: e.target.checked }))} style={{ marginRight: 8 }} />{label}</label>)}
      </div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        {item.currentRole === 'healthPlanner' ? <><button disabled={submitting} onClick={() => submit('publish')} className="btn btn-primary">确认并发布官网</button><button disabled={submitting} onClick={() => submit('return')} className="btn btn-outline">退回修改</button></> : <><button disabled={submitting} onClick={() => submit('approve')} className="btn btn-primary">审核通过</button><button disabled={submitting} onClick={() => submit('return')} className="btn btn-outline">退回修改</button></>}
      </div>
    </div>
  </div>
}
