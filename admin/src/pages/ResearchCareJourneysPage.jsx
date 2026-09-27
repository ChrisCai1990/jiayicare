import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import './ResearchCareJourneysPage.css'

const STATE = { enrolled: '进行中', withdrawn: '已撤回', locked: '已锁定' }

export default function ResearchCareJourneysPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [journeys, setJourneys] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [governanceBasis, setGovernanceBasis] = useState('')
  const [governanceReference, setGovernanceReference] = useState('')
  const [authorizationReference, setAuthorizationReference] = useState('')
  const [governanceConfirmed, setGovernanceConfirmed] = useState(false)
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false)
  const [note, setNote] = useState('')

  const enrolledCount = journeys.filter(row => row.status === 'enrolled').length
  const canEnroll = selected?.patientId && governanceBasis && governanceReference.trim()
    && authorizationReference.trim() && governanceConfirmed && authorizationConfirmed

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await adminAPI.researchJourneys(year)
      setJourneys(result.data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year])

  const startEnroll = () => {
    setSelected({ patientId: '' })
    setGovernanceBasis('')
    setGovernanceReference('')
    setAuthorizationReference('')
    setGovernanceConfirmed(false)
    setAuthorizationConfirmed(false)
    setNote('')
    setError('')
  }

  const enroll = async () => {
    if (!canEnroll || saving) return
    setSaving(true)
    setError('')
    try {
      await adminAPI.enrollResearchJourney({
        patientId: selected.patientId,
        governanceBasis,
        governanceReference,
        authorizationReference,
        governanceConfirmed,
        authorizationConfirmed,
        inclusionNote: note,
      })
      setSelected(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="research-page">
    <div className="page-header research-page-header">
      <div>
        <h1 className="page-title">WONCA 研究管理</h1>
        <p className="page-sub">管理已获授权的去标识化研究旅程</p>
      </div>
      <button className="btn btn-primary research-add-button" onClick={startEnroll}>+ 纳入参与者</button>
    </div>

    <div className="research-notice">
      <span className="research-notice-icon">⌁</span>
      <div>
        <strong>研究数据边界</strong>
        <p>仅显示已纳入的去标识化研究旅程；不会扫描、展示或导出未纳入客户，也不会改变任何客户服务。</p>
      </div>
    </div>

    <section className="card research-toolbar">
      <div className="research-filter">
        <label className="form-label" htmlFor="research-year">研究年度</label>
        <div className="research-filter-controls">
          <input id="research-year" className="form-input research-year-input" type="number" value={year} onChange={e => setYear(Number(e.target.value) || new Date().getFullYear())} />
          <button className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? '加载中…' : '刷新'}</button>
        </div>
      </div>
      <div className="research-count-card">
        <span>本年度已纳入</span>
        <strong>{enrolledCount}</strong>
        <em>位参与者</em>
      </div>
    </section>

    {error && <div className="research-error" role="alert">{error}</div>}

    <section className="card research-list-card">
      <div className="research-list-heading">
        <div>
          <h2>已纳入研究旅程</h2>
          <p>仅展示去标识化编号与研究流程进度</p>
        </div>
        <span className="research-total">共 {journeys.length} 条</span>
      </div>

      {loading ? <div className="research-empty"><div className="research-empty-icon">…</div><strong>正在加载研究旅程</strong></div>
        : journeys.length === 0 ? <div className="research-empty">
          <div className="research-empty-icon">⌘</div>
          <strong>尚未纳入参与者</strong>
          <p>完成授权和治理核验后，可将参与者纳入本年度研究队列。</p>
          <button className="btn btn-primary" onClick={startEnroll}>纳入已授权参与者</button>
        </div>
        : <div className="research-table-wrap"><table className="research-table">
          <thead><tr>{['研究编号', '参与者编码', '报告审核', 'AI 草稿', '年度方案', '随访闭环', '状态'].map(x => <th key={x}>{x}</th>)}</tr></thead>
          <tbody>{journeys.map(row => <tr key={row._id}>
            <td><span className="research-code">{row.researchNumber}</span></td>
            <td><span className="research-participant">{row.participantCode}</span></td>
            <td>{row.snapshot.report.advisorAudited}/{row.snapshot.report.total}</td>
            <td>{row.snapshot.draft.approved}/{row.snapshot.draft.total}</td>
            <td><span className={row.snapshot.annualPlan ? 'research-plan-ready' : 'research-plan-empty'}>{row.snapshot.annualPlan ? row.snapshot.annualPlan.reviewStatus : '未创建'}</span></td>
            <td>{row.snapshot.followUp.completed}/{row.snapshot.followUp.total}{row.snapshot.followUp.overdue ? <span className="research-overdue">超期 {row.snapshot.followUp.overdue}</span> : null}</td>
            <td><span className={`research-status ${row.status}`}>{STATE[row.status]}</span></td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    {selected && <div className="modal-overlay" onClick={() => !saving && setSelected(null)}>
      <section className="modal research-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div><h2 className="modal-title">纳入 WONCA 研究队列</h2><p className="research-modal-subtitle">请先完成治理与授权核验</p></div>
          <button className="modal-close" onClick={() => !saving && setSelected(null)} aria-label="关闭">×</button>
        </div>
        <div className="modal-body">
          <div className="research-modal-notice">系统仅在所有核验完成并确认纳入后，才显示该参与者的去标识化研究投影。</div>
          <div className="form-group"><label className="form-label">会员 ID</label><input className="form-input" value={selected.patientId} onChange={e => setSelected(value => ({ ...value, patientId: e.target.value.trim() }))} maxLength={64} placeholder="从会员详情页地址中复制" /></div>
          <div className="form-group"><label className="form-label">治理路径</label><select className="form-input" value={governanceBasis} onChange={e => setGovernanceBasis(e.target.value)}><option value="">请选择</option><option value="ethics_approved">伦理审批</option><option value="quality_improvement">服务质量改进</option></select></div>
          <div className="form-group"><label className="form-label">伦理批件或质量改进认定编号</label><input className="form-input" value={governanceReference} onChange={e => setGovernanceReference(e.target.value)} maxLength={200} /></div>
          <div className="form-group"><label className="form-label">数据使用授权 / 知情同意记录编号</label><input className="form-input" value={authorizationReference} onChange={e => setAuthorizationReference(e.target.value)} maxLength={200} /></div>
          <label className="research-check"><input type="checkbox" checked={governanceConfirmed} onChange={e => setGovernanceConfirmed(e.target.checked)} /><span>我已核验上述治理依据适用于本项研究</span></label>
          <label className="research-check"><input type="checkbox" checked={authorizationConfirmed} onChange={e => setAuthorizationConfirmed(e.target.checked)} /><span>我已核验该参与者的数据使用授权</span></label>
          <div className="form-group"><label className="form-label">纳入说明（可选）</label><textarea className="form-input research-note" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setSelected(null)} disabled={saving}>取消</button><button className="btn btn-primary" onClick={enroll} disabled={!canEnroll || saving}>{saving ? '正在纳入…' : '确认纳入'}</button></div>
      </section>
    </div>}
  </div>
}
