import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ExpertQualificationsEditor from '../../components/ExpertQualificationsEditor'
export default function ExpertSupplementPage() {
  const { token } = useParams()
  const [message, setMessage] = useState('')
  const [review, setReview] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const base = import.meta.env.VITE_API_URL || '/api'
  const endpoint = `${base}/expert-recruitment/supplement/${encodeURIComponent(token)}`
  async function request(suffix = '') {
    const response = await fetch(`${endpoint}${suffix}`, { cache: 'no-store', referrerPolicy: 'no-referrer' })
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || '读取失败，请重试')
    return response
  }
  async function refresh() {
    setError('')
    try { setReview((await (await request()).json()).data) } catch (e) { setError(e.message) }
  }
  useEffect(() => { refresh() }, [token])
  async function download(file) {
    setBusy(true); setError('')
    try {
      const response = await request(`/signed-agreements/${file._id}`)
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url; link.download = file.name || '已签合作协议'; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <main style={{ padding: '28px 12px', background: '#F5F8F6', minHeight: '100vh' }}><div style={{ maxWidth: 760, margin: 'auto', padding: 24, background: 'white', borderRadius: 14 }}>
    <h1>专家资料与审核结果</h1>
    <p>可分次补充学历、服务语言和资质证书。资料仅用于合作评估和资质核验，不公开展示证件。</p>
    <p>请保存此个人链接，30天内可再次进入并查看审核结果和已归档协议。仅供本人使用，请勿转发到群内；失效后可联系专科合伙人重新获取。</p>
    <button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setMessage('个人补充链接已复制') } catch { setMessage('请复制浏览器地址栏中的个人链接') } }}>复制个人补充链接</button>
    <p role="status">{message}</p>
    <section style={{ borderTop: '1px solid #DCE7E1', paddingTop: 18, marginTop: 18 }}>
      <h2>审核结果与合作协议</h2>
      <button type="button" onClick={refresh} disabled={busy}>刷新审核结果</button>
      {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
      {!review ? <p>正在读取审核结果…</p> : <>
        <p role="status">{review.status === 'approved' ? '资料已审核入库' : '资料已提交，等待审核'}</p>
        {review.status === 'approved' && (review.signedAgreements?.length
          ? [...review.signedAgreements].reverse().map((file, index) => <div key={file._id} style={{ borderTop: '1px solid #E5EDE9', padding: '10px 0' }}>
            <strong>已签协议 {review.signedAgreements.length - index}</strong> · 签署日期 {file.signedDate || '—'}
            <div style={{ overflowWrap: 'anywhere' }}>{file.name}</div>
            <button type="button" disabled={busy} onClick={() => download(file)}>下载查看</button>
          </div>)
          : <p>已审核，合作协议尚未归档。归档后刷新本页面即可查看。</p>)}
      </>}
    </section>
    <ExpertQualificationsEditor token={token}/>
  </div></main>
}
