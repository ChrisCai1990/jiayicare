import React, { useEffect, useState } from 'react'
import { getToken } from '../api'
import ExpertLanguageFields from './ExpertLanguageFields'
import qualifications from '../../../shared/expertQualifications.cjs'
import certificateQueue from '../../../shared/expertCertificateQueue.cjs'
const base = import.meta.env.VITE_API_URL || '/api'
const style = { width: '100%', boxSizing: 'border-box', padding: 10, marginBottom: 10, fontSize: 16 }
export default function ExpertQualificationsEditor({ token, recruitmentId, onUpdated }) {
  const isAdmin = Boolean(recruitmentId)
  const endpoint = isAdmin ? `/admin/${recruitmentId}` : `/supplement/${encodeURIComponent(token)}`
  const [data, setData] = useState(null)
  const [education, setEducation] = useState('')
  const [languages, setLanguages] = useState([])
  const [category, setCategory] = useState('qualification')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [notes, setNotes] = useState({})
  async function request(path = '', options = {}) {
    const headers = isAdmin ? { Authorization: `Bearer ${getToken()}` } : {}
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${base}/expert-recruitment${endpoint}${path}`, { ...options, headers, cache: 'no-store', referrerPolicy: 'no-referrer' })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || '操作失败，请重试')
    return res
  }
  async function load(reset = false) {
    const result = await (await request(isAdmin ? '/qualifications' : '')).json()
    setData(result.data)
    if (reset) { setEducation(result.data.education); setLanguages(result.data.languages || []) }
  }
  useEffect(() => { load(true).catch(e => setError(e.message)) }, [endpoint])
  async function run(work, success) {
    setBusy(true); setError(''); setMessage('')
    try { await work(); await load(); await onUpdated?.(); setMessage(success) } catch (e) { setError(e.message); await load().catch(() => {}) } finally { setBusy(false) }
  }
  async function download(file) {
    await run(async () => {
      const res = await request(`/certificates/${file._id}`)
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }, '附件已下载')
  }
  return <section style={{ borderTop: '1px solid #DCE7E1', paddingTop: 18, marginTop: 18 }}>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {message && <p role="status" style={{ color: '#246B4D' }}>{message}</p>}
    {!data ? <p>正在读取补充资料…</p> : <>
      <h3>最高学历与服务语言</h3>
      <label>最高学历<select style={style} aria-label="补充最高学历" disabled={busy} value={education} onChange={e => setEducation(e.target.value)}>
        <option value="">未填写</option>{['博士研究生', '硕士研究生', '本科', '大专', '中专及以下', '其他'].map(x => <option key={x}>{x}</option>)}
      </select></label>
      <ExpertLanguageFields value={languages} onChange={setLanguages} disabled={busy}/>
      <button type="button" className="btn btn-primary" disabled={busy} style={{ marginTop: 14 }} onClick={() => run(() => request(isAdmin ? '/qualifications' : '', { method: 'PATCH', body: JSON.stringify({ education, languages }) }), '学历与服务语言已保存')}>保存学历与语言</button>
      <h3>资质附件</h3>
      <p>支持 JPG、PNG、WebP 图片和 PDF，单个不超过10MB，最多20份。仅本人及授权审核人员可查看，上传后等待核验。</p>
      <label>证书类别<select style={style} value={category} disabled={busy} onChange={e => setCategory(e.target.value)}>{Object.entries(qualifications.certificateTypes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <p>先选证书类别，再添加文件。可分多次选择，文件会累加；已上传的证件也会保留。</p>
      <input type="file" aria-label="添加证书附件" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={busy} onChange={e => {
        const files = Array.from(e.target.files || [])
        setSelectedFiles(current => certificateQueue.appendCertificateFiles(current, files, category))
        e.target.value = ''
      }} style={style}/>
      {selectedFiles.length > 0 && <div><h4>待上传（{selectedFiles.length}份）</h4>{selectedFiles.map((item, index) => <div key={index} style={{ padding: '8px 0', overflowWrap: 'anywhere' }}>
        {qualifications.certificateTypes[item.category]} · {item.file.name}
        <button type="button" disabled={busy} style={{ marginLeft: 10 }} onClick={() => setSelectedFiles(current => current.filter(entry => entry !== item))}>移除</button>
      </div>)}</div>}
      <button type="button" className="btn btn-primary" disabled={busy || !selectedFiles.length} onClick={() => run(async () => {
        if (selectedFiles.some(item => item.file.size > 10 * 1024 * 1024)) throw new Error('单个文件不能超过10MB')
        if (data.certificates.length + selectedFiles.length > 20) throw new Error('附件总数不能超过20份')
        for (const item of selectedFiles) {
          const body = new FormData(); body.append('category', item.category); body.append('file', item.file)
          await request('/certificates', { method: 'POST', body })
          setSelectedFiles(current => current.filter(entry => entry !== item))
        }
      }, '附件已上传，等待核验')}>{busy ? '处理中…' : '上传所选附件'}</button>
      {data.certificates.length === 0 && <p>暂未上传附件，可稍后通过此链接继续补充。</p>}
      {data.certificates.length > 0 && <h4>已上传（{data.certificates.length}份）</h4>}
      {data.certificates.map(file => <div key={file._id} style={{ padding: '12px 0', borderBottom: '1px solid #DCE7E1' }}>
        <strong>{qualifications.certificateTypes[file.category]}</strong> · {file.name} · {{ pending: '待核验', pass: '通过', fail: '不通过' }[file.reviewStatus]}
        <button type="button" disabled={busy} style={{ marginLeft: 10 }} onClick={() => download(file)}>下载查看</button>
        {file.reviewNote && <p>核验备注：{file.reviewNote}</p>}
        {isAdmin && <div style={{ marginTop: 8 }}>
          <input aria-label={`${file.name}核验备注`} style={style} placeholder="核验备注（选填）" maxLength={500} value={notes[file._id] ?? file.reviewNote ?? ''} onChange={e => setNotes(current => ({ ...current, [file._id]: e.target.value }))}/>
          {Object.entries({ pass: '核验通过', fail: '不通过', pending: '待核实' }).map(([status, label]) => <button type="button" key={status} disabled={busy} onClick={() => run(() => request(`/certificates/${file._id}`, { method: 'PATCH', body: JSON.stringify({ status, note: notes[file._id] ?? file.reviewNote ?? '' }) }), '附件核验结果已保存')}>{label}</button>)}
        </div>}
      </div>)}
    </>}
  </section>
}
