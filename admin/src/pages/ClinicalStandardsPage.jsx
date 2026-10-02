import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'

const kindName = { guideline: '临床指南', instrument: '量表', internal: '内部规则' }
const statusName = { pending: '待健康顾问审核', clinically_reviewed: '医学审核完成，待实现发布', dismissed: '无需更新' }

export default function ClinicalStandardsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => adminAPI.clinicalStandards().then(r => setData(r.data)).catch(e => setError(e.message))
  useEffect(() => { load() }, [])
  const saveReviewer = async id => { setBusy(true); setError(''); try { await adminAPI.setClinicalStandardReviewer(id); await load() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const check = async () => { setBusy(true); setError(''); try { await adminAPI.checkClinicalStandards(); await load() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  return <div className="page"><div className="page-header"><div><h1 className="page-title">临床标准管理</h1><p className="page-subtitle">每周检查外部来源；变化自动进入指定健康顾问工作台。医学审核不会自动修改线上算法。</p></div><button className="btn btn-secondary" disabled={busy} onClick={check}>立即检查来源</button></div>
    {error && <p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    <div className="card" style={{padding:18, marginBottom:16}}><label>指定审核健康顾问　<select value={data?.reviewerId || ''} disabled={busy} onChange={e => saveReviewer(e.target.value)}><option value="">请选择</option>{(data?.reviewers || []).map(r => <option key={r._id} value={r._id}>{r.name} · {r.tenantId?.name || '机构'}</option>)}</select></label><p style={{marginBottom:0, fontSize:12, color:'#667085'}}>此指派适用于平台所有标准变化；更换后待审任务自动转入新审核人的工作台。</p></div>
    <div className="card" style={{padding:18, marginBottom:16}}><h2 style={{fontSize:18}}>标准目录</h2><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>标准</th><th>类别 / 现行版本</th><th>监测</th><th>上次检查</th><th>状态</th></tr></thead><tbody>{(data?.standards || []).map(s => <tr key={s.id}><td><b>{s.title}</b><br/><small>{s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer">查看来源</a> : '内部规则或来源待核对'}</small></td><td>{kindName[s.kind]} · {s.version}</td><td>{s.monitor === 'source' ? '每周自动检查' : '人工定期核对'}</td><td>{s.watch?.checkedAt ? new Date(s.watch.checkedAt).toLocaleString('zh-CN') : '尚未检查'}</td><td>{s.watch?.lastError ? `检查失败：${s.watch.lastError}` : '—'}</td></tr>)}</tbody></table></div></div>
    <div className="card" style={{padding:18}}><h2 style={{fontSize:18}}>来源变化记录</h2>{!(data?.updates || []).length ? <p>暂无变化记录</p> : <div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>标准</th><th>发现时间</th><th>状态</th><th>审核记录</th></tr></thead><tbody>{data.updates.map(u => <tr key={u._id}><td>{data.standards.find(s => s.id === u.standardId)?.title || u.standardId}</td><td>{new Date(u.detectedAt).toLocaleString('zh-CN')}</td><td>{statusName[u.status]}</td><td>{u.reviewedByName || '—'}{u.note && `：${u.note}`}</td></tr>)}</tbody></table></div>}</div>
  </div>
}
