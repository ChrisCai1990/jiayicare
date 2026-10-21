import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import './ResearchCareJourneysPage.css'

const STATE = { enrolled: '进行中', withdrawn: '已撤回', locked: '已锁定' }

export default function ResearchCareJourneysPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [journeys, setJourneys] = useState([])
  const [setting, setSetting] = useState(null)
  const [settingLoaded, setSettingLoaded] = useState(false)
  const [governanceReference, setGovernanceReference] = useState('')
  const [governanceConfirmed, setGovernanceConfirmed] = useState(false)
  const [settingError, setSettingError] = useState('')
  const [savingSetting, setSavingSetting] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [authorizationReference, setAuthorizationReference] = useState('')
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false)
  const [note, setNote] = useState('')

  const enrolledCount = journeys.filter(row => row.status === 'enrolled').length
  const canEnroll = selected?.patientId && selected.isAnnual && !selected.enrolled
    && authorizationReference.trim() && authorizationConfirmed && setting

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
  useEffect(() => {
    adminAPI.researchStudySetting()
      .then(result => setSetting(result.data))
      .catch(e => setSettingError(e.message))
      .finally(() => setSettingLoaded(true))
  }, [])
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setCandidates([])
      setSearching(false)
      return
    }
    let active = true
    const timer = setTimeout(async () => {
      setSearching(true)
      setModalError('')
      try {
        const result = await adminAPI.researchCandidates(query.trim())
        if (active) setCandidates(result.data || [])
      } catch (e) {
        if (active) setModalError(e.message)
      } finally {
        if (active) setSearching(false)
      }
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [query, open])

  const saveSetting = async () => {
    if (!governanceReference.trim() || !governanceConfirmed || savingSetting) return
    setSavingSetting(true)
    setSettingError('')
    try {
      const result = await adminAPI.saveResearchStudySetting({ governanceReference, governanceConfirmed })
      setSetting(result.data)
    } catch (e) {
      setSettingError(e.message)
    } finally {
      setSavingSetting(false)
    }
  }

  const startEnroll = () => {
    setOpen(true)
    setQuery('')
    setCandidates([])
    setSelected(null)
    setAuthorizationReference('')
    setAuthorizationConfirmed(false)
    setNote('')
    setModalError('')
  }

  const enroll = async () => {
    if (!canEnroll || saving) return
    setSaving(true)
    setModalError('')
    try {
      await adminAPI.enrollResearchJourney({
        patientId: selected.patientId,
        authorizationReference,
        authorizationConfirmed,
        inclusionNote: note,
      })
      setOpen(false)
      await load()
    } catch (e) {
      setModalError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="research-page">
    <div className="page-header research-page-header">
      <div>
        <h1 className="page-title">WONCA 服务流程研究</h1>
        <p className="page-sub">先纳入年度管理客户，再记录标准化服务流程的完成情况</p>
      </div>
      <button className="btn btn-primary research-add-button" onClick={startEnroll} disabled={!setting}>+ 纳入客户</button>
    </div>

    <div className="research-notice">
      <span className="research-notice-icon">⌁</span>
      <div>
        <strong>使用范围</strong>
        <p>纳入不改变客户现有服务；研究列表仅展示参与者编码和流程进度。客户搜索仅供超级管理员核对身份。</p>
      </div>
    </div>

    {settingLoaded && !setting && <section className="card research-setting">
      <h2>先登记一次项目依据</h2>
      <p>填写机构确认本项目资料使用的记录位置或编号。此处只记录依据，不预设伦理审批或质量改进类别。</p>
      {settingError && <div className="research-error" role="alert">{settingError}</div>}
      <div className="form-group"><label className="form-label" htmlFor="research-governance">机构依据记录位置或编号</label>
        <input id="research-governance" className="form-input" value={governanceReference} onChange={e => setGovernanceReference(e.target.value)} maxLength={200} placeholder="例如内部项目确认记录的编号或存放位置" /></div>
      <label className="research-check"><input type="checkbox" checked={governanceConfirmed} onChange={e => setGovernanceConfirmed(e.target.checked)} /><span>我已核对该依据适用于本项目的资料使用</span></label>
      <button className="btn btn-primary" disabled={!governanceReference.trim() || !governanceConfirmed || savingSetting} onClick={saveSetting}>{savingSetting ? '保存中…' : '保存项目依据'}</button>
    </section>}
    {setting && <div className="research-setting-done">项目依据已记录于 {new Date(setting.verifiedAt).toLocaleDateString('zh-CN')}，客户纳入时无需重复填写。</div>}
    {!settingLoaded && <div className="research-setting-done">正在核对项目设置…</div>}

    <section className="card research-toolbar">
      <div className="research-filter">
        <label className="form-label" htmlFor="research-year">流程观察年度</label>
        <div className="research-filter-controls">
          <input id="research-year" className="form-input research-year-input" type="number" value={year} onChange={e => setYear(Number(e.target.value) || new Date().getFullYear())} />
          <button className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? '加载中…' : '刷新'}</button>
        </div>
      </div>
      <div className="research-count-card"><span>当前队列</span><strong>{enrolledCount}</strong><em>位客户</em></div>
    </section>

    {error && <div className="research-error" role="alert">{error}</div>}
    <section className="card research-list-card">
      <div className="research-list-heading"><div><h2>已纳入客户的服务旅程</h2><p>仅展示去标识化编号与所选年度的流程进度</p></div><span className="research-total">共 {journeys.length} 条</span></div>
      {loading ? <div className="research-empty"><strong>正在加载研究旅程</strong></div>
        : journeys.length === 0 ? <div className="research-empty"><div className="research-empty-icon">⌘</div><strong>尚未纳入客户</strong><p>项目依据登记后，搜索并选择名单中的年度管理客户。</p><button className="btn btn-primary" onClick={startEnroll} disabled={!setting}>纳入客户</button></div>
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

    {open && <div className="modal-overlay" onClick={() => !saving && setOpen(false)}>
      <section className="modal research-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header"><div><h2 className="modal-title">纳入年度管理客户</h2><p className="research-modal-subtitle">从名单中查找，核验授权记录后纳入</p></div><button className="modal-close" onClick={() => !saving && setOpen(false)} aria-label="关闭">×</button></div>
        <div className="modal-body">
          {modalError && <div className="research-error" role="alert">{modalError}</div>}
          <div className="form-group"><label className="form-label" htmlFor="research-candidate-search">姓名或手机号</label><input id="research-candidate-search" className="form-input" autoFocus value={query} onChange={e => { setQuery(e.target.value); setSelected(null) }} placeholder="输入至少两个字符搜索现有客户" /></div>
          {query.trim().length >= 2 && <div className="research-candidates">
            {searching ? <p>正在查找…</p> : candidates.length === 0 ? <p>未找到客户，请核对姓名或手机号。</p>
              : candidates.map(candidate => <button type="button" key={candidate.patientId} className={`research-candidate ${selected?.patientId === candidate.patientId ? 'selected' : ''}`} onClick={() => setSelected(candidate)} disabled={candidate.enrolled || !candidate.isAnnual}>
                <span><strong>{candidate.name}</strong><small>{candidate.phone || '无手机号'} · {candidate.servicePackage || '未标注服务包'}</small></span>
                <em>{candidate.enrolled ? '已纳入' : candidate.isAnnual ? '年度客户' : '非年度客户'}</em>
              </button>)}
          </div>}
          {selected && <div className="research-selected">已选择：{selected.name}（{selected.phone || '无手机号'}）</div>}
          <div className="form-group"><label className="form-label" htmlFor="research-authorization">该客户授权记录位置或编号</label><input id="research-authorization" className="form-input" value={authorizationReference} onChange={e => setAuthorizationReference(e.target.value)} maxLength={200} placeholder="填写可追溯的签署记录或资料位置" /></div>
          <label className="research-check"><input type="checkbox" checked={authorizationConfirmed} onChange={e => setAuthorizationConfirmed(e.target.checked)} /><span>我已核验该客户的数据使用授权覆盖本项目</span></label>
          <div className="form-group"><label className="form-label" htmlFor="research-note">纳入说明（可选）</label><textarea id="research-note" className="form-input research-note" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={saving}>取消</button><button className="btn btn-primary" onClick={enroll} disabled={!canEnroll || saving}>{saving ? '正在纳入…' : '确认纳入'}</button></div>
      </section>
    </div>}
  </div>
}
