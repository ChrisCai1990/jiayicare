import React, { useEffect, useState } from 'react'
import { adminAPI, getToken } from '../api'
import { useAdmin } from '../App'

const statusText = { proposal: '报价与协议草案', review: '待双方内部确认', confirmed: '双方已确认，待签章归档', effective: '签章文件已归档' }

export default function PlatformAgreementPage() {
  const { admin } = useAdmin()
  const platform = admin?.role === 'platformSuper'
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState(admin?.tenantId || '')
  const [item, setItem] = useState(null)
  const [prices, setPrices] = useState({})
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async id => {
    if (!id) return
    const response = await adminAPI.agreement(id)
    setItem(response.data)
    setPrices(response.data.prices || {})
  }
  useEffect(() => {
    if (platform) adminAPI.tenants().then(response => {
      const rows = response.data || []
      setTenants(rows)
      setTenantId(current => current || rows[0]?._id || '')
    }).catch(e => setError(e.message))
  }, [platform])
  useEffect(() => { load(tenantId).catch(e => setError(e.message)) }, [tenantId])

  const act = async action => {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await action()
      if (response?.data) { setItem(response.data); setPrices(response.data.prices || {}) }
      setPassword('')
      setMessage('操作已记录。请双方继续核对协议及签章文件。')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const openPdf = async () => {
    setError('')
    try {
      const response = await fetch(adminAPI.signedAgreementPdfUrl(tenantId), { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!response.ok) throw new Error('无法打开签章文件')
      const url = URL.createObjectURL(await response.blob())
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError(e.message) }
  }
  if (!platform && admin?.role !== 'superadmin') return <div className="page">仅双方超级管理员可查看合作协议。</div>
  const mine = platform ? item?.platformApproval : item?.tenantApproval
  const priceField = (key, label, suffix) => <label style={{ display: 'grid', gap: 6, minWidth: 170 }} key={key}>{label}
    <span><input type="number" min="0" max={key === 'aiServiceRatePercent' ? '100' : '1000000'} step="0.01" className="form-input" value={prices[key] ?? ''} disabled={!platform || item?.status !== 'proposal'} onChange={e => setPrices({ ...prices, [key]: e.target.value })} />{suffix}</span>
  </label>
  return <div className="page" style={{ maxWidth: 1120 }}>
    <div className="page-header"><div><h1 className="page-title">平台合作协议与收费</h1><p className="page-subtitle">甲方：杭州嘉静佑辰科技有限公司；乙方：所属健康管理机构。历史费用不追溯。</p></div></div>
    {platform && <div className="card" style={{ padding: 20, marginBottom: 16 }}><label>机构　<select className="form-input" value={tenantId} onChange={e => setTenantId(e.target.value)}>{tenants.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}</select></label></div>}
    {error && <p style={{ color: '#b42318' }}>{error}</p>}{message && <p style={{ color: '#087f5b' }}>{message}</p>}
    {item && <>
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h2>收费方案 <small style={{ color: '#667', fontSize: 14 }}>版本 {item.version || '草案'} · {statusText[item.status]}</small></h2>
        <p style={{ color: '#667' }}>建议价格供双方核对。发布后金额锁定，只有双方签章并核验归档后才按合同结算。</p>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '16px 0' }}>
          {priceField('platformMonthlyYuan', '平台订阅费（元/月）', '')}
          {priceField('aiServiceRatePercent', 'AI 供应商成本加收（%）', '')}
          {priceField('setupYuan', '一次性接入费（元）', '')}
        </div>
        {platform && item.status === 'proposal' && <button className="btn btn-primary" disabled={busy} onClick={() => act(() => adminAPI.publishAgreement(tenantId, prices))}>发布当前报价与协议版本</button>}
      </div>
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h2>协议正文</h2>
        <p style={{ color: '#667' }}>正文 SHA-256：<code>{item.documentHash}</code></p>
        <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, fontFamily: 'inherit', padding: 20, background: '#f7f9f8', borderRadius: 8, maxHeight: 620, overflow: 'auto' }}>{item.document}</pre>
        {item.status === 'proposal' && <p>当前为草案，平台发布固定版本后可由双方内部确认。</p>}
        {['review', 'confirmed'].includes(item.status) && <div style={{ borderTop: '1px solid #ddd', paddingTop: 18 }}>
          <p>甲方内部确认：{item.platformApproval?.at ? `${item.platformApproval.name} · ${new Date(item.platformApproval.at).toLocaleString('zh-CN')}` : '待确认'}</p>
          <p>乙方内部确认：{item.tenantApproval?.at ? `${item.tenantApproval.name} · ${new Date(item.tenantApproval.at).toLocaleString('zh-CN')}` : '待确认'}</p>
          {!mine?.at && item.status === 'review' && <><p>请完整阅读后输入本人 Admin 密码，记录内部确认。此操作不等于电子签章。</p>
            <input className="form-input" type="password" autoComplete="current-password" placeholder="本人 Admin 密码" value={password} onChange={e => setPassword(e.target.value)} style={{ maxWidth: 260, marginRight: 8 }} />
            <button className="btn btn-primary" disabled={busy || !password} onClick={() => act(() => adminAPI.confirmAgreement(tenantId, item.documentHash, password))}>确认本版协议</button></>}
        </div>}
      </div>
      {['confirmed', 'effective'].includes(item.status) && <div className="card" style={{ padding: 24 }}>
        <h2>双方签章 PDF</h2>
        <p>请通过可信电子签署服务签章，或上传双方盖章的完整 PDF。乙方核验文件后归档展示；系统内部确认不替代有效签章。</p>
        {item.signedPdf?.hash && <><p>文件 SHA-256：<code>{item.signedPdf.hash}</code></p><button className="btn" onClick={openPdf}>查看签章文件</button></>}
        {platform && item.status === 'confirmed' && <label style={{ display: 'block', marginTop: 14 }}>上传双方签章 PDF　<input type="file" accept="application/pdf" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) act(() => adminAPI.uploadSignedAgreement(tenantId, file)) }} /></label>}
        {!platform && item.status === 'confirmed' && item.signedPdf?.hash && <div style={{ marginTop: 15 }}><input className="form-input" type="password" autoComplete="current-password" placeholder="核验后输入本人密码" value={password} onChange={e => setPassword(e.target.value)} style={{ maxWidth: 260, marginRight: 8 }} /><button className="btn btn-primary" disabled={busy || !password} onClick={() => act(() => adminAPI.verifySignedAgreement(tenantId, item.signedPdf.hash, password))}>已核验双方签章，归档生效</button></div>}
        {item.status === 'effective' && <p>归档时间：{new Date(item.effectiveAt).toLocaleString('zh-CN')}；实际法律效力以签章文件及签署证据为准。</p>}
      </div>}
    </>}
  </div>
}
