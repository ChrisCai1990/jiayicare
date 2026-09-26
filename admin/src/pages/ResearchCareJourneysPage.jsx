import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'

const STATE = { enrolled: '进行中', withdrawn: '已撤回', locked: '已锁定' }

export default function ResearchCareJourneysPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [journeys, setJourneys] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [governanceBasis, setGovernanceBasis] = useState('')
  const [governanceReference, setGovernanceReference] = useState('')
  const [authorizationReference, setAuthorizationReference] = useState('')
  const [governanceConfirmed, setGovernanceConfirmed] = useState(false)
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false)
  const [note, setNote] = useState('')
  const load = async () => { setLoading(true); setError(''); try { const result = await adminAPI.researchJourneys(year); setJourneys(result.data || []) } catch (e) { setError(e.message) } finally { setLoading(false) } }
  useEffect(() => { load() }, [year])
  const startEnroll = () => { setSelected({ patientId: '' }); setGovernanceBasis(''); setGovernanceReference(''); setAuthorizationReference(''); setGovernanceConfirmed(false); setAuthorizationConfirmed(false); setNote(''); setError('') }
  const enroll = async () => { try { await adminAPI.enrollResearchJourney({ patientId: selected.patientId, governanceBasis, governanceReference, authorizationReference, governanceConfirmed, authorizationConfirmed, inclusionNote: note }); setSelected(null); await load() } catch (e) { setError(e.message) } }
  return <div style={{ padding: 24, maxWidth: 1280 }}>
    <h2>WONCA 研究管理</h2>
    <p>此页只显示已纳入的去标识化研究旅程，不扫描、展示或导出未纳入客户；不会自动解析报告、生成年度方案、派发随访或改变任何客户服务。</p>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0' }}><label>年度 <input type="number" value={year} onChange={e => setYear(Number(e.target.value) || new Date().getFullYear())} /></label><button onClick={load} disabled={loading}>刷新</button><button onClick={startEnroll}>纳入已授权参与者</button><span>已纳入 {journeys.filter(row => row.status === 'enrolled').length} 位</span></div>
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
    <h3 style={{ marginTop: 28 }}>已纳入研究旅程</h3>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}><thead><tr>{['研究编号', '参与者编码', '报告审核', 'AI 草稿', '年度方案', '随访闭环', '状态'].map(x => <th key={x} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #ddd' }}>{x}</th>)}</tr></thead><tbody>{journeys.map(row => <tr key={row._id}><td style={{ padding: 10, borderBottom: '1px solid #eee' }}>{row.researchNumber}</td><td>{row.participantCode}</td><td>{row.snapshot.report.advisorAudited}/{row.snapshot.report.total}</td><td>{row.snapshot.draft.approved}/{row.snapshot.draft.total}</td><td>{row.snapshot.annualPlan ? row.snapshot.annualPlan.reviewStatus : '未创建'}</td><td>{row.snapshot.followUp.completed}/{row.snapshot.followUp.total}{row.snapshot.followUp.overdue ? `，超期 ${row.snapshot.followUp.overdue}` : ''}</td><td>{STATE[row.status]}</td></tr>)}</tbody></table>
    {selected && <div style={{ position: 'fixed', inset: 0, background: '#0005', display: 'grid', placeItems: 'center' }}><section style={{ background: 'white', padding: 24, width: 'min(560px, 92vw)', display: 'grid', gap: 12 }}><h3>纳入 WONCA 研究队列</h3><p>请从会员详情页地址中复制会员 ID。系统仅在完成下列核验并成功纳入后，显示去标识化研究投影。</p><label>会员 ID <input value={selected.patientId} onChange={e => setSelected(value => ({ ...value, patientId: e.target.value.trim() }))} maxLength={64} /></label><label>治理路径 <select value={governanceBasis} onChange={e => setGovernanceBasis(e.target.value)}><option value="">请选择</option><option value="ethics_approved">伦理审批</option><option value="quality_improvement">服务质量改进</option></select></label><label>伦理批件或质量改进认定编号 <input value={governanceReference} onChange={e => setGovernanceReference(e.target.value)} maxLength={200} /></label><label>数据使用授权 / 知情同意记录编号 <input value={authorizationReference} onChange={e => setAuthorizationReference(e.target.value)} maxLength={200} /></label><label><input type="checkbox" checked={governanceConfirmed} onChange={e => setGovernanceConfirmed(e.target.checked)} /> 我已核验上述治理依据适用于本项研究</label><label><input type="checkbox" checked={authorizationConfirmed} onChange={e => setAuthorizationConfirmed(e.target.checked)} /> 我已核验该参与者的数据使用授权</label><label>纳入说明（可选）<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></label><div style={{ display: 'flex', gap: 8 }}><button onClick={enroll} disabled={!selected.patientId || !governanceBasis || !governanceReference.trim() || !authorizationReference.trim() || !governanceConfirmed || !authorizationConfirmed}>确认纳入</button><button onClick={() => setSelected(null)}>取消</button></div></section></div>}
  </div>
}
