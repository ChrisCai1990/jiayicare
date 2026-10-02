import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useAdmin } from '../App'

const kindName = { guideline: '临床指南', instrument: '量表', internal: '内部规则' }
const statusName = { pending: '待健康顾问审核', clinically_reviewed: '医学审核完成，待实现发布', dismissed: '无需更新' }

export default function ClinicalStandardsPage() {
  const { admin } = useAdmin()
  const platform = admin?.role === 'platformSuper'
  const [data, setData] = useState(null)
  const [tenantId, setTenantId] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [error, setError] = useState('')
  const [checkResult, setCheckResult] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => adminAPI.clinicalStandards().then(r => {
    setData(r.data)
    setTenantId(r.data.delegatedTenantId || '')
    setReviewerId(r.data.reviewerId || '')
  }).catch(e => setError(e.message))
  useEffect(() => { load() }, [])
  const act = async fn => { setBusy(true); setError(''); try { await fn(); await load() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const confirmDelegation = () => act(() => adminAPI.delegateClinicalStandards(tenantId))
  const confirmReviewer = () => act(() => adminAPI.setClinicalStandardReviewer(reviewerId))
  const check = () => act(async () => {
    const result = await adminAPI.checkClinicalStandards()
    const rows = result.data || []
    const failures = rows.filter(row => row.outcome === 'error')
    setCheckResult(`已检查 ${rows.length} 项；${failures.length ? `${failures.length} 项检查失败，请查看目录状态` : '无检查异常'}`)
  })

  return <div className="page">
    <div className="page-header"><div><h1 className="page-title">临床标准管理</h1><p className="page-subtitle">平台监测来源并委托机构审核；受托机构指定健康顾问。医学审核不会自动修改线上算法。</p></div>{platform && <button className="btn btn-secondary" disabled={busy} onClick={check}>立即检查来源</button>}</div>
    {error && <p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    {checkResult && <p role="status">{checkResult}</p>}
    <div className="card" style={{padding:18, marginBottom:16}}>
      {platform ? <><h2 style={{fontSize:18, marginTop:0}}>委托审核机构</h2><div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}><select value={tenantId} disabled={busy} onChange={e => setTenantId(e.target.value)}><option value="">请选择机构</option>{(data?.tenants || []).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}</select><button className="btn btn-primary" disabled={busy || !tenantId || tenantId === data?.delegatedTenantId} onClick={confirmDelegation}>确认委托</button></div><p style={{fontSize:12, color:'#667085'}}>当前受托：{data?.delegatedTenantName || '尚未委托'}。确认后，由该机构管理员在机构管理中心指定健康顾问。</p></>
        : <><h2 style={{fontSize:18, marginTop:0}}>本机构审核指派</h2>{data?.canAssign ? <><div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}><select value={reviewerId} disabled={busy} onChange={e => setReviewerId(e.target.value)}><option value="">请选择健康顾问</option>{(data?.reviewers || []).map(r => <option key={r._id} value={r._id}>{r.name}{r.title ? ` · ${r.title}` : ''}</option>)}</select><button className="btn btn-primary" disabled={busy || !reviewerId || reviewerId === data?.reviewerId} onClick={confirmReviewer}>确认指派</button></div><p style={{fontSize:12, color:'#667085'}}>确认后，待审标准任务进入该健康顾问工作台。</p></> : <p>本机构尚未受平台委托审核。当前受托机构：{data?.delegatedTenantName || '无'}。</p>}</>}
    </div>
    <div className="card" style={{padding:18, marginBottom:16}}><h2 style={{fontSize:18}}>标准目录</h2><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>标准</th><th>类别 / 现行版本</th><th>监测</th><th>上次检查</th><th>状态</th></tr></thead><tbody>{(data?.standards || []).map(s => <tr key={s.id}><td><b>{s.title}</b><br/><small>{s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer">查看原始来源</a> : '内部规则或来源待核对'}</small></td><td>{kindName[s.kind]} · {s.version}</td><td>{s.monitor === 'source' ? '每周自动检查' : '人工定期核对'}</td><td>{s.watch?.checkedAt ? new Date(s.watch.checkedAt).toLocaleString('zh-CN') : '尚未检查'}</td><td>{s.watch?.lastError ? `检查失败：${s.watch.lastError}` : '—'}</td></tr>)}</tbody></table></div></div>
    <div className="card" style={{padding:18}}><h2 style={{fontSize:18}}>来源变化记录</h2>{!(data?.updates || []).length ? <p>暂无变化记录</p> : <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>标准</th><th>发现时间</th><th>状态</th><th>审核记录</th></tr></thead><tbody>{data.updates.map(u => <tr key={u._id}><td>{data.standards.find(s => s.id === u.standardId)?.title || u.standardId}</td><td>{new Date(u.detectedAt).toLocaleString('zh-CN')}</td><td>{statusName[u.status]}</td><td>{u.reviewedByName || '—'}{u.note && `：${u.note}`}</td></tr>)}</tbody></table></div>}</div>
  </div>
}
