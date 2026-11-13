import React, { useState } from 'react'
import { getToken } from '../api'

const base = import.meta.env.VITE_API_URL || '/api'
const formatDate = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'

export default function ExpertSignedAgreements({ recruitment, onUpdated }) {
  const [file, setFile] = useState(null)
  const [signedDate, setSignedDate] = useState('')
  const [agreementNo, setAgreementNo] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const files = recruitment.signedAgreements || []
  const canGenerateWord = recruitment.agreement?.profileKind === 'professional' && /心理/.test(`${recruitment.agreement?.specialty || ''} ${recruitment.response?.profession || ''}`)
  const path = `/expert-recruitment/admin/${recruitment._id}`

  async function request(suffix, options = {}) {
    const response = await fetch(`${base}${path}${suffix}`, {
      ...options, headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store', referrerPolicy: 'no-referrer',
    })
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || '操作失败')
    return response
  }
  async function download(suffix, filename) {
    setBusy(true); setError('')
    try {
      const response = await request(suffix)
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function archive(e) {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      if (!file || file.size > 10 * 1024 * 1024) throw new Error('请选择单个不超过10MB的完整扫描件')
      const body = new FormData()
      body.append('file', file); body.append('signedDate', signedDate)
      body.append('agreementNo', agreementNo); body.append('confirmed', String(confirmed))
      await request('/signed-agreements', { method: 'POST', body })
      setFile(null); setSignedDate(''); setAgreementNo(''); setConfirmed(false)
      e.target.reset()
      await onUpdated?.()
      setMessage('已签协议已归档，请核对下方记录')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section style={{ borderTop: '1px solid #DCE7E1', marginTop: 20, paddingTop: 18 }}>
    <h4>合作协议</h4>
    <p>下载 Word 草稿核对，双方打印手签后，将完整扫描件归档。归档记录不代替对签名、盖章和全部页的人工核验。</p>
    {canGenerateWord && <button type="button" className="btn" disabled={busy} onClick={() => download('/psychologist-agreement.docx', `心理咨询师合作协议-${recruitment.response?.name || '专家'}.docx`)}>生成并下载 Word 协议</button>}
    {files.length === 0 ? <p>尚未归档已签协议。</p> : <div style={{ marginTop: 14 }}>
      {[...files].reverse().map((item, index) => <div key={item._id} style={{ borderTop: '1px solid #E5EDE9', padding: '10px 0' }}>
        <strong>归档版本 {files.length - index}</strong> · 签署日期 {item.signedDate || '—'} · 归档于 {formatDate(item.archivedAt)}
        <div style={{ overflowWrap: 'anywhere' }}>{item.name}{item.agreementNo ? ` · 编号 ${item.agreementNo}` : ''}</div>
        <button type="button" className="btn" disabled={busy} onClick={() => download(`/signed-agreements/${item._id}`, item.name || '已签合作协议')}>下载已签文件</button>
      </div>)}
    </div>}
    <form onSubmit={archive} style={{ marginTop: 16, display: 'grid', gap: 10, maxWidth: 600 }}>
      <strong>归档新的已签协议</strong>
      <label>签署日期 *<input className="form-input" type="date" required max={new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)} value={signedDate} onChange={e => setSignedDate(e.target.value)} disabled={busy}/></label>
      <label>协议编号（选填）<input className="form-input" maxLength={100} value={agreementNo} onChange={e => setAgreementNo(e.target.value)} disabled={busy}/></label>
      <label>双方手签或盖章的完整扫描件 *<input type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setFile(e.target.files?.[0] || null)} disabled={busy}/></label>
      <label><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy}/> 我已核对双方签字或盖章及协议全部页</label>
      <button type="submit" className="btn btn-primary" disabled={busy || !file || !signedDate || !confirmed}>归档已签协议</button>
    </form>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {message && <p role="status" style={{ color: '#246B4D' }}>{message}</p>}
  </section>
}
